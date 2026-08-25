"""聊天会话与消息持久化模型"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index, JSON
from sqlalchemy.orm import relationship

from .user import Base


class ChatSession(Base):
    """聊天会话 - 持久化的会话元数据"""
    __tablename__ = "chat_sessions"

    id = Column(String(64), primary_key=True)  # UUID，与内存中 session_id 一致
    user_id = Column(Integer, nullable=True, index=True)  # 匿名用户为 NULL
    title = Column(String(128), nullable=True)  # 会话标题（首条用户消息截断）
    preview = Column(String(256), nullable=True)  # 最近一条消息预览
    message_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.id",
    )


class ChatMessage(Base):
    """聊天消息 - 完整的对话历史"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        String(64),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(16), nullable=False)  # 'user' | 'assistant'
    content = Column(Text, nullable=False, default="")
    thinking = Column(Text, nullable=True)  # 推理过程（仅 assistant）
    tool_calls = Column(JSON, nullable=True)  # [{name, args}]
    tool_results = Column(JSON, nullable=True)  # [{name, output}]
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    session = relationship("ChatSession", back_populates="messages")


# 复合索引：用户 + 创建时间倒序（用于分页查询）
Index("ix_chat_sessions_user_created", ChatSession.user_id, ChatSession.created_at.desc())