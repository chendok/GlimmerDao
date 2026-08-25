"""
LangGraph Agent 引擎 - 基于 Loop Engineer 设计思想

架构层次：
  ┌─────────────────────────────────────────────┐
  │              Agent Harness (调度层)           │
  │  ┌─────────┐  ┌──────────┐  ┌───────────┐  │
  │  │ Session │  │Permission│  │ Compaction│  │
  │  │ Manager │  │  Manager │  │  Manager  │  │
  │  └────┬────┘  └────┬─────┘  └─────┬─────┘  │
  ├───────┼────────────┼──────────────┼─────────┤
  │       │      Agent Loop (执行层)    │         │
  │  ┌────┴───────────────────────────┴──────┐  │
  │  │  User → Think → Act → Observe → Reply │  │
  │  │    ↑                                  │  │
  │  │    └──────── Loop ◄───────────────────┘  │
  │  └────────────────────────────────────────┘  │
  ├─────────────────────────────────────────────┤
  │              Tool System (工具层)             │
  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
  │  │ 排盘 │ │ 知识 │ │ 搜索 │ │  自定义   │  │
  │  └──────┘ └──────┘ └──────┘ └──────────┘  │
  └─────────────────────────────────────────────┘
"""

import uuid
import json
import asyncio
import logging
from typing import Annotated, Any, TypedDict, Literal
from datetime import datetime

from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

from langchain_core.messages import (
    BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
)
from langchain_core.tools import BaseTool

from ...config import settings
from .profile import profile_manager as _profile_manager
from .learner import adaptive_learner as _adaptive_learner

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 报告响应后处理：去除 LLM 的对话式前言
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import re as _re

# 报告型响应的常见对话式前言模式（这些文本不应出现在最终报告中）
_REPORT_PREAMBLE_PATTERNS = [
    _re.compile(r'^好的[，,。.]?\s*'),
    _re.compile(r'^收到[，,。.]?\s*'),
    _re.compile(r'^我将严格遵循.*?为您生成.*?报告[。.]?\s*', _re.DOTALL),
    _re.compile(r'^以下(?:是|为).*?报告[：:]\s*', _re.DOTALL),
    _re.compile(r'^根据.*?我将.*?生成.*?报告[。.]?\s*', _re.DOTALL),
    _re.compile(r'^以下是.*?(?:分析|报告|解盘).*?[：:]\s*', _re.DOTALL),
    _re.compile(r'^我来.*?分析.*?[。.]?\s*', _re.DOTALL),
    _re.compile(r'^好的[，,。.]?我将.*?[。.]?\s*', _re.DOTALL),
]


