"""用户画像 / 长期记忆数据库模型

跨会话记忆用户偏好，实现个性化命理咨询。
对应规范 P2-2：用户画像 / 长期记忆。
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from .user import Base


class UserProfile(Base):
    """
    用户画像 - 跨会话持久化的用户偏好与长期记忆

    字段设计对应规范 6.2.2 UserProfile：
    - preferred_depth: 偏好深度 brief | detailed | comprehensive
    - preferred_style: 偏好风格 professional | casual | academic
    - interested_topics: 感兴趣的话题（如 ["八字", "流年", "姻缘"]）
    - birth_data: 缓存的生辰数据（从 context_data 自动提取），格式：
        {"birth_date": "1990-01-01", "birth_hour": 8, "gender": "male",
         "calendar_type": "solar", "name": "可选姓名"}
    - frequent_skills: 高频使用的技能（按使用频次降序，最多保留 5 个）
    - feedback_history: 最近的用户反馈记录（最多保留 20 条）
    - total_sessions: 累计会话数（用于判断新老用户）
    """
    __tablename__ = "user_profiles"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    preferred_depth = Column(String(20), nullable=False, default="detailed")
    preferred_style = Column(String(20), nullable=False, default="professional")
    interested_topics = Column(JSON, nullable=True, default=list)
    birth_data = Column(JSON, nullable=True)
    frequent_skills = Column(JSON, nullable=True, default=list)
    feedback_history = Column(JSON, nullable=True, default=list)
    total_sessions = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="profile", lazy="selectin")


# 预设枚举（仅作文档与校验参考，不强制 DB 约束以便后续扩展）
VALID_DEPTHS = ("brief", "detailed", "comprehensive")
VALID_STYLES = ("professional", "casual", "academic")
