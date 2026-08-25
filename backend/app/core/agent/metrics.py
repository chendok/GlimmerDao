"""
MetricsCollector - Agent 评估指标采集器（P3-2）

职责：
基于 agent_execution_records 表，生成两类评估报告：
1. 自主性评估（autonomy）：自主决策率、主动探索、障碍恢复、计划调整、资源效率
2. 任务质量评估（quality）：首次响应满意率、平均响应时间、技能分布、错误率

设计原则：
- 只读分析，不写入（写入由 AdaptiveLearner.record_execution 负责）
- 所有指标容错，DB 异常返回零值报告
- 支持时间范围筛选（默认近 7 天）
"""
import logging
from datetime import datetime, timedelta
from typing import Any
from collections import Counter

from ...models.metrics import AgentExecutionRecord

logger = logging.getLogger(__name__)


class MetricsCollector:
    """Agent 指标采集器 - 生成自主性与任务质量评估报告"""

    async def evaluate_autonomy(
        self, days: int = 7
    ) -> dict[str, Any]:
        """
        生成自主性评估报告（规范 6.3.1）。

        指标：
        - autonomous_decision_rate: 无错误完成任务的比例（目标 ≥ 70%）
        - proactive_exploration_count: 复杂任务平均工具调用次数（目标 ≥ 1）
        - obstacle_recovery_rate: 错误后仍成功完成的比例（近似：同会话错误→成功的转移率）
        - plan_adjustment_rate: reflector 给出 adjust 后仍成功的比例（目标 ≥ 40%）
        - resource_efficiency: 平均 tool_count / iterations（目标 ≥ 80%，即工具调用大多有效）
        """
        try:
            from ...database import async_session
            from sqlalchemy import select, func

            since = datetime.utcnow() - timedelta(days=days)
            async with async_session() as db:
                stmt = select(AgentExecutionRecord).where(
                    AgentExecutionRecord.created_at >= since
                )
                result = await db.execute(stmt)
                records = result.scalars().all()

            total = len(records)
            if total == 0:
                return self._empty_autonomy(days)

            # 自主决策率：无错误完成
            success = [r for r in records if not r.has_error]
            autonomous_rate = len(success) / total

            # 主动探索：复杂任务的平均工具调用次数
            complex_records = [
                r for r in records if r.plan_complexity == "complex"
            ]
            proactive_count = (
                sum(r.tool_count or 0 for r in complex_records) / len(complex_records)
                if complex_records else 0.0
            )

            # 障碍恢复率：同会话内"错误记录后紧接成功记录"的比例
            recovery_rate = self._calc_recovery_rate(records)

            # 计划调整率：reflector_decisions 含 adjust 且最终无错误的比例
            adjust_records = [
                r for r in records
                if r.reflector_decisions and "adjust" in (r.reflector_decisions or [])
            ]
            if adjust_records:
                adjust_success = [r for r in adjust_records if not r.has_error]
                plan_adjust_rate = len(adjust_success) / len(adjust_records)
            else:
                plan_adjust_rate = 0.0

            # 资源利用效率：tool_count / iterations（迭代越多但工具越少=低效）
            efficiencies = []
            for r in success:
                iters = r.iterations or 0
                if iters > 0:
                    efficiencies.append((r.tool_count or 0) / iters)
            resource_efficiency = (
                sum(efficiencies) / len(efficiencies) if efficiencies else 0.0
            )

            return {
                "time_range_days": days,
                "total_executions": total,
                "autonomous_decision_rate": round(autonomous_rate, 3),
                "proactive_exploration_count": round(proactive_count, 2),
                "obstacle_recovery_rate": round(recovery_rate, 3),
                "plan_adjustment_rate": round(plan_adjust_rate, 3),
                "resource_efficiency": round(resource_efficiency, 3),
                "targets": {
                    "autonomous_decision_rate": ">= 0.70",
                    "proactive_exploration_count": ">= 1.0 (complex tasks)",
                    "obstacle_recovery_rate": ">= 0.60",
                    "plan_adjustment_rate": ">= 0.40",
                    "resource_efficiency": ">= 0.80",
                },
            }
        except Exception as e:
            logger.warning(f"自主性评估失败: {e}")
            return self._empty_autonomy(days)

    @staticmethod
    def _calc_recovery_rate(records: list) -> float:
        """计算障碍恢复率：按会话分组，错误记录后紧接成功记录的转移比例。"""
        by_session: dict[str, list] = {}
        for r in records:
            by_session.setdefault(r.session_id or "", []).append(r)
        # 每个会话内按 id 排序
        recoverable = 0
        error_count = 0
        for sid, recs in by_session.items():
            if not sid:
                continue
            recs.sort(key=lambda x: x.id)
            for i, r in enumerate(recs):
                if r.has_error:
                    error_count += 1
                    # 检查后续是否紧接一条成功记录
                    for nxt in recs[i + 1:]:
                        if not nxt.has_error:
                            recoverable += 1
                            break
                        # 连续错误只算一次恢复机会
                        break
        return recoverable / error_count if error_count else 0.0

    async def evaluate_quality(
        self, days: int = 7
    ) -> dict[str, Any]:
        """
        生成任务质量评估报告（规范 6.3.2）。

        指标：
        - first_response_satisfaction: 用户未追问的比例（目标 ≥ 75%）
        - avg_response_time_ms: 平均执行时间（目标 ≤ 2000ms）
        - avg_response_length: 平均响应长度
        - error_rate: 错误率
        - skill_distribution: 各技能执行次数分布
        """
        try:
            from ...database import async_session
            from sqlalchemy import select

            since = datetime.utcnow() - timedelta(days=days)
            async with async_session() as db:
                stmt = select(AgentExecutionRecord).where(
                    AgentExecutionRecord.created_at >= since
                )
                result = await db.execute(stmt)
                records = result.scalars().all()

            total = len(records)
            if total == 0:
                return self._empty_quality(days)

            # 首次响应满意率：user_followed_up=False 的比例（已评估记录中）
            evaluated = [r for r in records if r.user_followed_up is not None]
            if evaluated:
                satisfied = [r for r in evaluated if r.user_followed_up is False]
                satisfaction_rate = len(satisfied) / len(evaluated)
            else:
                satisfaction_rate = 0.0

            # 平均响应时间
            times = [r.execution_time_ms or 0 for r in records]
            avg_time = sum(times) / total if total else 0

            # 平均响应长度
            lengths = [r.response_length or 0 for r in records]
            avg_length = sum(lengths) / total if total else 0

            # 错误率
            errors = [r for r in records if r.has_error]
            error_rate = len(errors) / total

            # 技能分布
            skill_counter: Counter = Counter()
            for r in records:
                skill_counter[r.skill_name or "unknown"] += 1
            skill_distribution = [
                {"skill": name, "count": cnt, "pct": round(cnt / total, 3)}
                for name, cnt in skill_counter.most_common()
            ]

            return {
                "time_range_days": days,
                "total_executions": total,
                "evaluated_count": len(evaluated),
                "first_response_satisfaction": round(satisfaction_rate, 3),
                "avg_response_time_ms": round(avg_time, 0),
                "avg_response_length": round(avg_length, 0),
                "error_rate": round(error_rate, 3),
                "skill_distribution": skill_distribution,
                "targets": {
                    "first_response_satisfaction": ">= 0.75",
                    "avg_response_time_ms": "<= 2000",
                    "error_rate": "<= 0.10",
                },
            }
        except Exception as e:
            logger.warning(f"质量评估失败: {e}")
            return self._empty_quality(days)

    async def get_overview(self) -> dict[str, Any]:
        """获取指标总览（仪表盘用）"""
        try:
            autonomy_7d = await self.evaluate_autonomy(days=7)
            quality_7d = await self.evaluate_quality(days=7)
            autonomy_1d = await self.evaluate_autonomy(days=1)
            return {
                "last_24h": {
                    "total_executions": autonomy_1d["total_executions"],
                    "autonomous_decision_rate": autonomy_1d["autonomous_decision_rate"],
                    "error_rate": 1 - autonomy_1d["autonomous_decision_rate"],
                },
                "last_7d": {
                    "autonomy": autonomy_7d,
                    "quality": quality_7d,
                },
                "generated_at": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            logger.warning(f"生成指标总览失败: {e}")
            return {"error": str(e), "generated_at": datetime.utcnow().isoformat()}

    @staticmethod
    def _empty_autonomy(days: int) -> dict[str, Any]:
        return {
            "time_range_days": days,
            "total_executions": 0,
            "autonomous_decision_rate": 0.0,
            "proactive_exploration_count": 0.0,
            "obstacle_recovery_rate": 0.0,
            "plan_adjustment_rate": 0.0,
            "resource_efficiency": 0.0,
            "targets": {},
        }

    @staticmethod
    def _empty_quality(days: int) -> dict[str, Any]:
        return {
            "time_range_days": days,
            "total_executions": 0,
            "evaluated_count": 0,
            "first_response_satisfaction": 0.0,
            "avg_response_time_ms": 0,
            "avg_response_length": 0,
            "error_rate": 0.0,
            "skill_distribution": [],
            "targets": {},
        }


# 全局单例
metrics_collector = MetricsCollector()
