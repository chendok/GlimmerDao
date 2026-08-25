"""系统管理 API 路由

独立的系统级管理功能：用户管理、登录日志、大模型配置、系统提示词。
所有端点均需认证 + 管理员权限（is_admin=True），通过 get_current_admin_user 依赖统一校验。
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ..deps import get_current_admin_user
from ...models.user import User, LoginLog
from ...services import system_config_service as scs

logger = logging.getLogger("uvicorn")
router = APIRouter()

# 默认管理员邮箱：该账户永远保持管理员权限，不可被取消权限、不可被禁用、不可被删除
DEFAULT_ADMIN_EMAIL = "chendok@163.com"


def _is_default_admin(user: User) -> bool:
    """判断是否为默认管理员账户（邮箱匹配，大小写不敏感）"""
    return bool(user.email) and user.email.lower() == DEFAULT_ADMIN_EMAIL


# ═══════════════════════════════════════════════════════════
# 用户管理
# ═══════════════════════════════════════════════════════════

@router.get("/admin/users")
async def get_admin_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户列表（管理员）"""
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users = result.scalars().all()

    items = []
    for user in users:
        items.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "phone": user.phone,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "created_at": user.created_at.isoformat() + "Z" if user.created_at else None,
            "last_login_at": user.last_login_at.isoformat() + "Z" if user.last_login_at else None,
        })

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.put("/admin/users/{user_id}")
async def update_admin_user(
    user_id: int,
    body: dict,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新用户（管理员）

    安全防护：
    - 取消管理员权限时，必须保证系统中至少还保留一个其他管理员，避免锁死系统。
    - 禁用账户时，若目标是最后一个可用（is_active=True）管理员，则拒绝，避免无管理员可登录。
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 校验：默认管理员账户永远保持管理员权限且永远启用，不可取消权限、不可禁用
    if _is_default_admin(user):
        if "is_admin" in body and body["is_admin"] is False:
            raise HTTPException(
                status_code=400,
                detail="默认管理员账户（%s）不能被取消管理员权限" % DEFAULT_ADMIN_EMAIL,
            )
        if "is_active" in body and body["is_active"] is False:
            raise HTTPException(
                status_code=400,
                detail="默认管理员账户（%s）不能被禁用" % DEFAULT_ADMIN_EMAIL,
            )

    # 校验：取消管理员权限 → 必须至少保留一个其他管理员
    if "is_admin" in body and body["is_admin"] is False and user.is_admin is True:
        other_admins_count = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.id != user_id,
                    User.is_admin.is_(True),
                )
            )
        ).scalar() or 0
        if other_admins_count == 0:
            raise HTTPException(
                status_code=400,
                detail="系统必须至少保留一个管理员，无法取消最后一个管理员的权限",
            )

    # 校验：禁用账户 → 不能禁用最后一个可用管理员，否则将无人可登录管理系统
    if "is_active" in body and body["is_active"] is False and user.is_active is True and user.is_admin is True:
        other_active_admins_count = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.id != user_id,
                    User.is_admin.is_(True),
                    User.is_active.is_(True),
                )
            )
        ).scalar() or 0
        if other_active_admins_count == 0:
            raise HTTPException(
                status_code=400,
                detail="系统必须至少保留一个可登录的管理员，无法禁用最后一个可用管理员",
            )

    if "is_admin" in body:
        user.is_admin = body["is_admin"]
    if "is_active" in body:
        user.is_active = body["is_active"]

    await db.flush()

    return {"message": "用户更新成功", "success": True}


