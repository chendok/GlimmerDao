"""Pydantic 数据模型"""
from pydantic import BaseModel, Field
from typing import Optional, Any


class ChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., description="用户消息内容")
    session_id: Optional[str] = Field(None, description="会话ID")
    model_mode: Optional[str] = Field("fast", description="模型模式: fast | think")
    skill_id: Optional[str] = Field(None, description="Skill ID: bazi_analysis | ziwei_analysis | general_chat")
    context_data: Optional[str] = Field(None, description="上下文数据（JSON 字符串，如八字/紫微排盘结果）")


class ChatResponse(BaseModel):
    """聊天响应"""
    session_id: str
    response: str
    thinking: Optional[str] = None
    error: Optional[str] = None


class SessionInfo(BaseModel):
    """会话信息"""
    id: str
    created_at: str
    updated_at: Optional[str] = None
    message_count: int
    preview: Optional[str] = None
    title: Optional[str] = None


class SessionListResponse(BaseModel):
    """会话列表响应（支持分页与搜索）"""
    sessions: list[SessionInfo]
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
    has_more: bool = False


class MessageInfo(BaseModel):
    """单条消息信息"""
    id: int
    role: str
    content: str
    thinking: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None
    tool_results: Optional[list[dict[str, Any]]] = None
    created_at: str


class SessionMessagesResponse(BaseModel):
    """会话消息详情响应"""
    session_id: str
    messages: list[MessageInfo]
    total: int