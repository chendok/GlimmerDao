"""会话管理 API 路由"""
from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_optional_user_id, get_current_user_id
from ...schemas.chat import (
    SessionListResponse,
    SessionInfo,
    SessionMessagesResponse,
    MessageInfo,
)
from ...core.agent.harness import get_agent_harness

router = APIRouter()


@router.get("/", response_model=SessionListResponse)
async def list_sessions(
    page: int = Query(1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    q: str | None = Query(None, max_length=64, description="搜索关键词（匹配标题/预览）"),
    user_id: int | None = Depends(get_optional_user_id),
):
    """获取会话列表（支持分页与搜索，同时支持匿名和已登录用户）

    优先从数据库查询（持久化记录），数据库不可用时降级到内存。
    """
    harness = get_agent_harness()
    if not harness:
        return SessionListResponse(sessions=[], total=0)

    # 优先使用数据库分页查询
    result = await harness.session_manager.list_sessions(
        owner_id=user_id,
        page=page,
        page_size=page_size,
        query=q,
    )

    sessions = [
        SessionInfo(
            id=s["id"],
            created_at=s["created_at"],
            updated_at=s.get("updated_at"),
            message_count=s.get("message_count", 0),
            preview=s.get("preview"),
            title=s.get("title"),
        )
        for s in result["sessions"]
    ]

    return SessionListResponse(
        sessions=sessions,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
        has_more=result["has_more"],
    )


@router.get("/{session_id}/messages", response_model=SessionMessagesResponse)
async def get_session_messages(
    session_id: str,
    user_id: int | None = Depends(get_optional_user_id),
):
    """获取指定会话的完整消息历史"""
    harness = get_agent_harness()
    if not harness:
        return SessionMessagesResponse(session_id=session_id, messages=[], total=0)

    # 权限校验
    if not harness.session_manager.can_access(session_id, user_id):
        raise HTTPException(status_code=403, detail="无权访问该会话")

    msgs = await harness.session_manager.get_messages(session_id)
    messages = [
        MessageInfo(
            id=m["id"],
            role=m["role"],
            content=m["content"],
            thinking=m.get("thinking"),
            tool_calls=m.get("tool_calls"),
            tool_results=m.get("tool_results"),
            created_at=m["created_at"],
        )
        for m in msgs
    ]

    return SessionMessagesResponse(
        session_id=session_id,
        messages=messages,
        total=len(messages),
    )


@router.delete("/clear-all")
async def clear_all_sessions(
    user_id: int | None = Depends(get_optional_user_id),
):
    """清除当前用户（或匿名用户）的所有会话"""
    from ...database import async_session
    from ...models.chat import ChatSession, ChatMessage
    from sqlalchemy import delete

    harness = get_agent_harness()
    if not harness:
        return {"status": "error", "message": "Agent 服务未就绪"}

    try:
        async with async_session() as db:
            if user_id is not None:
                # 已登录用户：删除该用户的所有会话（级联删除消息）
                from sqlalchemy import select as sa_select
                result = await db.execute(
                    sa_select(ChatSession.id).where(ChatSession.user_id == user_id)
                )
                session_ids = [row[0] for row in result.fetchall()]
                # 先删除消息，再删除会话
                for sid in session_ids:
                    await db.execute(
                        delete(ChatMessage).where(ChatMessage.session_id == sid)
                    )
                result = await db.execute(
                    delete(ChatSession).where(ChatSession.user_id == user_id)
                )
            else:
                # 匿名用户：删除 user_id IS NULL 的会话
                from sqlalchemy import select as sa_select
                result = await db.execute(
                    sa_select(ChatSession.id).where(ChatSession.user_id.is_(None))
                )
                session_ids = [row[0] for row in result.fetchall()]
                for sid in session_ids:
                    await db.execute(
                        delete(ChatMessage).where(ChatMessage.session_id == sid)
                    )
                result = await db.execute(
                    delete(ChatSession).where(ChatSession.user_id.is_(None))
                )
            await db.commit()
            deleted_count = result.rowcount

        # 清理内存中的会话
        harness.session_manager.clear_all(owner_id=user_id)

        return {"status": "ok", "deleted": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除失败: {e}")


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user_id: int | None = Depends(get_optional_user_id),
):
    """删除会话（同时清理内存和数据库记录）"""
    harness = get_agent_harness()
    if not harness:
        return {"status": "error", "message": "Agent 服务未就绪"}

    deleted = harness.session_manager.delete_session(session_id, owner_id=user_id)
    if not deleted:
        # 内存中可能已不存在，尝试从数据库删除
        from ...database import async_session
        from ...models.chat import ChatSession
        try:
            async with async_session() as db:
                session = await db.get(ChatSession, session_id)
                if session:
                    await db.delete(session)
                    await db.commit()
                    return {"status": "ok"}
            raise HTTPException(status_code=404, detail="会话不存在")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"删除失败: {e}")
    return {"status": "ok"}


@router.post("/claim")
async def claim_anonymous_sessions(
    user_id: int = Depends(get_current_user_id),
):
    """登录后将所有匿名会话（user_id=NULL）认领到当前用户。

    用于解决：用户登录前以匿名身份产生的对话记录在登录后不可见的问题。
    """
    harness = get_agent_harness()
    if not harness:
        return {"status": "error", "message": "Agent 服务未就绪"}

    claimed = await harness.session_manager.claim_anonymous_sessions(user_id)
    return {"status": "ok", "claimed": claimed}