def _strip_report_preamble(text: str) -> str:
    """
    去除报告内容开头的对话式前言。

    报告型 LLM 响应常以"好的，l。我将严格遵循..."等对话式前言开头，
    移除这些内容，确保最终报告从第一个 Markdown 标题（#）开始。

    策略：
    1. 若文本以 # 开头（Markdown 标题），无需处理，直接返回
    2. 尝试匹配已知的前言模式并移除
    3. 若仍有前言残留，查找第一个 # 标题并截断之前的内容
    """
    if not text or not text.strip():
        return text

    stripped = text.strip()

    # 1. 若以 Markdown 标题开头，直接返回
    if stripped.startswith('#'):
        return stripped

    # 2. 尝试匹配已知前言模式
    matched = False
    for pattern in _REPORT_PREAMBLE_PATTERNS:
        new_text = pattern.sub('', stripped, count=1)
        if new_text != stripped:
            stripped = new_text.strip()
            matched = True
            break

    # 3. 若仍然不以 # 开头，查找第一个 # 标题并截断
    if not stripped.startswith('#'):
        heading_match = _re.search(r'(?m)^#+\s', stripped)
        if heading_match:
            # 截取从第一个标题开始的内容
            stripped = stripped[heading_match.start():].strip()
            if matched or heading_match.start() > 0:
                logger.info(
                    "[preamble_strip] 已去除报告前言，截断位置: %d, 保留内容长度: %d",
                    heading_match.start(),
                    len(stripped),
                )

    return stripped


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Agent State
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AgentState(TypedDict):
    """Agent 状态 - Loop Engineer 核心状态定义"""
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    iteration_count: int
    thinking: str
    current_tool: str | None
    tool_results: list[dict[str, Any]]
    final_response: str | None
    error: str | None
    # P1-2: 自主规划与反思
    plan: dict[str, Any]       # Planner 生成的执行计划
    reflection: str            # Reflector 最新决策: continue | complete | adjust
    # 模型模式：fast（快速响应）| think（深度思考）
    model_mode: str


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Session Manager
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SessionManager:
    """会话管理器 - 管理多轮对话状态（内存 + 数据库双层持久化）"""

    def __init__(self):
        self._sessions: dict[str, dict[str, Any]] = {}
        self._checkpointer = MemorySaver()

    def create_session(
        self,
        session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        sid = session_id or str(uuid.uuid4())
        self._sessions[sid] = {
            "id": sid,
            "created_at": datetime.now().isoformat(),
            "message_count": 0,
            "metadata": metadata or {},
        }
        # 异步持久化到数据库（不阻塞主流程）
        try:
            asyncio.get_event_loop().create_task(self._db_create_session(sid, metadata))
        except RuntimeError:
            # 无事件循环时跳过 DB 持久化
            pass
        return sid

    async def _db_create_session(self, sid: str, metadata: dict[str, Any] | None) -> None:
        """在数据库中创建会话记录"""
        try:
            from ...database import async_session
            from ...models.chat import ChatSession

            owner_id = (metadata or {}).get("owner_id")
            async with async_session() as db:
                existing = await db.get(ChatSession, sid)
                if existing:
                    # 会话已存在：若 DB 记录为匿名（user_id=None）而当前有 owner_id，则认领
                    if existing.user_id is None and owner_id is not None:
                        existing.user_id = owner_id
                        await db.commit()
                    return
                session = ChatSession(
                    id=sid,
                    user_id=owner_id,
                    title="新对话",
                    preview=None,
                    message_count=0,
                )
                db.add(session)
                await db.commit()
        except Exception as e:
            logger.warning(f"DB 创建会话失败: {e}")

    async def _db_bind_owner(self, sid: str, owner_id: int) -> None:
        """将会话的 DB 记录绑定到指定 owner（用于匿名会话认领）"""
        try:
            from ...database import async_session
            from ...models.chat import ChatSession

            async with async_session() as db:
                session = await db.get(ChatSession, sid)
                if session and session.user_id is None:
                    session.user_id = owner_id
                    await db.commit()
        except Exception as e:
            logger.warning(f"DB 绑定 owner 失败: {e}")

    async def claim_anonymous_sessions(self, owner_id: int) -> int:
        """将所有匿名会话（user_id=None）认领到指定用户。返回认领的会话数。"""
        claimed = 0
        try:
            from ...database import async_session
            from ...models.chat import ChatSession
            from sqlalchemy import select

            async with async_session() as db:
                result = await db.execute(
                    select(ChatSession).where(ChatSession.user_id.is_(None))
                )
                anon_sessions = result.scalars().all()
                for s in anon_sessions:
                    s.user_id = owner_id
                    claimed += 1
                if claimed > 0:
                    await db.commit()

            # 同步更新内存中的会话元数据
            for sess in self._sessions.values():
                meta = sess.get("metadata", {})
                if meta.get("owner_id") is None:
                    meta["owner_id"] = owner_id
        except Exception as e:
            logger.warning(f"DB 认领匿名会话失败: {e}")
        return claimed

    async def _db_save_message(
        self,
        sid: str,
        role: str,
        content: str,
        thinking: str | None = None,
        tool_calls: list | None = None,
        tool_results: list | None = None,
    ) -> None:
        """保存单条消息到数据库并更新会话元数据"""
        try:
            from ...database import async_session
            from ...models.chat import ChatSession, ChatMessage

            async with async_session() as db:
                # 确保会话记录存在（防止 _db_create_session 未执行完）
                session = await db.get(ChatSession, sid)
                if not session:
                    session = ChatSession(
                        id=sid,
                        user_id=None,
                        title="新对话",
                        preview=None,
                        message_count=0,
                    )
                    db.add(session)
                    await db.flush()

                # 插入消息
                msg = ChatMessage(
                    session_id=sid,
                    role=role,
                    content=content or "",
                    thinking=thinking,
                    tool_calls=tool_calls,
                    tool_results=tool_results,
                )
                db.add(msg)
                await db.flush()  # 获取 msg.id

                # 更新会话元数据
                # 用户消息作为标题（截断到 32 字符）
                if role == "user" and (not session.title or session.title == "新对话"):
                    session.title = content[:32] if content else "新对话"
                # 更新预览（最近一条消息）
                session.preview = (content or "")[:64]
                # 原子自增消息数（避免全表 COUNT 的竞态与性能开销）
                session.message_count = (session.message_count or 0) + 1
                await db.commit()
        except Exception as e:
            logger.warning(f"DB 保存消息失败: {e}")

    async def _db_get_messages(self, sid: str, limit: int | None = None) -> list[dict[str, Any]]:
        """
        从数据库获取会话的消息。

        :param limit: 若指定，仅返回最近 limit 条消息（按时间正序返回），
                      用于多轮对话历史注入时控制上下文长度。
        """
        try:
            from ...database import async_session
            from ...models.chat import ChatMessage
            from sqlalchemy import select

            async with async_session() as db:
                stmt = select(ChatMessage).where(ChatMessage.session_id == sid)
                if limit:
                    # 取最近 limit 条：先按 id 倒序取 limit，再反转为正序
                    stmt = stmt.order_by(ChatMessage.id.desc()).limit(limit)
                    result = await db.execute(stmt)
                    msgs = list(reversed(result.scalars().all()))
                else:
                    stmt = stmt.order_by(ChatMessage.id.asc())
                    result = await db.execute(stmt)
                    msgs = result.scalars().all()
                return [
                    {
                        "id": m.id,
                        "role": m.role,
                        "content": m.content or "",
                        "thinking": m.thinking,
                        "tool_calls": m.tool_calls,
                        "tool_results": m.tool_results,
                        "created_at": m.created_at.isoformat() if m.created_at else "",
                    }
                    for m in msgs
                ]
        except Exception as e:
            logger.warning(f"DB 获取消息失败: {e}")
            return []

    async def _db_list_sessions(
        self,
        owner_id: int | None = None,
        page: int = 1,
        page_size: int = 20,
        query: str | None = None,
    ) -> dict[str, Any]:
        """从数据库分页查询会话列表（支持搜索）"""
        try:
            from ...database import async_session
            from ...models.chat import ChatSession
            from sqlalchemy import select, func, or_

            async with async_session() as db:
                stmt = select(ChatSession)
                count_stmt = select(func.count(ChatSession.id))

                if owner_id is not None:
                    stmt = stmt.where(ChatSession.user_id == owner_id)
                    count_stmt = count_stmt.where(ChatSession.user_id == owner_id)
                else:
                    # 匿名用户：仅返回 user_id 为 NULL 的会话
                    stmt = stmt.where(ChatSession.user_id.is_(None))
                    count_stmt = count_stmt.where(ChatSession.user_id.is_(None))

                if query:
                    like_pattern = f"%{query}%"
                    cond = or_(
                        ChatSession.title.like(like_pattern),
                        ChatSession.preview.like(like_pattern),
                    )
                    stmt = stmt.where(cond)
                    count_stmt = count_stmt.where(cond)

                # 总数
                total = (await db.execute(count_stmt)).scalar() or 0

                # 分页
                offset = (page - 1) * page_size
                stmt = (
                    stmt.order_by(ChatSession.updated_at.desc())
                    .offset(offset)
                    .limit(page_size)
                )
                result = await db.execute(stmt)
                sessions = result.scalars().all()

                return {
                    "sessions": [
                        {
                            "id": s.id,
                            "created_at": s.created_at.isoformat() if s.created_at else "",
                            "updated_at": s.updated_at.isoformat() if s.updated_at else "",
                            "message_count": s.message_count or 0,
                            "preview": s.preview,
                            "title": s.title,
                        }
                        for s in sessions
                    ],
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 1,
                    "has_more": (offset + page_size) < total,
                }
        except Exception as e:
            logger.warning(f"DB 列出会话失败: {e}")
            return {
                "sessions": [],
                "total": 0,
                "page": page,
                "page_size": page_size,
                "total_pages": 1,
                "has_more": False,
            }

    # ── 公开的 DB 查询委托方法（供 API 层调用，避免跨模块访问私有方法）──

    async def list_sessions(
        self,
        owner_id: int | None = None,
        page: int = 1,
        page_size: int = 20,
        query: str | None = None,
    ) -> dict[str, Any]:
        """分页查询会话列表（公开委托）"""
        return await self._db_list_sessions(owner_id, page, page_size, query)

    async def get_messages(self, sid: str, limit: int | None = None) -> list[dict[str, Any]]:
        """获取会话消息（公开委托）"""
        return await self._db_get_messages(sid, limit)

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self._sessions.get(session_id)

    def update_session(self, session_id: str, **kwargs):
        if session_id in self._sessions:
            self._sessions[session_id].update(kwargs)

    def can_access(self, session_id: str, owner_id: int | None) -> bool:
        session = self.get_session(session_id)
        if not session:
            return True

        session_owner = session.get("metadata", {}).get("owner_id")
        if session_owner is None:
            return True
        return session_owner == owner_id

    def bind_owner(self, session_id: str, owner_id: int | None) -> None:
        if owner_id is None or session_id not in self._sessions:
            return

        session = self._sessions[session_id]
        metadata = dict(session.get("metadata", {}))
        already_owner = metadata.get("owner_id")
        metadata.setdefault("owner_id", owner_id)
        session["metadata"] = metadata

        # 同步更新 DB 记录（仅当内存中之前未绑定时，避免重复 DB 写入）
        if already_owner is None:
            try:
                asyncio.get_event_loop().create_task(self._db_bind_owner(session_id, owner_id))
            except RuntimeError:
                pass

    def delete_session(self, session_id: str, owner_id: int | None = None) -> bool:
        if not self.can_access(session_id, owner_id):
            return False
        removed = self._sessions.pop(session_id, None) is not None
        # 异步清理数据库记录
        try:
            asyncio.get_event_loop().create_task(self._db_delete_session(session_id))
        except RuntimeError:
            pass
        return removed

    def clear_all(self, owner_id: int | None = None) -> int:
        """清除内存中属于指定用户的所有会话，返回清除数量"""
        if owner_id is not None:
            to_remove = [
                sid for sid, s in self._sessions.items()
                if s.get("metadata", {}).get("owner_id") == owner_id
            ]
        else:
            to_remove = [
                sid for sid, s in self._sessions.items()
                if s.get("metadata", {}).get("owner_id") is None
            ]
        for sid in to_remove:
            self._sessions.pop(sid, None)
        return len(to_remove)

    async def _db_delete_session(self, sid: str) -> None:
        """从数据库删除会话及其所有消息（级联）"""
        try:
            from ...database import async_session
            from ...models.chat import ChatSession

            async with async_session() as db:
                session = await db.get(ChatSession, sid)
                if session:
                    await db.delete(session)
                    await db.commit()
        except Exception as e:
            logger.warning(f"DB 删除会话失败: {e}")

    @property
    def checkpointer(self) -> MemorySaver:
        return self._checkpointer


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Permission Manager
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class PermissionManager:
    """权限管理器 - 控制工具调用权限"""

    def __init__(self):
        self._safe_tools: set[str] = {
            "bazi_calculate", "calculate",
        }
        self._confirm_tools: set[str] = {
            "bazi_export", "bazi_save", "delete_data",
        }

    def is_safe(self, tool_name: str) -> bool:
        return tool_name in self._safe_tools

    def needs_confirm(self, tool_name: str) -> bool:
        return tool_name in self._confirm_tools

    def check(self, tool_name: str) -> Literal["allow", "confirm", "deny"]:
        if self.is_safe(tool_name):
            return "allow"
        if self.needs_confirm(tool_name):
            return "confirm"
        return "deny"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Compaction Manager
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CompactionManager:
    """
    上下文压缩管理器 - 智能压缩对话历史。

    提供两种压缩模式：
    - compact(): 异步，使用 LLM 对历史消息生成结构化摘要，保留关键信息
                 （排盘数据、分析结论等），避免简单截断造成的信息丢失。
    - compact_sync(): 同步快速截断（无 LLM），用作图节点内的安全兜底。

    压缩策略：
    1. 分离 SystemMessage（含 skill 指南与上下文数据，永不丢弃）
    2. 保留最近 N 条消息（约占 50% token 预算）
    3. 对更早的历史消息调用 LLM 生成摘要，注入为 SystemMessage
    """

    # 摘要 prompt：保留核心命理数据与结论，信息密集
    _SUMMARY_PROMPT = """请将以下对话历史压缩为结构化摘要，严格保留：
1. 用户的核心问题与意图
2. 已获取的关键数据（如排盘结果：四柱、日主、格局、五行分布、大运等）
3. 已得出的分析结论
4. 待解决或待澄清的问题

要求：简洁、信息密集，不超过 400 字。不要编造未提及的数据。

对话历史：
{conversation}"""

    def __init__(self, max_tokens: int = 8000, summary_llm=None):
        self.max_tokens = max_tokens
        # 用于摘要的 LLM；缺省时 compact() 退化为截断（仍安全可用）
        self.summary_llm = summary_llm

    def estimate_tokens(self, messages: list[BaseMessage]) -> int:
        """估算消息列表的 token 数。

        中文约 1 字符 ≈ 1.3 token，ASCII 约 4 字符 ≈ 1 token。
        采用加权启发式以修正原 `len//4` 对中文的低估。
        """
        total = 0
        for m in messages:
            content = str(m.content)
            cjk = sum(1 for c in content if '\u4e00' <= c <= '\u9fff')
            other = len(content) - cjk
            total += int(cjk * 1.3 + other * 0.25)
        return total

    def should_compact(self, messages: list[BaseMessage]) -> bool:
        """判断是否需要压缩：估算 token 超过上限的 80%"""
        return self.estimate_tokens(messages) > self.max_tokens * 0.8

    def _split_recent(
        self, other_msgs: list[BaseMessage], budget: int
    ) -> tuple[list[BaseMessage], list[BaseMessage]]:
        """按 token 预算从末尾保留最近消息，返回 (recent, historical)"""
        kept: list[BaseMessage] = []
        token_count = 0
        for msg in reversed(other_msgs):
            t = self.estimate_tokens([msg])
            if token_count + t > budget:
                break
            kept.insert(0, msg)
            token_count += t
        split = len(other_msgs) - len(kept)
        return kept, other_msgs[:split]

    def compact_sync(self, messages: list[BaseMessage]) -> list[BaseMessage]:
        """同步快速压缩（无 LLM）：保留 SystemMessage + 最近消息，用作图节点内兜底"""
        system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
        other_msgs = [m for m in messages if not isinstance(m, SystemMessage)]
        recent, _ = self._split_recent(other_msgs, int(self.max_tokens * 0.7))
        return system_msgs + recent

    async def compact(self, messages: list[BaseMessage]) -> list[BaseMessage]:
        """异步智能压缩：LLM 摘要历史消息，保留关键信息"""
        system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
        other_msgs = [m for m in messages if not isinstance(m, SystemMessage)]

        recent_budget = int(self.max_tokens * 0.5)
        recent, historical = self._split_recent(other_msgs, recent_budget)

        # 无历史可摘要，或无摘要 LLM 时退化为同步截断
        if not historical or self.summary_llm is None:
            return system_msgs + recent

        try:
            summary = await self._summarize(historical)
            summary_msg = SystemMessage(content=f"## 对话历史摘要\n{summary}")
            return system_msgs + [summary_msg] + recent
        except Exception as e:
            logger.warning(f"智能压缩摘要失败，退化为截断: {e}")
            return self.compact_sync(messages)

    async def _summarize(self, messages: list[BaseMessage]) -> str:
        """调用 LLM 生成对话历史摘要"""
        conversation = "\n\n".join(
            f"{'用户' if isinstance(m, HumanMessage) else '助手'}: {m.content}"
            for m in messages
            if not isinstance(m, SystemMessage)
        )
        prompt = self._SUMMARY_PROMPT.format(conversation=conversation)
        response = await self.summary_llm.ainvoke([HumanMessage(content=prompt)])
        return str(response.content)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Agent Harness (核心调度器)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AgentHarness:
    """
    Agent Harness - 核心调度器

    实现 Claude Code 风格的 Agent Loop：
    1. Think: LLM 推理下一步行动
    2. Act: 执行工具调用
    3. Observe: 观察工具结果
    4. Loop: 重复直到任务完成
    """

    def __init__(
        self,
        llm,
        tools: list[BaseTool],
        system_prompt: str = "",
        max_iterations: int = 10,
        summary_llm=None,
        think_llm=None,
    ):
        self.llm = llm
        # 思考模式 LLM：用于深度思考场景（缺省复用快速模式 LLM）
        self.think_llm = think_llm or llm
        self.tools = tools
        self.tools_by_name = {t.name: t for t in tools}
        self.system_prompt = system_prompt
        self.max_iterations = max_iterations
        self.session_manager = SessionManager()
        self.permission_manager = PermissionManager()
        # 辅助 LLM：用于规划/反思/摘要（缺省复用快速模式 LLM，可注入更廉价模型降成本）
        self.aux_llm = summary_llm or llm
        # 智能压缩
        self.compaction_manager = CompactionManager(
            max_tokens=settings.MAX_CONVERSATION_TOKENS,
            summary_llm=self.aux_llm,
        )
        # 用户画像 / 长期记忆（P2-2）
        self.profile_manager = _profile_manager
        self.enable_profile = settings.ENABLE_USER_PROFILE
        # 自适应学习 / 指标采集（P3-1 / P3-2）
        self.adaptive_learner = _adaptive_learner
        self.enable_learning = settings.ENABLE_LEARNING

        # 绑定工具到 LLM（快速模式）
        self.llm_with_tools = llm.bind_tools(tools)
        # 绑定工具到思考模式 LLM
        self.think_llm_with_tools = self.think_llm.bind_tools(tools)

        # 构建 LangGraph
        self.graph = self._build_graph()

    def reload_llm(self, llm=None, think_llm=None) -> None:
        """热更新 LLM 实例（不重建 Graph，仅替换底层 LLM 引用）

        供系统管理模块「大模型」页签在激活新配置后立即生效使用。
        缺省参数（None）表示该模式 LLM 保持不变。
        """
        if llm is not None:
            # 记录 aux_llm 是否复用旧 fast_llm（用于判断是否需要同步更新）
            aux_uses_fast = self.aux_llm is self.llm
            self.llm = llm
            self.llm_with_tools = llm.bind_tools(self.tools)
            if aux_uses_fast:
                self.aux_llm = llm
            logger.info("[harness] 快速模式 LLM 已热更新: %s", getattr(llm, "model_name", "unknown"))
        if think_llm is not None:
            self.think_llm = think_llm
            self.think_llm_with_tools = think_llm.bind_tools(self.tools)
            logger.info("[harness] 思考模式 LLM 已热更新: %s", getattr(think_llm, "model_name", "unknown"))

    def _build_graph(self) -> StateGraph:
        """构建 LangGraph 状态图（按配置启用 Planner / Reflector 节点）"""
        workflow = StateGraph(AgentState)

        # 核心节点
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", ToolNode(self.tools))
        workflow.add_node("finalize", self._finalize_node)

        use_planner = settings.ENABLE_PLANNER
        use_reflector = settings.ENABLE_REFLECTOR

        # ── 入口：Planner（可选）──
        if use_planner:
            workflow.add_node("planner", self._planner_node)
            workflow.set_entry_point("planner")
            workflow.add_edge("planner", "agent")
        else:
            workflow.set_entry_point("agent")

        # ── agent 路由：有工具调用 → tools；无 → finalize；错误/超限 → END ──
        workflow.add_conditional_edges(
            "agent",
            self._router,
            {"continue": "tools", "finalize": "finalize", "end": END},
        )

        # ── 工具执行后：Reflector（可选）或直接回 agent ──
        if use_reflector:
            workflow.add_node("reflector", self._reflector_node)
            workflow.add_edge("tools", "reflector")
            workflow.add_conditional_edges(
                "reflector",
                self._reflector_router,
                {"continue": "agent", "complete": "finalize"},
            )
        else:
            workflow.add_edge("tools", "agent")

        workflow.add_edge("finalize", END)
        return workflow.compile(checkpointer=self.session_manager.checkpointer)

    def prepare_session(
        self,
        session_id: str | None = None,
        user_id: int | None = None,
    ) -> tuple[str, bool]:
        """为请求创建或绑定会话，并校验会话访问权限。

        返回 (session_id, is_new_session)。is_new_session 用于画像会话计数，
        避免同一会话多轮对话被重复计数。
        """
        sid = session_id or str(uuid.uuid4())

        if sid not in self.session_manager._sessions:
            self.session_manager.create_session(
                sid,
                metadata={"owner_id": user_id} if user_id is not None else {},
            )
            return sid, True

        if not self.session_manager.can_access(sid, user_id):
            raise PermissionError("无权访问该会话")

        self.session_manager.bind_owner(sid, user_id)
        return sid, False

    def _agent_node(self, state: AgentState) -> dict[str, Any]:
        """
        Agent 节点 - Think 阶段

        调用 LLM 进行推理，决定下一步行动。
        """
        messages = state["messages"]
        iteration = state.get("iteration_count", 0)

        # 超过最大迭代次数，强制结束
        if iteration >= self.max_iterations:
            return {
                "thinking": "已达到最大推理步数，将基于已有信息给出回答。",
                "final_response": "force_stop",
            }

        # 上下文压缩检查（图节点内使用同步快速截断作为安全兜底；
        # 深度 LLM 摘要已在 run/stream 入口完成）
        if self.compaction_manager.should_compact(messages):
            messages = self.compaction_manager.compact_sync(messages)

        # P1-2: 注入执行计划指引（Planner 生成的分步计划，若有）
        plan = state.get("plan")
        if plan and plan.get("steps"):
            plan_guidance = SystemMessage(
                content=f"## 执行计划\n{json.dumps(plan, ensure_ascii=False)}"
                "\n请按计划逐步执行，可根据工具结果灵活调整。"
            )
            messages = [plan_guidance] + list(messages)

        # 根据模型模式选择对应的 LLM
        # fast：使用快速模式 LLM（响应快、成本低）
        # think：使用思考模式 LLM（深度思考、质量高）
        model_mode = state.get("model_mode", "fast")
        current_llm_with_tools = self.think_llm_with_tools if model_mode == "think" else self.llm_with_tools

        # SystemMessage（含 skill 指南与用户上下文数据）已由 run/stream
        # 注入到 messages 中，此处直接调用 LLM，避免重复注入基础系统指令。
        response = current_llm_with_tools.invoke(messages)

        return {
            "messages": [response],
            "iteration_count": iteration + 1,
            "thinking": response.content if isinstance(response, AIMessage) else "",
        }

    def _router(self, state: AgentState) -> Literal["continue", "finalize", "end"]:
        """
        路由决策 - 决定下一步执行路径

        - 有 tool_calls → continue (执行工具)
        - 无 tool_calls → finalize (生成最终回复)
        - 有错误 → end
        """
        if state.get("error"):
            return "end"

        if state.get("final_response") == "force_stop":
            return "finalize"

        messages = state["messages"]
        last_message = messages[-1] if messages else None

        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            # 权限检查
            for tc in last_message.tool_calls:
                perm = self.permission_manager.check(tc["name"])
                if perm == "deny":
                    return "finalize"
            return "continue"

        return "finalize"

    def _finalize_node(self, state: AgentState) -> dict[str, Any]:
        """最终节点 - 生成用户回复"""
        messages = state["messages"]
        last_message = messages[-1] if messages else None

        if isinstance(last_message, AIMessage) and not last_message.tool_calls:
            return {"final_response": last_message.content}

        # 如果最后消息有 tool_calls 或需要生成最终回复
        final_prompt = SystemMessage(
            content="基于以上所有工具调用结果，生成一个完整、友好的中文回复给用户。"
        )
        final_messages = [final_prompt] + list(messages)
        response = self.llm.invoke(final_messages)
        return {"final_response": response.content}

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Planner & Reflector (P1-2 自主规划与反思)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    _PLANNER_PROMPT = """你是命理 Agent 的任务规划器。分析用户请求，生成简洁的执行计划。

输出严格 JSON（不要 markdown 代码块、不要多余文字）：
{"intent": "用户意图一句话", "steps": [{"id": 1, "action": "calculate|search|analyze|synthesize", "description": "步骤说明"}], "needs_tools": true, "complexity": "simple|moderate|complex"}

规则：
- 简单问题（单个知识问答、寒暄）返回空 steps、complexity=simple。
- 需要排盘计算 → action=calculate；查询知识 → search；综合分析 → synthesize。
- 对于报告生成/解盘分析类任务：用户指令中如果有明确列出的多个阶段，请在 steps 中逐一反映，不要过度简化合并。例如用户列出了14个分析阶段，steps 就应包含14个对应步骤。
- 不要编造工具名，工具由系统自动绑定。"""

    _REFLECTOR_PROMPT = """你是命理 Agent 的反思评估器。评估工具执行结果是否满足执行计划。

执行计划：
{plan}

最近工具结果（摘要）：
{tool_results}

当前迭代轮次：{iteration}

判断当前进展，输出严格 JSON（不要 markdown、不要多余文字）：
{{"decision": "continue|complete|adjust", "reasoning": "简短理由"}}

规则：
- "complete"：计划所有步骤已完成，工具结果足以给出最终回答。
- "continue"：还需更多工具调用或推理。
- "adjust"：工具出错或结果不符预期，需调整策略（仍继续执行）。
- 宁可保守选 continue，只在确信完成时选 complete。"""

    async def _planner_node(self, state: AgentState) -> dict[str, Any]:
        """规划节点 - 分析用户意图，生成分步执行计划（图入口，仅运行一次）"""
        messages = state["messages"]
        user_msg = next(
            (m for m in reversed(messages) if isinstance(m, HumanMessage)), None
        )
        user_input = user_msg.content if user_msg else ""

        # 简单查询跳过 LLM 规划（降低延迟）：短输入或明显单轮问答
        if not user_input or len(user_input) < 8 or self._is_simple_query(user_input):
            return {"plan": {"intent": user_input[:50], "steps": [], "complexity": "simple"}}

        plan = await self._generate_plan(user_input)
        return {"plan": plan}

    def _is_simple_query(self, text: str) -> bool:
        """启发式判断是否为简单查询（无需规划）"""
        simple_markers = ["你好", "在吗", "谢谢", "是什么", "什么是"]
        return any(m in text for m in simple_markers) and len(text) < 20

    async def _generate_plan(self, user_input: str) -> dict[str, Any]:
        """调用 LLM 生成执行计划"""
        default = {"intent": user_input[:50], "steps": [], "complexity": "simple"}
        try:
            response = await self.aux_llm.ainvoke([
                SystemMessage(content=self._PLANNER_PROMPT),
                HumanMessage(content=user_input),
            ])
            plan = self._parse_json_response(response.content, default)
            # 规范化字段
            if "steps" not in plan:
                plan["steps"] = []
            return plan
        except Exception as e:
            logger.warning(f"Planner 生成计划失败，使用空计划: {e}")
            return default

    async def _reflector_node(self, state: AgentState) -> dict[str, Any]:
        """反思节点 - 评估工具结果，决定继续/完成/调整"""
        plan = state.get("plan") or {}
        tool_results = state.get("tool_results") or []
        iteration = state.get("iteration_count", 0)

        # 安全阀：接近最大迭代时强制完成，避免死循环
        if iteration >= self.max_iterations - 1:
            return {"reflection": "complete"}

        # 无计划或简单任务：默认继续，交由 agent 自行决定
        if not plan or not plan.get("steps"):
            return {"reflection": "continue"}

        decision = await self._reflect(plan, tool_results, iteration)
        return {"reflection": decision}

    async def _reflect(self, plan: dict, tool_results: list, iteration: int) -> str:
        """调用 LLM 评估执行进展，返回决策字符串"""
        try:
            plan_str = json.dumps(plan, ensure_ascii=False)
            recent = tool_results[-3:] if tool_results else []
            tools_str = json.dumps(recent, ensure_ascii=False, default=str)[:1000]
            prompt = self._REFLECTOR_PROMPT.format(
                plan=plan_str, tool_results=tools_str, iteration=iteration
            )
            response = await self.aux_llm.ainvoke([HumanMessage(content=prompt)])
            result = self._parse_json_response(response.content, default={"decision": "continue"})
            decision = str(result.get("decision", "continue")).lower()
            if decision not in ("continue", "complete", "adjust"):
                decision = "continue"
            return decision
        except Exception as e:
            logger.warning(f"Reflector 反思失败，默认继续: {e}")
            return "continue"

    def _reflector_router(self, state: AgentState) -> Literal["continue", "complete"]:
        """反思路由：complete → finalize；continue/adjust → agent"""
        if state.get("reflection") == "complete":
            return "complete"
        return "continue"

    @staticmethod
    def _parse_json_response(text: str, default: dict) -> dict:
        """从 LLM 响应中解析 JSON（容忍 markdown 代码块与前后多余文字）"""
        if not text:
            return default
        import re as _re
        cleaned = _re.sub(r"```(?:json)?\s*", "", text).strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        m = _re.search(r"\{.*\}", cleaned, _re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        return default

    def _build_effective_system_prompt(
        self,
        skill_prompt: str = "",
        outline: list[dict] | None = None,
        base_system_prompt: str | None = None,
    ) -> str:
        """构建有效的 System Prompt = 基础指令 + Skill 指令

        报告生成场景下，仅包含：
        - 基础系统提示词（可通过 base_system_prompt 覆盖）
        - 当前 Skill 技能指南
        排盘数据与报告目录结构通过用户消息注入，用户画像和历史对话已移除。
        """
        parts = [base_system_prompt or self.system_prompt]
        if skill_prompt:
            parts.append(f"\n\n## 当前任务指南\n{skill_prompt}")
        return "\n".join(parts)

    @staticmethod
    def _build_context_message(context_data: str) -> SystemMessage | None:
        """
        将排盘/占卜/择吉上下文数据构建为 SystemMessage。

        对话场景下，专题表单的计算结果通过此消息注入到 LLM，
        确保回答与当前排盘结果保持一致。
        """
        if not context_data or not context_data.strip():
            return None
        return SystemMessage(
            content=(
                "## 当前排盘/占卜/择吉上下文（本次分析的唯一数据源）\n\n"
                "以下是用户当前专题的计算结果数据。回答用户问题时必须严格基于以下数据，"
                "不得引入与该数据矛盾的外部信息；若数据缺失某个信息，应如实说明，不要臆造。\n\n"
                f"{context_data.strip()}"
            )
        )

    async def generate_suggestions(
        self,
        user_input: str,
        assistant_response: str,
    ) -> list[str]:
        """
        单独调用一次 LLM 生成推荐问题（追问引导）。

        在回答完成后异步调用，返回 3 个可点击的追问问题。
        使用 aux_llm（辅助 LLM），失败时静默返回空列表，不影响主流程。
        """
        if not assistant_response or not assistant_response.strip():
            return []
        try:
            from .prompts import SUGGESTION_PROMPT

            # 截断过长的回答，避免超出上下文
            resp_preview = assistant_response[:2000]
            prompt = SUGGESTION_PROMPT.format(
                user_input=user_input[:500],
                assistant_response=resp_preview,
            )
            response = await self.aux_llm.ainvoke([HumanMessage(content=prompt)])
            raw = str(response.content).strip()

            # 提取 JSON 数组（容错：去除可能包裹的 markdown 代码块）
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            # 定位 JSON 数组边界
            start = raw.find("[")
            end = raw.rfind("]")
            if start == -1 or end == -1 or end <= start:
                logger.warning("[suggestions] 未解析到 JSON 数组: %s", raw[:200])
                return []
            parsed = json.loads(raw[start:end + 1])
            if not isinstance(parsed, list):
                return []
            result = [str(x).strip() for x in parsed if str(x).strip()]
            return result[:3]
        except Exception as e:
            logger.warning("[suggestions] 生成推荐问题失败: %s", e)
            return []

    @staticmethod
    def _render_outline_to_prompt(outline: list[dict] | None) -> str:
        """将 outline 树渲染为注入到 system prompt 的 Markdown 文本"""
        if not outline:
            return ""

        def _render(nodes: list[dict], depth: int = 0) -> str:
            lines: list[str] = []
            for idx, node in enumerate(nodes, start=1):
                indent = "  " * depth
                title = node.get("title", "")
                lines.append(f"{indent}{idx}. {title}")
                children = node.get("children") or []
                if children:
                    child_md = _render(children, depth + 1)
                    if child_md:
                        lines.append(child_md)
            return "\n".join(lines)

        rendered = _render(outline)
        if not rendered:
            return ""
        return (
            "\n\n## 报告目录结构（用户自定义，必须严格按此结构生成）\n"
            "请严格按照以下目录结构组织报告章节。可在每个章节下自由展开内容，"
            "但顶层章节标题、顺序、嵌套层级必须与此结构一致，不得增减顶层章节：\n\n"
            f"{rendered}"
        )

    def _build_history_messages(self, db_messages: list[dict[str, Any]]) -> list[BaseMessage]:
        """
        将数据库中的消息记录转换为 LangChain BaseMessage 列表，
        用于多轮对话历史注入。

        - 仅保留 user / assistant 角色（system 角色不存入 DB）
        - 跳过空内容消息
        - 返回的消息按时间正序排列，置于 SystemMessage 之后、本轮 HumanMessage 之前
        """
        msgs: list[BaseMessage] = []
        for m in db_messages:
            role = m.get("role")
            content = m.get("content", "") or ""
            if not content:
                continue
            if role == "user":
                msgs.append(HumanMessage(content=content))
            elif role == "assistant":
                msgs.append(AIMessage(content=content))
        return msgs

    async def _prepare_user_profile(
        self, user_id: int | None, context_data: str, skill_name: str | None
    ) -> dict[str, Any] | None:
        """
        P2-2: 加载用户画像并合并本轮可推断的长期记忆。

        - 读取已有画像（偏好/生辰/高频技能/会话数）
        - 从 context_data 自动提取生辰数据；若与缓存不同则更新（避免重复询问生辰）
        - 返回用于注入 System Prompt 的画像 dict（匿名用户返回 None）
        """
        if not self.enable_profile or user_id is None:
            return None

        profile = await self.profile_manager.get_profile(user_id) or {
            "user_id": user_id,
            "preferred_depth": "detailed",
            "preferred_style": "professional",
            "interested_topics": [],
            "birth_data": None,
            "frequent_skills": [],
            "feedback_history": [],
            "total_sessions": 0,
        }

        # 自动提取并缓存生辰数据（仅当本轮 context_data 提供了新数据时）
        # 同步 await 而非 fire-and-forget：确保画像行在 _post_run_profile_update
        # 运行前已创建，避免并发 INSERT 竞争。
        new_birth = self.profile_manager.extract_birth_data(context_data)
        if new_birth:
            cached_birth = profile.get("birth_data")
            if cached_birth != new_birth:
                await self.profile_manager.upsert_profile(user_id, birth_data=new_birth)
                profile["birth_data"] = new_birth

        return profile

    async def _post_run_profile_update(
        self,
        user_id: int | None,
        skill_name: str | None,
        is_new_session: bool,
    ) -> None:
        """
        P2-2: 一次对话结束后更新画像长期记忆。

        单事务原子更新（会话计数 + 高频技能），避免并发 read-modify-write 竞争。
        异常被吞掉，绝不影响主对话流程。
        """
        if not self.enable_profile or user_id is None:
            return
        try:
            await self.profile_manager.apply_post_run_updates(
                user_id, skill_name, is_new_session
            )
        except Exception as e:
            logger.warning(f"更新用户画像长期记忆失败: {e}")

    async def _record_execution(
        self,
        *,
        session_id: str,
        user_id: int | None,
        skill_name: str | None,
        user_input: str,
        context_data: str,
        assistant_tool_calls: list[dict[str, Any]],
        iterations: int,
        final_response: str,
        execution_time_ms: int,
        has_error: bool,
        error_message: str | None,
        plan: dict[str, Any] | None,
        reflection: str,
    ) -> None:
        """
        P3-1/P3-2: 记录本次执行的指标到 agent_execution_records 表。

        记录采用 fire-and-forget 语义（本方法 await 但内部异常被吞），
        供 AdaptiveLearner 学习与 MetricsCollector 评估使用。
        """
        if not self.enable_learning:
            return
        try:
            tools_used = [tc.get("name", "") for tc in assistant_tool_calls if tc.get("name")]
            record = {
                "session_id": session_id,
                "user_id": user_id,
                "skill_name": skill_name,
                "user_input": user_input,
                "input_length": len(user_input or ""),
                "context_data_present": bool(context_data),
                "tools_used": tools_used,
                "tool_count": len(tools_used),
                "iterations": iterations,
                "response_length": len(final_response or ""),
                "execution_time_ms": execution_time_ms,
                "has_error": has_error,
                "error_message": error_message,
                "planner_used": settings.ENABLE_PLANNER,
                "plan_complexity": (plan or {}).get("complexity") if plan else None,
                "reflector_decisions": [reflection] if reflection else [],
            }
            await self.adaptive_learner.record_execution(record)
        except Exception as e:
            logger.warning(f"记录执行指标失败: {e}")

    async def run(
        self,
        user_input: str,
        session_id: str | None = None,
        thread_id: str | None = None,
        user_id: int | None = None,
        skill_prompt: str = "",
        context_data: str = "",
        skill_name: str | None = None,
        model_mode: str = "fast",
        skip_tools: bool = False,
        outline: list[dict] | None = None,
        base_system_prompt: str | None = None,
        persist_history: bool = True,
        inject_context: bool = False,
    ) -> dict[str, Any]:
        """
        运行 Agent Loop

        这是 Loop Engineer 的核心执行入口：
        1. 接收用户输入
        2. 进入 Think → Act → Observe 循环
        3. 返回最终结果

        :param persist_history: 是否将会话与消息持久化到数据库。
                                报告生成场景应设为 False，避免污染历史会话。
        """
        if persist_history:
            sid, is_new_session = self.prepare_session(session_id=session_id, user_id=user_id)
        else:
            # 报告生成等场景：使用临时 sid，不注册会话、不写数据库
            sid = session_id or str(uuid.uuid4())
            is_new_session = False
        tid = thread_id or str(uuid.uuid4())
        _start_ts = datetime.now().timestamp()

        # 构建 System Prompt（仅含基础指令 + Skill 指南 + Outline）
        # 报告生成场景：不加载用户画像，不注入历史对话，排盘数据通过用户消息提供
        effective_prompt = self._build_effective_system_prompt(
            skill_prompt, outline, base_system_prompt
        )

        initial_messages: list[BaseMessage] = [
            SystemMessage(content=effective_prompt),
        ]
        # 对话场景：注入当前专题的排盘/占卜/择吉结果，确保回答与计算结果一致
        if inject_context:
            ctx_msg = self._build_context_message(context_data)
            if ctx_msg is not None:
                initial_messages.append(ctx_msg)
        initial_messages.append(HumanMessage(content=user_input))

        initial_state: AgentState = {
            "messages": initial_messages,
            "session_id": sid,
            "iteration_count": 0,
            "thinking": "",
            "current_tool": None,
            "tool_results": [],
            "final_response": None,
            "error": None,
            "plan": {},
            "reflection": "",
            "model_mode": model_mode,
        }

        config = {"configurable": {"thread_id": tid, "session_id": sid}}

        try:
            if skip_tools:
                llm = self.think_llm if model_mode == "think" else self.llm
                response = await llm.ainvoke(initial_messages)
                final_response = _strip_report_preamble(response.content if isinstance(response, AIMessage) else "")
                thinking = ""
                assistant_tool_calls = []
                iterations = 1
                result = {"messages": [response], "iteration_count": 1, "final_response": final_response, "thinking": "", "tool_results": []}
            else:
                result = await self.graph.ainvoke(initial_state, config)
                self.session_manager.update_session(sid, message_count=len(result.get("messages", [])))

                # ── 持久化到数据库：用户消息 + 助手响应 ──
                final_response = result.get("final_response", "") or ""
                thinking = result.get("thinking", "") or ""
                tool_results = result.get("tool_results", []) or []
                # 提取助手侧的 tool_calls（从消息列表中）
                assistant_tool_calls: list[dict[str, Any]] = []
                for m in result.get("messages", []):
                    if isinstance(m, AIMessage) and getattr(m, "tool_calls", None):
                        for tc in m.tool_calls:
                            assistant_tool_calls.append({
                                "name": tc.get("name", ""),
                                "args": tc.get("args", {}),
                            })

            # 保存用户消息与助手响应（报告生成场景跳过，避免污染历史会话）
            if persist_history:
                asyncio.create_task(self.session_manager._db_save_message(
                    sid, "user", user_input
                ))
                asyncio.create_task(self.session_manager._db_save_message(
                    sid, "assistant", final_response,
                    thinking=thinking or None,
                    tool_calls=assistant_tool_calls or None,
                    tool_results=tool_results if not skip_tools else None,
                ))

            # P3-1/P3-2: 记录执行指标（供自适应学习与评估报告）
            _exec_ms = int((datetime.now().timestamp() - _start_ts) * 1000)
            await self._record_execution(
                session_id=sid, user_id=user_id, skill_name=skill_name,
                user_input=user_input, context_data=context_data,
                assistant_tool_calls=assistant_tool_calls,
                iterations=result.get("iteration_count", 0),
                final_response=final_response, execution_time_ms=_exec_ms,
                has_error=False, error_message=None,
                plan=result.get("plan"), reflection=result.get("reflection", ""),
            )

            return {
                "session_id": sid,
                "thread_id": tid,
                "response": final_response,
                "thinking": thinking,
                "messages": [
                    {
                        "role": "user" if isinstance(m, HumanMessage) else
                                "assistant" if isinstance(m, AIMessage) else
                                "tool" if isinstance(m, ToolMessage) else "system",
                        "content": m.content,
                        "tool_calls": getattr(m, "tool_calls", None),
                    }
                    for m in result.get("messages", [])
                    if not isinstance(m, SystemMessage)
                ],
                "iterations": result.get("iteration_count", 0),
            }
        except PermissionError:
            raise
        except Exception as e:
            logger.error(f"Agent run error: {e}")
            # P3-1/P3-2: 错误也记录（用于失败点分析）
            _exec_ms = int((datetime.now().timestamp() - _start_ts) * 1000)
            await self._record_execution(
                session_id=sid, user_id=user_id, skill_name=skill_name,
                user_input=user_input, context_data=context_data,
                assistant_tool_calls=[], iterations=0,
                final_response="", execution_time_ms=_exec_ms,
                has_error=True, error_message=str(e),
                plan=None, reflection="",
            )
            return {
                "session_id": sid,
                "thread_id": tid,
                "response": f"抱歉，处理您的请求时出现了错误：{str(e)}",
                "error": str(e),
            }

    async def stream(
        self,
        user_input: str,
        session_id: str | None = None,
        thread_id: str | None = None,
        user_id: int | None = None,
        skill_prompt: str = "",
        context_data: str = "",
        skill_name: str | None = None,
        model_mode: str = "fast",
        skip_tools: bool = False,
        outline: list[dict] | None = None,
        base_system_prompt: str | None = None,
        persist_history: bool = True,
        inject_context: bool = False,
    ):
        """
        流式执行 Agent Loop

        通过 SSE 实时推送思考过程和结果。

        :param persist_history: 是否将会话与消息持久化到数据库。
                                报告生成场景应设为 False，避免污染历史会话。
        """
        if persist_history:
            sid, is_new_session = self.prepare_session(session_id=session_id, user_id=user_id)
        else:
            # 报告生成等场景：使用临时 sid，不注册会话、不写数据库
            sid = session_id or str(uuid.uuid4())
            is_new_session = False
        tid = thread_id or str(uuid.uuid4())
        _start_ts = datetime.now().timestamp()

        # 构建 System Prompt（仅含基础指令 + Skill 指南 + Outline）
        # 报告生成场景：不加载用户画像，不注入历史对话，排盘数据通过用户消息提供
        effective_prompt = self._build_effective_system_prompt(
            skill_prompt, outline, base_system_prompt
        )

        initial_messages: list[BaseMessage] = [
            SystemMessage(content=effective_prompt),
        ]
        # 对话场景：注入当前专题的排盘/占卜/择吉结果，确保回答与计算结果一致
        if inject_context:
            ctx_msg = self._build_context_message(context_data)
            if ctx_msg is not None:
                initial_messages.append(ctx_msg)
        initial_messages.append(HumanMessage(content=user_input))

        initial_state: AgentState = {
            "messages": initial_messages,
            "session_id": sid,
            "iteration_count": 0,
            "thinking": "",
            "current_tool": None,
            "tool_results": [],
            "final_response": None,
            "error": None,
            "plan": {},
            "reflection": "",
            "model_mode": model_mode,
        }

        config = {"configurable": {"thread_id": tid, "session_id": sid}}

        yield {
            "event": "session",
            "data": json.dumps({"session_id": sid, "thread_id": tid}),
        }

        try:
            if skip_tools:
                llm = self.think_llm if model_mode == "think" else self.llm
                final_response = ""
                # 报告前言缓冲：LLM 可能在报告内容前输出对话式前言，
                # 缓冲初始内容直到检测到第一个 Markdown 标题（#）后再开始推送
                _preamble_buffer = ""
                _preamble_stripped = False

                # 发送 status 事件，告知前端当前阶段（不作为报告内容）
                yield {
                    "event": "status",
                    "data": json.dumps({"phase": "analyzing", "message": "正在分析排盘数据..."}),
                }

                # 使用直接 HTTP 请求方式实现流式响应（绕过 LangChain 的 astream 问题）
                try:
                    import httpx

                    logger.info(f"[stream] Using direct HTTP stream mode, model_mode={model_mode}")

                    # 获取 LLM 配置
                    client = getattr(llm, 'client', None)
                    api_key = getattr(client, 'api_key', '') if client else ''
                    base_url = getattr(client, 'base_url', '') if client else ''
                    model = getattr(llm, 'model_name', '') or getattr(llm, '_model', '')

                    logger.info(f"[stream] From LLM client: api_key_len={len(api_key)}, base_url={base_url}, model={model}")

                    # 如果无法获取配置，回退到 settings
                    if not api_key or not base_url:
                        logger.info(f"[stream] Falling back to settings")
                        from ...config import settings
                        if model_mode == "think":
                            api_key = settings.THINK_LLM_API_KEY or settings.OPENAI_API_KEY
                            base_url = settings.THINK_LLM_BASE_URL
                            model = settings.THINK_LLM_MODEL
                        else:
                            api_key = settings.FAST_LLM_API_KEY or settings.OPENAI_API_KEY
                            base_url = settings.FAST_LLM_BASE_URL
                            model = settings.FAST_LLM_MODEL

                    logger.info(f"[stream] Final config: api_key_len={len(api_key)}, base_url={base_url}, model={model}")

                    # 构建 OpenAI 格式的请求体
                    messages = []
                    for msg in initial_messages:
                        role = getattr(msg, 'role', 'user')
                        content = getattr(msg, 'content', '')
                        messages.append({"role": role, "content": content})

                    # 记录 finish_reason，用于上层检测 max_tokens 截断
                    _finish_reason: str | None = None

                    logger.info(f"[stream] Sending request to {base_url}/chat/completions, messages_count={len(messages)}")

                    # 发送 status：已发送请求到 LLM
                    yield {
                        "event": "status",
                        "data": json.dumps({"phase": "requesting", "message": "已调用解盘技能，等待 AI 响应..."}),
                    }

                    async with httpx.AsyncClient() as http_client:
                        async with http_client.stream(
                            "POST",
                            f"{base_url}/chat/completions",
                            headers={
                                "Authorization": f"Bearer {api_key}",
                                "Content-Type": "application/json",
                            },
                            json={
                                "model": model,
                                "messages": messages,
                                "stream": True,
                                "max_tokens": 32768,
                            },
                            timeout=300.0,
                        ) as response:
                            logger.info(f"[stream] HTTP response status={response.status_code}")
                            logger.info(f"[stream] Response content-type: {response.headers.get('content-type', '')}")

                            line_count = 0
                            content_chars = 0
                            first_content_sent = False
                            async for line in response.aiter_lines():
                                line_count += 1
                                if not line or not line.startswith("data: "):
                                    continue

                                try:
                                    data_str = line[6:]  # 去掉 "data: " 前缀
                                    if data_str == "[DONE]":
                                        logger.info(f"[stream] Got [DONE], total_lines={line_count}, total_chars={content_chars}")
                                        break

                                    data = json.loads(data_str)
                                    choices = data.get("choices", [])
                                    if choices:
                                        # 记录 finish_reason，用于诊断是否因 max_tokens 截断
                                        finish_reason = choices[0].get("finish_reason")
                                        if finish_reason:
                                            _finish_reason = finish_reason
                                            logger.info(f"[stream] finish_reason={finish_reason}, chars_so_far={content_chars}")
                                        delta = choices[0].get("delta", {})
                                        # 处理推理内容（deepseek 等模型先输出 reasoning_content，再输出 content）
                                        reasoning_content = delta.get("reasoning_content", "")
                                        if reasoning_content:
                                            yield {
                                                "event": "thinking",
                                                "data": json.dumps({"content": reasoning_content}),
                                            }
                                        chunk_content = delta.get("content", "")
                                        if chunk_content:
                                            content_chars += len(chunk_content)
                                            final_response += chunk_content
                                            # 前言缓冲：检测到第一个 # 标题前的内容暂不推送
                                            if not _preamble_stripped:
                                                _preamble_buffer += chunk_content
                                                # 查找第一个 Markdown 标题（# 开头的一行）
                                                heading_match = _re.search(r'(?:^|\n)(#+\s)', _preamble_buffer)
                                                if heading_match:
                                                    _preamble_stripped = True
                                                    # 截取从第一个标题开始的内容
                                                    clean_content = _preamble_buffer[heading_match.start() + (1 if heading_match.start() > 0 else 0):]
                                                    if clean_content:
                                                        if not first_content_sent:
                                                            first_content_sent = True
                                                            yield {
                                                                "event": "status",
                                                                "data": json.dumps({"phase": "generating", "message": "AI 正在生成报告内容..."}),
                                                            }
                                                        yield {
                                                            "event": "content",
                                                            "data": json.dumps({"content": clean_content}),
                                                        }
                                                    logger.info(
                                                        "[preamble_strip] 流式前言已去除，缓冲长度: %d, 截断位置: %d",
                                                        len(_preamble_buffer), heading_match.start(),
                                                    )
                                            else:
                                                # 前言已去除，正常推送
                                                if not first_content_sent:
                                                    first_content_sent = True
                                                    yield {
                                                        "event": "status",
                                                        "data": json.dumps({"phase": "generating", "message": "AI 正在生成报告内容..."}),
                                                    }
                                                yield {
                                                    "event": "content",
                                                    "data": json.dumps({"content": chunk_content}),
                                                }
                                            if content_chars < 100:
                                                logger.info(f"[stream] Got content: {chunk_content[:50]}")
                                except json.JSONDecodeError:
                                    continue

                            logger.info(f"[stream] HTTP stream completed, total_lines={line_count}, total_chars={content_chars}")
                except Exception as e:
                    logger.error(f"[stream] Direct HTTP stream failed: {type(e).__name__}: {e}")
                    import traceback
                    logger.error(f"[stream] Traceback: {traceback.format_exc()}")
                    # 回退到 LangChain 的 astream 方法
                    first_content_sent = False
                    async for chunk in llm.astream(initial_messages):
                        chunk_content = getattr(chunk, 'content', '')
                        if chunk_content:
                            final_response += chunk_content
                            # 前言缓冲：检测到第一个 # 标题前的内容暂不推送
                            if not _preamble_stripped:
                                _preamble_buffer += chunk_content
                                heading_match = _re.search(r'(?:^|\n)(#+\s)', _preamble_buffer)
                                if heading_match:
                                    _preamble_stripped = True
                                    clean_content = _preamble_buffer[heading_match.start() + (1 if heading_match.start() > 0 else 0):]
                                    if clean_content:
                                        if not first_content_sent:
                                            first_content_sent = True
                                            yield {
                                                "event": "status",
                                                "data": json.dumps({"phase": "generating", "message": "AI 正在生成报告内容..."}),
                                            }
                                        yield {
                                            "event": "content",
                                            "data": json.dumps({"content": clean_content}),
                                        }
                            else:
                                if not first_content_sent:
                                    first_content_sent = True
                                    yield {
                                        "event": "status",
                                        "data": json.dumps({"phase": "generating", "message": "AI 正在生成报告内容..."}),
                                    }
                                yield {
                                    "event": "content",
                                    "data": json.dumps({"content": chunk_content}),
                                }

                assistant_tool_calls = []
                tool_results = []
                iterations = 1

                # 兜底：若前言缓冲中未检测到 # 标题，将缓冲内容作为普通内容推送
                if not _preamble_stripped and _preamble_buffer.strip():
                    if not first_content_sent:
                        first_content_sent = True
                        yield {
                            "event": "status",
                            "data": json.dumps({"phase": "generating", "message": "AI 正在生成报告内容..."}),
                        }
                    yield {
                        "event": "content",
                        "data": json.dumps({"content": _preamble_buffer}),
                    }

                # 保存用户消息与助手响应（报告生成场景跳过，避免污染历史会话）
                cleaned_final_response = _strip_report_preamble(final_response)
                if persist_history:
                    asyncio.create_task(self.session_manager._db_save_message(
                        sid, "user", user_input
                    ))
                    asyncio.create_task(self.session_manager._db_save_message(
                        sid, "assistant", cleaned_final_response,
                        thinking=None,
                        tool_calls=None,
                        tool_results=None,
                    ))

                _exec_ms = int((datetime.now().timestamp() - _start_ts) * 1000)
                await self._record_execution(
                    session_id=sid, user_id=user_id, skill_name=skill_name,
                    user_input=user_input, context_data=context_data,
                    assistant_tool_calls=[],
                    iterations=1,
                    final_response=cleaned_final_response, execution_time_ms=_exec_ms,
                    has_error=False, error_message=None,
                    plan=None, reflection="",
                )

                yield {
                    "event": "response",
                    "data": json.dumps({"content": cleaned_final_response}),
                }

                yield {
                    "event": "done",
                    "data": json.dumps({"session_id": sid, "finish_reason": _finish_reason}),
                }
            else:
                async for event in self.graph.astream_events(initial_state, config, version="v2"):
                    kind = event["event"]

                    if kind == "on_chat_model_stream":
                        chunk = event["data"]["chunk"]
                        if hasattr(chunk, "content") and chunk.content:
                            yield {
                                "event": "content",
                                "data": json.dumps({"content": chunk.content}),
                            }
                        # 不在流式 chunk 中发送 tool_call：
                        # LangChain 的流式 tool_calls 是增量式的，早期 chunk 中
                        # name 和 args 不完整（甚至为空），导致前端渲染空白 tool call 块。
                        # 改为在 on_tool_start 中发送完整 tool_call 事件。

                    elif kind == "on_tool_start":
                        yield {
                            "event": "tool_call",
                            "data": json.dumps({
                                "name": event["name"],
                                "args": event["data"].get("input", {}),
                            }),
                        }

                    elif kind == "on_tool_end":
                        yield {
                            "event": "tool_end",
                            "data": json.dumps({
                                "name": event["name"],
                                "output": str(event["data"].get("output", "")),
                            }),
                        }

                # 从检查点获取最终状态（不重复调用图）
                state_snapshot = await self.graph.aget_state(config)
                final_state = state_snapshot.values if state_snapshot else {}
                final_response = final_state.get("final_response", "") or ""
                thinking = final_state.get("thinking", "") or ""
                tool_results = final_state.get("tool_results", []) or []

                # ── 持久化到数据库：用户消息 + 助手响应 ──
                # 提取助手侧的 tool_calls
                assistant_tool_calls: list[dict[str, Any]] = []
                for m in final_state.get("messages", []):
                    if isinstance(m, AIMessage) and getattr(m, "tool_calls", None):
                        for tc in m.tool_calls:
                            assistant_tool_calls.append({
                                "name": tc.get("name", ""),
                                "args": tc.get("args", {}),
                            })

                # 保存用户消息与助手响应（报告生成场景跳过，避免污染历史会话）
                if persist_history:
                    asyncio.create_task(self.session_manager._db_save_message(
                        sid, "user", user_input
                    ))
                    asyncio.create_task(self.session_manager._db_save_message(
                        sid, "assistant", final_response,
                        thinking=thinking or None,
                        tool_calls=assistant_tool_calls or None,
                        tool_results=tool_results or None,
                    ))

                # P3-1/P3-2: 记录执行指标（供自适应学习与评估报告）
                _exec_ms = int((datetime.now().timestamp() - _start_ts) * 1000)
                await self._record_execution(
                    session_id=sid, user_id=user_id, skill_name=skill_name,
                    user_input=user_input, context_data=context_data,
                    assistant_tool_calls=assistant_tool_calls,
                    iterations=final_state.get("iteration_count", 0),
                    final_response=final_response, execution_time_ms=_exec_ms,
                    has_error=False, error_message=None,
                    plan=final_state.get("plan"), reflection=final_state.get("reflection", ""),
                )

                yield {
                    "event": "response",
                    "data": json.dumps({"content": final_response}),
                }

                yield {
                    "event": "done",
                    "data": json.dumps({"session_id": sid}),
                }

        except Exception as e:
            logger.error(f"Stream error: {e}")
            # P3-1/P3-2: 错误也记录
            _exec_ms = int((datetime.now().timestamp() - _start_ts) * 1000)
            await self._record_execution(
                session_id=sid, user_id=user_id, skill_name=skill_name,
                user_input=user_input, context_data=context_data,
                assistant_tool_calls=[], iterations=0,
                final_response="", execution_time_ms=_exec_ms,
                has_error=True, error_message=str(e),
                plan=None, reflection="",
            )
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }


# 全局 Agent Harness 实例（启动时初始化）
agent_harness: AgentHarness | None = None


def get_agent_harness() -> AgentHarness | None:
    return agent_harness


def init_agent_harness(
    llm,
    tools: list[BaseTool],
    system_prompt: str = "",
    summary_llm=None,
    think_llm=None,
) -> AgentHarness:
    global agent_harness
    agent_harness = AgentHarness(
        llm=llm,
        tools=tools,
        system_prompt=system_prompt,
        max_iterations=settings.MAX_TOOL_ITERATIONS,
        summary_llm=summary_llm,
        think_llm=think_llm,
    )
    return agent_harness
