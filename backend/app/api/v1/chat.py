"""聊天 API 路由 - SSE 流式响应 + Skill 支持"""
import json
import asyncio
import traceback
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse

from ..deps import get_optional_user_id
from ...schemas.chat import ChatRequest, ChatResponse
from ...core.agent.harness import get_agent_harness
from ...core.agent.prompts import load_system_prompt
from ...core.skills import get_skill_manager

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_skill(skill_id: str | None, message: str) -> tuple[str, str, str]:
    """
    解析 Skill：显式指定 > 自动匹配 > 默认

    返回: (skill_prompt, skill_name, context_requires)
    """
    sm = get_skill_manager()

    if skill_id:
        skill = sm.get(skill_id)
        if skill:
            return skill.prompt, skill.name, skill.context_requires or ""

    # 自动匹配
    skill = sm.match(message)
    if skill:
        return skill.prompt, skill.name, skill.context_requires or ""

    # 默认
    default = sm.get("general_chat")
    if default:
        return default.prompt, default.name, ""

    return "", "general_chat", ""


@router.post("/send", response_model=ChatResponse)
async def send_message(
    req: ChatRequest,
    raw: Request,
    user_id: int | None = Depends(get_optional_user_id),
):
    """发送消息（非流式）"""
    logger.warning("[debug chat-send-entry] message_len=%s session_id=%s skill_id=%s",
                   len(req.message or ""), req.session_id, req.skill_id)

    harness = get_agent_harness()
    if not harness:
        raise HTTPException(status_code=503, detail="Agent 服务未就绪 (API Key 或模型初始化失败，请检查 .env 配置)")

    if req.session_id and not harness.session_manager.can_access(req.session_id, user_id):
        raise HTTPException(status_code=403, detail="无权访问该会话")

    # 解析 Skill
    skill_prompt, skill_name, _ = _resolve_skill(req.skill_id, req.message)
    context_data = req.context_data or ""

    # 从 DB 加载当前生效的对话框系统提示词（管理员修改后立即生效）
    base_system_prompt = await load_system_prompt()

    try:
        result = await harness.run(
            user_input=req.message,
            session_id=req.session_id,
            user_id=user_id,
            skill_prompt=skill_prompt,
            context_data=context_data,
            skill_name=skill_name,
            model_mode=req.model_mode or "fast",
            base_system_prompt=base_system_prompt,
            inject_context=True,
        )
        return ChatResponse(
            session_id=result["session_id"],
            response=result.get("response", ""),
            thinking=result.get("thinking"),
            error=result.get("error"),
        )
    except Exception as e:
        tb = traceback.format_exc()
        logger.error("[debug chat-send-exception] harness.run failed: %s\n%s", e, tb)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Agent 执行异常: {e}"},
        )


@router.post("/stream")
async def stream_message(
    req: ChatRequest,
    raw: Request,
    user_id: int | None = Depends(get_optional_user_id),
):
    """发送消息（SSE 流式响应）"""
    logger.warning("[debug chat-stream-entry] message_len=%s session_id=%s skill_id=%s",
                   len(req.message or ""), req.session_id, req.skill_id)

    harness = get_agent_harness()
    if not harness:
        raise HTTPException(status_code=503, detail="Agent 服务未就绪 (API Key 或模型初始化失败，请检查 .env 配置)")

    if req.session_id and not harness.session_manager.can_access(req.session_id, user_id):
        raise HTTPException(status_code=403, detail="无权访问该会话")

    # 解析 Skill
    skill_prompt, skill_name, _ = _resolve_skill(req.skill_id, req.message)
    context_data = req.context_data or ""

    # 从 DB 加载当前生效的对话框系统提示词（管理员修改后立即生效）
    base_system_prompt = await load_system_prompt()

    async def event_generator():
        try:
            # 发送 Skill 激活事件
            yield {
                "event": "skill_activated",
                "data": json.dumps({"skill_id": skill_name}),
            }

            # 收集最终回复内容，用于回答完成后生成推荐问题
            final_response = ""

            async for chunk in harness.stream(
                user_input=req.message,
                session_id=req.session_id,
                user_id=user_id,
                skill_prompt=skill_prompt,
                context_data=context_data,
                skill_name=skill_name,
                model_mode=req.model_mode or "fast",
                base_system_prompt=base_system_prompt,
                inject_context=True,
            ):
                # 捕获最终回复（response 事件携带完整内容）
                if chunk["event"] == "response":
                    try:
                        final_response = json.loads(chunk["data"]).get("content", "")
                    except Exception:
                        pass

                # done 事件前：先单独调用一次生成推荐问题，再发送 done
                # （前端以 done 作为流结束信号，suggestions 需在 done 之前到达）
                if chunk["event"] == "done":
                    try:
                        suggestions = await harness.generate_suggestions(
                            user_input=req.message,
                            assistant_response=final_response,
                        )
                        if suggestions:
                            yield {
                                "event": "suggestions",
                                "data": json.dumps({"questions": suggestions}),
                            }
                    except Exception as e:
                        logger.warning("[chat-stream] 生成推荐问题失败: %s", e)

                yield {
                    "event": chunk["event"],
                    "data": chunk["data"],
                }
                await asyncio.sleep(0)
        except Exception as e:
            tb = traceback.format_exc()
            logger.error("[debug chat-stream-exception] event_generator failed: %s\n%s", e, tb)
            yield {
                "event": "error",
                "data": json.dumps({"message": f"流式响应异常: {e}"}),
            }

    return EventSourceResponse(
        event_generator(),
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


@router.post("/stop")
async def stop_generation():
    """停止生成"""
    return {"status": "stopped"}


@router.get("/skills")
async def list_skills(refresh: bool = False):
    """
    获取所有可用 Skill 列表。

    :param refresh: 为 True 时强制刷新缓存（绕过 TTL），用于前端菜单点击时的实时刷新
    """
    sm = get_skill_manager()
    return {"skills": sm.list_skills(refresh=refresh)}