@router.delete("/admin/users/{user_id}")
async def delete_admin_user(
    user_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除用户（管理员）— 同时清理其关联数据

    SQLite 未启用外键级联，需手动清理关联表。
    安全防护：不能删除自己、不能删除管理员（需先取消其管理员权限）、不能删除默认管理员账户。
    """
    # 不能删除自己
    if admin_user.id == user_id:
        raise HTTPException(status_code=400, detail="不能删除当前登录的管理员账户")

    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    # 不能删除默认管理员账户（永远保留）
    if _is_default_admin(target):
        raise HTTPException(
            status_code=400,
            detail="默认管理员账户（%s）不能被删除" % DEFAULT_ADMIN_EMAIL,
        )
    # 不能删除管理员（需先取消其管理员权限）
    if target.is_admin:
        raise HTTPException(status_code=400, detail="不能删除管理员账户，请先取消其管理员权限")

    params_uid = {"uid": user_id}

    # 1. 删除用户会话的消息 + 会话
    await db.execute(
        text("DELETE FROM chat_messages WHERE session_id IN "
             "(SELECT id FROM chat_sessions WHERE user_id = :uid)"),
        params_uid,
    )
    await db.execute(text("DELETE FROM chat_sessions WHERE user_id = :uid"), params_uid)

    # 2. 删除用户拥有的数据（表名为常量，无注入风险）
    owned_tables = [
        "bazi_archives", "bazi_reports", "chart_info_records",
        "physiognomy_archives", "agent_execution_records", "knowledge_documents",
        "learning_progresses", "knowledge_categories", "mindmaps", "user_profiles",
    ]
    for tbl in owned_tables:
        await db.execute(text(f"DELETE FROM {tbl} WHERE user_id = :uid"), params_uid)

    # 3. 登录日志置空 user_id（保留记录用于审计）
    await db.execute(text("UPDATE login_logs SET user_id = NULL WHERE user_id = :uid"), params_uid)

    # 4. 清理登录尝试 / 验证码记录（按 email/phone 关联）
    if target.email:
        await db.execute(
            text("DELETE FROM email_verification_codes WHERE email = :email"),
            {"email": target.email},
        )
        await db.execute(
            text("DELETE FROM login_attempts WHERE identifier = :email"),
            {"email": target.email},
        )
    if target.phone:
        await db.execute(
            text("DELETE FROM sms_verification_codes WHERE phone = :phone"),
            {"phone": target.phone},
        )
        await db.execute(
            text("DELETE FROM login_attempts WHERE identifier = :phone"),
            {"phone": target.phone},
        )

    # 5. 删除用户
    await db.execute(text("DELETE FROM users WHERE id = :uid"), params_uid)

    return {"message": "用户删除成功", "success": True}


# ═══════════════════════════════════════════════════════════
# 登录日志
# ═══════════════════════════════════════════════════════════

@router.get("/admin/login-logs")
async def get_admin_login_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None, description="按状态筛选: success/failure/logout"),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取登录日志（管理员）

    返回用户登录、登出、登录失败等身份验证事件，
    包含登录时间、登录IP、登录设备、登录状态、用户名等关键信息。
    """
    count_query = select(func.count(LoginLog.id))
    query = select(LoginLog)
    if status:
        count_query = count_query.where(LoginLog.status == status)
        query = query.where(LoginLog.status == status)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(LoginLog.created_at.desc()).offset(offset).limit(page_size)
    logs = (await db.execute(query)).scalars().all()

    items = [
        {
            "id": log.id,
            "user_id": log.user_id,
            "username": log.username,
            "ip_address": log.ip_address,
            "device": log.device,
            "status": log.status,
            "failure_reason": log.failure_reason,
            "created_at": log.created_at.isoformat() + "Z" if log.created_at else None,
        }
        for log in logs
    ]
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ═══════════════════════════════════════════════════════════
# 大模型配置管理
# ═══════════════════════════════════════════════════════════

# 运行模式元信息（前端展示「两种模式的区别说明」）
LLM_MODE_META = {
    "fast": {
        "value": "fast",
        "label": "快速模式",
        "description": "响应更快、成本更低，适用于日常对话、简单查询、排盘数据初步解析等场景。"
                       "通常使用参数量较小的模型（如 gpt-4o-mini），温度较高以提升响应多样性。",
        "default_temperature": 0.7,
        "default_max_tokens": 32768,
    },
    "think": {
        "value": "think",
        "label": "思考模式",
        "description": "推理更深入、质量更高，适用于复杂命理分析、深度报告生成、多步骤工具调用等场景。"
                       "通常使用更强的模型（如 gpt-4o / deepseek-v4-pro），温度较低以保证结论稳定。",
        "default_temperature": 0.3,
        "default_max_tokens": 32768,
    },
    "vision": {
        "value": "vision",
        "label": "视觉模式",
        "description": "支持图片输入，用于面相/手相图片识别、OCR 等场景。未配置时回退到快速模式。",
        "default_temperature": 0.3,
        "default_max_tokens": 32768,
    },
}


class LLMConfigCreate(BaseModel):
    mode: str = Field(..., description="运行模式: fast/think/vision")
    name: str = Field(..., min_length=1, max_length=64, description="配置名称")
    model_name: str = Field(..., min_length=1, max_length=128, description="模型名称")
    base_url: str = Field("https://api.openai.com/v1", max_length=256)
    api_key: str = Field("", max_length=256, description="API Key（明文，存储后脱敏展示）")
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="采样温度 0.0-2.0")
    max_tokens: int = Field(32768, ge=1, le=200000, description="单次响应最大 tokens")
    description: str = Field("", max_length=2000)


class LLMConfigUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    model_name: Optional[str] = Field(None, min_length=1, max_length=128)
    base_url: Optional[str] = Field(None, max_length=256)
    api_key: Optional[str] = Field(None, description="留空或传脱敏值表示不修改")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=200000)
    description: Optional[str] = Field(None, max_length=2000)


@router.get("/admin/llm-configs/modes")
async def get_llm_modes(
    admin_user: User = Depends(get_current_admin_user),
):
    """获取大模型运行模式元信息（前端用于展示两种模式的区别说明）"""
    return {"modes": list(LLM_MODE_META.values())}


@router.get("/admin/llm-configs")
async def list_llm_configs(
    mode: Optional[str] = Query(None, description="按模式过滤: fast/think/vision"),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取大模型配置列表"""
    configs = await scs.list_llm_configs(db, mode=mode)
    return {
        "items": [scs.llm_config_to_dict(c) for c in configs],
        "total": len(configs),
        "modes": list(LLM_MODE_META.values()),
    }


@router.post("/admin/llm-configs")
async def create_llm_config(
    body: LLMConfigCreate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """新建大模型配置"""
    try:
        cfg = await scs.create_llm_config(db, body.model_dump(), admin_user)
        return {"message": "配置创建成功", "success": True, "config": scs.llm_config_to_dict(cfg)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/admin/llm-configs/{config_id}")
async def update_llm_config(
    config_id: int,
    body: LLMConfigUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新大模型配置（部分字段，未提供的字段保持不变）"""
    try:
        # 仅传入显式设置的字段
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        cfg = await scs.update_llm_config(db, config_id, data, admin_user)
        return {"message": "配置更新成功", "success": True, "config": scs.llm_config_to_dict(cfg)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/admin/llm-configs/{config_id}")
async def delete_llm_config(
    config_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除大模型配置（默认配置、生效配置不可删除）"""
    try:
        await scs.delete_llm_config(db, config_id, admin_user)
        return {"message": "配置删除成功", "success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/llm-configs/{config_id}/activate")
async def activate_llm_config(
    config_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """激活指定配置（同 mode 下其他配置自动设为未生效，并热更新到运行中的 Agent Harness）"""
    try:
        cfg = await scs.activate_llm_config(db, config_id, admin_user)

        # 热更新到运行中的 Agent Harness（仅 fast/think 模式，立即生效）
        reloaded = False
        if cfg.mode in ("fast", "think") and cfg.api_key:
            try:
                from ...core.agent.harness import get_agent_harness
                from langchain_openai import ChatOpenAI
                harness = get_agent_harness()
                if harness:
                    new_llm = ChatOpenAI(
                        model=cfg.model_name,
                        api_key=cfg.api_key,
                        base_url=cfg.base_url,
                        temperature=cfg.temperature,
                        streaming=True,
                        max_tokens=cfg.max_tokens,
                    )
                    if cfg.mode == "fast":
                        harness.reload_llm(llm=new_llm)
                    else:
                        harness.reload_llm(think_llm=new_llm)
                    reloaded = True
            except Exception as e:
                logger.warning("[llm-config] 热更新 Agent Harness 失败，将在下次重启后生效: %s", e)

        message = "配置已激活并立即生效" if reloaded else "配置已激活，将在后端服务重启后生效"
        return {
            "message": message,
            "success": True,
            "config": scs.llm_config_to_dict(cfg),
            "hot_reloaded": reloaded,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/llm-configs/history")
async def get_llm_config_history(
    config_id: Optional[int] = Query(None, description="按配置ID过滤"),
    mode: Optional[str] = Query(None, description="按模式过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取大模型配置变更历史（修改人/修改时间/修改内容对比）"""
    items, total = await scs.list_llm_history(
        db, config_id=config_id, mode=mode, page=page, page_size=page_size
    )
    return {
        "items": [scs.llm_history_to_dict(h) for h in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ═══════════════════════════════════════════════════════════
# 系统提示词管理
# ═══════════════════════════════════════════════════════════

PROMPT_TYPE_META = {
    "chat": {
        "value": "chat",
        "label": "对话框提示词",
        "description": "对话场景下注入 LLM 的 System Prompt，采用六段式结构（角色定位/核心准则/核心职责/问题理解验证/输出规范/输出自检），"
                       "强调交互性、即时解答能力与输出质量自检。由 Agent Harness 在每次对话调用 LLM 前注入，影响所有聊天会话。",
    },
    "report": {
        "value": "report",
        "label": "生成报告提示词",
        "description": "报告生成场景下注入 LLM 的 System Prompt，采用与对话框提示词一致的六段式结构与共享核心准则，"
                       "强调内容的全面性、系统性、专业深度与多维度质量自检。由报告生成 API 在调用 LLM 前注入，影响八字/紫微/相学等所有报告生成。",
    },
}


class PromptUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    content: str = Field(..., min_length=1, description="提示词正文")
    variables_doc: Optional[str] = Field(None, description="变量说明文档")
    description: Optional[str] = Field(None, max_length=2000)
    change_note: Optional[str] = Field(None, max_length=500, description="本次修改说明（写入版本记录）")


class PromptRollback(BaseModel):
    version_id: int = Field(..., description="目标历史版本ID")


@router.get("/admin/prompts/types")
async def get_prompt_types(
    admin_user: User = Depends(get_current_admin_user),
):
    """获取提示词类型元信息（前端用于区分展示两类提示词）"""
    return {"types": list(PROMPT_TYPE_META.values())}


@router.get("/admin/prompts")
async def list_prompts(
    prompt_type: Optional[str] = Query(None, description="按类型过滤: chat/report"),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取系统提示词列表"""
    prompts = await scs.list_prompts(db, prompt_type=prompt_type)
    return {
        "items": [scs.prompt_to_dict(p) for p in prompts],
        "total": len(prompts),
        "types": list(PROMPT_TYPE_META.values()),
    }


@router.put("/admin/prompts/{prompt_id}")
async def update_prompt(
    prompt_id: int,
    body: PromptUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新提示词内容（自动写入版本快照，可回滚）"""
    try:
        p = await scs.update_prompt_content(db, prompt_id, body.model_dump(), admin_user)
        return {"message": "提示词已保存，新会话/新报告生成生效", "success": True, "prompt": scs.prompt_to_dict(p)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/admin/prompts/{prompt_id}/restore-default")
async def restore_prompt_default(
    prompt_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """恢复提示词为系统默认内容（写入新版本，可再次回滚）"""
    try:
        p = await scs.restore_prompt_default(db, prompt_id, admin_user)
        return {"message": "已恢复为系统默认配置", "success": True, "prompt": scs.prompt_to_dict(p)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/admin/prompts/{prompt_id}/versions")
async def get_prompt_versions(
    prompt_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取提示词历史版本列表（版本控制）"""
    p = await scs.get_prompt(db, prompt_id)
    if not p:
        raise HTTPException(status_code=404, detail="提示词不存在")
    items, total = await scs.list_prompt_versions(
        db, p.prompt_key, page=page, page_size=page_size
    )
    return {
        "items": [scs.prompt_version_to_dict(v) for v in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "current_version": p.version,
    }


@router.post("/admin/prompts/{prompt_id}/rollback")
async def rollback_prompt(
    prompt_id: int,
    body: PromptRollback,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """将提示词回滚到指定历史版本"""
    try:
        p = await scs.rollback_prompt_to_version(db, prompt_id, body.version_id, admin_user)
        return {
            "message": f"已回滚到历史版本（新版本号 v{p.version}）",
            "success": True,
            "prompt": scs.prompt_to_dict(p),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
