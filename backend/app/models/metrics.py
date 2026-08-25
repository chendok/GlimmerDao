"""Agent 执行记录模型

持久化每次 Agent 执行的关键指标，供：
- P3-1 AdaptiveLearner 自适应学习（从历史记录分析最优配置）
- P3-2 MetricsCollector 评估指标采集（自主性 / 任务质量报告）

设计原则：
- 仅存储脱敏后的元数据（user_input 截断预览，不存完整内容）
- tools_used / reflector_decisions 用 JSON 列存储
- user_followed_up 采用延迟评估：用户后续追问时由 learner 标记
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey

from .user import Base


class AgentExecutionRecord(Base):
    """Agent 单次执行记录"""
    __tablename__ = "agent_execution_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        String(64),
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id = Column(Integer, nullable=True, index=True)
    skill_name = Column(String(64), nullable=True, index=True)

    # 输入元数据（脱敏：仅存预览与长度，不存完整内容）
    user_input_preview = Column(String(256), nullable=True)
    input_length = Column(Integer, default=0)
    context_data_present = Column(Boolean, default=False)

    # 工具使用
    tools_used = Column(JSON, nullable=True, default=list)  # ["bazi_calculate", ...]
    tool_count = Column(Integer, default=0)

    # 执行过程
    iterations = Column(Integer, default=0)
    response_length = Column(Integer, default=0)
    execution_time_ms = Column(Integer, default=0)
    has_error = Column(Boolean, default=False, index=True)
    error_message = Column(Text, nullable=True)

    # 规划与反思（P1-2）
    planner_used = Column(Boolean, default=False)
    plan_complexity = Column(String(20), nullable=True)  # simple | moderate | complex
    reflector_decisions = Column(JSON, nullable=True, default=list)  # ["continue","complete"]

    # 延迟评估：用户是否在后续追问（用于首次响应满意率指标）
    # None=未评估 / True=用户追问（可能不满意）/ False=未追问（视为满意）
    user_followed_up = Column(Boolean, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
