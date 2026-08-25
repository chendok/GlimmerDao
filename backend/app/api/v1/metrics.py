"""Agent 评估指标 API 路由（P3-2）

提供自主性与任务质量评估报告，用于监控 Agent 运行效果。
需要管理员/登录身份访问（指标为聚合数据，不含敏感用户内容）。
"""
import logging

from fastapi import APIRouter, Depends, Query

from ..deps import get_current_user_id
from ...core.agent.metrics import metrics_collector
from ...core.agent.learner import adaptive_learner

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/overview")
async def get_overview(user_id: int = Depends(get_current_user_id)):
    """获取指标总览（近 24 小时 + 近 7 天）"""
    return await metrics_collector.get_overview()


@router.get("/autonomy")
async def get_autonomy_report(
    days: int = Query(7, ge=1, le=90, description="评估时间范围（天）"),
    user_id: int = Depends(get_current_user_id),
):
    """获取自主性评估报告"""
    return await metrics_collector.evaluate_autonomy(days=days)


@router.get("/quality")
async def get_quality_report(
    days: int = Query(7, ge=1, le=90, description="评估时间范围（天）"),
    user_id: int = Depends(get_current_user_id),
):
    """获取任务质量评估报告"""
    return await metrics_collector.evaluate_quality(days=days)


@router.get("/skill/{skill_name}/config")
async def get_skill_optimal_config(
    skill_name: str,
    user_id: int = Depends(get_current_user_id),
):
    """
    获取指定技能的最优配置建议（P3-1 自适应学习）。

    基于历史执行记录分析：推荐工具、预估迭代、常见模式、失败点、成功率。
    """
    return await adaptive_learner.get_optimal_config(skill_name)


@router.get("/skill/{skill_name}/summary")
async def get_skill_summary(
    skill_name: str,
    user_id: int = Depends(get_current_user_id),
):
    """获取指定技能的执行摘要"""
    return await adaptive_learner.get_skill_summary(skill_name)
