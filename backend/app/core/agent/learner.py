"""
AdaptiveLearner - 自适应学习器（P3-1）

职责：
1. 记录每次 Agent 执行的关键指标到 agent_execution_records 表
2. 延迟评估用户满意度：用户后续追问时标记上一条记录
3. 从历史记录中分析最优执行配置（推荐工具、预估迭代、常见模式、失败点）

设计原则：
- 所有方法容错：DB 异常不影响主对话流程
- 记录写入采用 fire-and-forget（不阻塞响应），分析查询按需调用
- 分析基于滑动窗口（默认近 100 条同技能记录），避免全表扫描
"""
import logging
from datetime import datetime
from typing import Any
from collections import Counter

from ...models.metrics import AgentExecutionRecord

logger = logging.getLogger(__name__)

# 分析窗口：每个技能最多分析近 N 条记录
_ANALYSIS_WINDOW = 100
# 输入预览最大长度（脱敏）
_INPUT_PREVIEW_LEN = 200


class AdaptiveLearner:
    """自适应学习器 - 从执行记录中学习优化策略"""

    async def record_execution(self, record: dict[str, Any]) -> int | None:
        """
        记录单次执行。返回记录 ID（可用于后续更新）。

        record 字段：
            session_id, user_id, skill_name, user_input, input_length,
            context_data_present, tools_used, tool_count, iterations,
            response_length, execution_time_ms, has_error, error_message,
            planner_used, plan_complexity, reflector_decisions
        """
        try:
            from ...database import async_session
            from sqlalchemy import select

            # 延迟评估：若同会话已有上一条记录，标记其为"用户追问"
            session_id = record.get("session_id")
            if session_id:
                await self._mark_previous_followed_up(session_id)

            preview = (record.get("user_input") or "")[:_INPUT_PREVIEW_LEN]
            rec = AgentExecutionRecord(
                session_id=session_id,
                user_id=record.get("user_id"),
                skill_name=record.get("skill_name"),
                user_input_preview=preview,
                input_length=record.get("input_length", 0),
                context_data_present=bool(record.get("context_data_present")),
                tools_used=record.get("tools_used") or [],
                tool_count=record.get("tool_count", 0),
                iterations=record.get("iterations", 0),
                response_length=record.get("response_length", 0),
                execution_time_ms=record.get("execution_time_ms", 0),
                has_error=bool(record.get("has_error")),
                error_message=record.get("error_message"),
                planner_used=bool(record.get("planner_used")),
                plan_complexity=record.get("plan_complexity"),
                reflector_decisions=record.get("reflector_decisions") or [],
                user_followed_up=None,
            )
            async with async_session() as db:
                db.add(rec)
                await db.commit()
                await db.refresh(rec)
                return rec.id
        except Exception as e:
            logger.warning(f"记录执行指标失败: {e}")
            return None

    async def _mark_previous_followed_up(self, session_id: str) -> None:
        """标记同会话上一条未评估记录为"用户追问"（延迟满意度评估）"""
        try:
            from ...database import async_session
            from sqlalchemy import select, update

            async with async_session() as db:
                # 找到该会话最近一条 user_followed_up IS NULL 的记录
                stmt = (
                    select(AgentExecutionRecord)
                    .where(
                        AgentExecutionRecord.session_id == session_id,
                        AgentExecutionRecord.user_followed_up.is_(None),
                    )
                    .order_by(AgentExecutionRecord.id.desc())
                    .limit(1)
                )
                result = await db.execute(stmt)
                prev = result.scalar_one_or_none()
                if prev is not None:
                    prev.user_followed_up = True
                    await db.commit()
        except Exception as e:
            logger.warning(f"标记追问状态失败: {e}")

    async def mark_session_ended(self, session_id: str) -> None:
        """
        会话结束时调用：将该会话最后一条未评估记录标记为"未追问"（视为满意）。
        用于在会话超时或显式结束时完成满意度评估。
        """
        try:
            from ...database import async_session
            from sqlalchemy import select

            async with async_session() as db:
                stmt = (
                    select(AgentExecutionRecord)
                    .where(
                        AgentExecutionRecord.session_id == session_id,
                        AgentExecutionRecord.user_followed_up.is_(None),
                    )
                    .order_by(AgentExecutionRecord.id.desc())
                    .limit(1)
                )
                result = await db.execute(stmt)
                last = result.scalar_one_or_none()
                if last is not None:
                    last.user_followed_up = False
                    await db.commit()
        except Exception as e:
            logger.warning(f"标记会话结束失败: {e}")

    async def get_optimal_config(
        self, skill_name: str, user_input: str | None = None
    ) -> dict[str, Any]:
        """
        基于历史执行记录，返回该技能的最优配置建议。

        返回：
            recommended_tools: 成功率最高的工具组合（按频次降序）
            estimated_iterations: 成功执行的中位迭代次数
            common_patterns: 常见工具调用序列
            failure_points: 高错误率的工具/输入特征
            success_rate: 该技能的历史成功率
            sample_size: 分析样本数
        """
        try:
            from ...database import async_session
            from sqlalchemy import select, func, case

            async with async_session() as db:
                # 取近 N 条同技能记录
                stmt = (
                    select(AgentExecutionRecord)
                    .where(AgentExecutionRecord.skill_name == skill_name)
                    .order_by(AgentExecutionRecord.id.desc())
                    .limit(_ANALYSIS_WINDOW)
                )
                result = await db.execute(stmt)
                records = result.scalars().all()

            if not records:
                return self._empty_config()

            total = len(records)
            success_records = [r for r in records if not r.has_error]
            success_rate = len(success_records) / total if total else 0.0

            # 推荐工具：成功记录中使用频次最高的工具
            tool_counter: Counter = Counter()
            for r in success_records:
                for t in (r.tools_used or []):
                    tool_counter[t] += 1
            recommended_tools = [
                {"name": name, "frequency": count}
                for name, count in tool_counter.most_common(5)
            ]

            # 预估迭代次数：成功记录的中位数
            iters = sorted(r.iterations or 0 for r in success_records)
            if iters:
                mid = len(iters) // 2
                estimated_iterations = iters[mid]
            else:
                estimated_iterations = 1

            # 常见工具序列（去重后的 tools_used 列表转为元组）
            seq_counter: Counter = Counter()
            for r in success_records:
                tools = tuple(r.tools_used or [])
                if tools:
                    seq_counter[tools] += 1
            common_patterns = [
                {"sequence": list(seq), "count": cnt}
                for seq, cnt in seq_counter.most_common(3)
            ]

            # 失败点：错误记录中的工具分布
            fail_records = [r for r in records if r.has_error]
            fail_tool_counter: Counter = Counter()
            for r in fail_records:
                for t in (r.tools_used or []):
                    fail_tool_counter[t] += 1
            failure_points = [
                {"tool": name, "error_count": cnt}
                for name, cnt in fail_tool_counter.most_common(3)
            ]

            return {
                "recommended_tools": recommended_tools,
                "estimated_iterations": estimated_iterations,
                "common_patterns": common_patterns,
                "failure_points": failure_points,
                "success_rate": round(success_rate, 3),
                "sample_size": total,
            }
        except Exception as e:
            logger.warning(f"获取最优配置失败 skill={skill_name}: {e}")
            return self._empty_config()

    @staticmethod
    def _empty_config() -> dict[str, Any]:
        return {
            "recommended_tools": [],
            "estimated_iterations": 1,
            "common_patterns": [],
            "failure_points": [],
            "success_rate": 0.0,
            "sample_size": 0,
        }

    async def get_skill_summary(self, skill_name: str | None = None) -> dict[str, Any]:
        """获取技能执行摘要（用于自适应学习的快速概览）"""
        try:
            from ...database import async_session
            from sqlalchemy import select, func, case

            async with async_session() as db:
                if skill_name:
                    stmt = select(
                        func.count(AgentExecutionRecord.id).label("total"),
                        func.sum(
                            case((AgentExecutionRecord.has_error == False, 1), else_=0)
                        ).label("success"),
                        func.avg(AgentExecutionRecord.iterations).label("avg_iters"),
                        func.avg(AgentExecutionRecord.execution_time_ms).label("avg_time"),
                        func.avg(AgentExecutionRecord.tool_count).label("avg_tools"),
                    ).where(AgentExecutionRecord.skill_name == skill_name)
                else:
                    stmt = select(
                        func.count(AgentExecutionRecord.id).label("total"),
                        func.sum(
                            case((AgentExecutionRecord.has_error == False, 1), else_=0)
                        ).label("success"),
                        func.avg(AgentExecutionRecord.iterations).label("avg_iters"),
                        func.avg(AgentExecutionRecord.execution_time_ms).label("avg_time"),
                        func.avg(AgentExecutionRecord.tool_count).label("avg_tools"),
                    )
                result = await db.execute(stmt)
                row = result.one()
                total = row.total or 0
                success = row.success or 0
                return {
                    "skill_name": skill_name or "all",
                    "total_executions": total,
                    "success_count": success,
                    "success_rate": round(success / total, 3) if total else 0.0,
                    "avg_iterations": round(float(row.avg_iters or 0), 2),
                    "avg_execution_time_ms": round(float(row.avg_time or 0), 0),
                    "avg_tool_count": round(float(row.avg_tools or 0), 2),
                }
        except Exception as e:
            logger.warning(f"获取技能摘要失败: {e}")
            return {
                "skill_name": skill_name or "all",
                "total_executions": 0,
                "success_count": 0,
                "success_rate": 0.0,
                "avg_iterations": 0,
                "avg_execution_time_ms": 0,
                "avg_tool_count": 0,
            }


# 全局单例
adaptive_learner = AdaptiveLearner()
