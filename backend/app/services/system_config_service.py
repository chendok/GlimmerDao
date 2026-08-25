"""系统配置服务层 — 大模型配置与提示词管理

职责：
1. 启动时 seeding 默认大模型配置（来自 .env / config.py）与默认提示词（来自 prompts.py 常量）
2. 提供配置 CRUD + 激活切换 + 历史记录写入
3. 提供提示词 CRUD + 版本快照 + 恢复默认
4. 提供「当前生效配置」加载器供 harness/main.py 使用（fallback 到 .env）

设计要点：
- 所有写操作均接受 admin_user 参数以记录变更人
- LLMConfig.api_key 在外部访问时通过 mask_api_key 脱敏，明文仅用于实际调用 LLM
- 提示词的"恢复默认"会从 PROMPT_DEFAULTS 字典读取原始默认内容，并写入一条新版本
"""
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.system_config import (
    LLMConfig, LLMConfigHistory, SystemPrompt, SystemPromptVersion,
)
from ..models.user import User
from ..config import settings

logger = logging.getLogger("uvicorn")


# ═══════════════════════════════════════════════════════════
# 默认数据定义
# ═══════════════════════════════════════════════════════════

# 默认大模型配置：从 .env 读取，作为系统初始化的种子数据
def _default_llm_configs() -> list[dict]:
    """生成默认大模型配置种子（来自当前 .env / config.py）"""
    return [
        {
            "mode": "fast",
            "name": "默认快速模式",
            "model_name": settings.FAST_LLM_MODEL,
            "base_url": settings.FAST_LLM_BASE_URL,
            "api_key": settings.FAST_LLM_API_KEY or settings.OPENAI_API_KEY,
            "temperature": settings.FAST_LLM_TEMPERATURE,
            "max_tokens": 32768,
            "is_active": True,
            "is_default": True,
            "description": "快速响应模式（响应快、成本低），适用于日常对话与简单查询",
        },
        {
            "mode": "think",
            "name": "默认思考模式",
            "model_name": settings.THINK_LLM_MODEL,
            "base_url": settings.THINK_LLM_BASE_URL,
            "api_key": settings.THINK_LLM_API_KEY or settings.OPENAI_API_KEY,
            "temperature": settings.THINK_LLM_TEMPERATURE,
            "max_tokens": 32768,
            "is_active": True,
            "is_default": True,
            "description": "深度思考模式（推理更深入、质量更高），适用于复杂分析与报告生成",
        },
    ]


# 默认提示词内容（与 prompts.py 中的常量保持一致，作为「恢复默认」的数据源）
def _default_prompts() -> list[dict]:
    """生成默认提示词种子"""
    from ..core.agent.prompts import SYSTEM_PROMPT, REPORT_SYSTEM_PROMPT
    return [
        {
            "prompt_key": "chat_system",
            "name": "对话框系统提示词",
            "prompt_type": "chat",
            "content": SYSTEM_PROMPT,
            "variables_doc": (
                "## 变量说明\n\n"
                "本提示词为对话场景的 System Prompt，由 Agent Harness 在调用 LLM 前注入。\n\n"
                "### 结构说明（六段式）\n\n"
                "- `# 角色定位`：定义 AI 助手身份与服务范围\n"
                "- `# 核心准则`：四条共享准则（数据为本/专业有据/客观中立/正向理性），与报告提示词保持一致\n"
                "- `# 核心职责`：对话场景专属职责（常识解答/专项技能调度/边界把控）\n"
                "- `# 问题理解验证`：生成回复前对用户问题进行内部理解校验，不充分时触发澄清流程\n"
                "- `# 输出规范`：对话场景输出要求（紧扣问题/术语解释/分点结构/延伸引导）\n"
                "- `# 输出自检`：输出前对事实/术语/逻辑/边界四维度静默自检，发现问题自动修正\n\n"
                "### 自动注入的上下文片段（非变量占位符，由系统拼接）\n\n"
                "- `## 当前任务指南`：当前激活的 Skill 技能指南（如八字/紫微/相学等），由 Skill 匹配器自动加载\n"
                "- 用户画像、历史对话摘要：由 Harness 在压缩上下文时附加，不在本提示词中体现\n\n"
                "### 修改建议\n\n"
                "- 保持六段式结构，确保与报告提示词在核心准则上完全一致\n"
                "- 修改「核心职责」「输出规范」时聚焦交互性与即时解答能力\n"
                "- 「问题理解验证」「输出自检」是质量保障关键环节，修改时保持校验逻辑清晰可执行\n"
                "- 「核心准则」部分建议与报告提示词同步修改，维持系统一致性"
            ),
            "description": "对话场景下注入 LLM 的 System Prompt，采用六段式结构（角色定位/核心准则/核心职责/问题理解验证/输出规范/输出自检），强调交互性、即时解答能力与输出质量自检，确保回答精准对靶且专业可靠",
            "is_default": True,
        },
        {
            "prompt_key": "report_system",
            "name": "生成报告系统提示词",
            "prompt_type": "report",
            "content": REPORT_SYSTEM_PROMPT,
            "variables_doc": (
                "## 变量说明\n\n"
                "本提示词为报告生成场景的 System Prompt，由 report API 在调用 LLM 前注入。\n\n"
                "### 结构说明（六段式）\n\n"
                "- `# 角色定位`：定义报告生成引擎身份\n"
                "- `# 核心准则`：四条共享准则（数据为本/专业有据/客观中立/正向理性），与对话框提示词保持一致\n"
                "- `# 核心职责`：报告场景专属职责（逐章覆盖/数据溯源/系统解读/逻辑连贯）\n"
                "- `# 输入理解验证`：生成前对排盘数据完整性、目录结构匹配度、专业要素自洽性进行内部校验\n"
                "- `# 输出规范`：报告输出要求（Markdown结构/目录一致/详略得当/字数达标）\n"
                "- `# 输出质量自检`：生成过程中同步执行五维度质量自检（准确性/一致性/术语/格式/完整性），不达标即修正\n\n"
                "### 自动注入的上下文片段（非变量占位符，由系统拼接）\n\n"
                "- `## 当前任务指南`：当前激活的 Skill 技能指南（如八字至尊版/紫微高级版等）\n"
                "- 用户消息中包含：排盘数据 JSON、报告目录结构（outline）、字数要求等\n\n"
                "### 修改建议\n\n"
                "- 保持六段式结构，确保与对话框提示词在核心准则上完全一致\n"
                "- 修改「核心职责」「输出规范」时聚焦报告的全面性、系统性与专业深度\n"
                "- 「输入理解验证」「输出质量自检」是质量保障关键环节，修改时保持校验维度完整且可执行\n"
                "- 「核心准则」部分建议与对话框提示词同步修改，维持系统一致性"
            ),
            "description": "报告生成场景下注入 LLM 的 System Prompt，采用六段式结构（角色定位/核心准则/核心职责/输入理解验证/输出规范/输出质量自检），强调内容全面性、系统性、专业深度与多维度质量自检，确保报告专业可靠",
            "is_default": True,
        },
    ]


# ═══════════════════════════════════════════════════════════
# 启动时 seeding
# ═══════════════════════════════════════════════════════════

async def seed_default_configs(db: AsyncSession) -> None:
    """启动时 seeding 默认配置（若表为空）"""
    # 1. 大模型配置
    llm_count = (await db.execute(select(func.count(LLMConfig.id)))).scalar() or 0
    if llm_count == 0:
        for cfg in _default_llm_configs():
            db.add(LLMConfig(**cfg))
        await db.flush()
        logger.info("已 seeding 默认大模型配置: %d 条", len(_default_llm_configs()))

    # 2. 系统提示词
    prompt_count = (await db.execute(select(func.count(SystemPrompt.id)))).scalar() or 0
    if prompt_count == 0:
        for p in _default_prompts():
            sp = SystemPrompt(
                prompt_key=p["prompt_key"],
                name=p["name"],
                prompt_type=p["prompt_type"],
                content=p["content"],
                variables_doc=p["variables_doc"],
                description=p["description"],
                version=1,
                is_default=p["is_default"],
            )
            db.add(sp)
            await db.flush()
            # 同时写入初始版本快照
            db.add(SystemPromptVersion(
                prompt_key=p["prompt_key"],
                version=1,
                content=p["content"],
                variables_doc=p["variables_doc"],
                change_note="系统初始化默认版本",
                changed_by_username="system",
            ))
        await db.flush()
        logger.info("已 seeding 默认系统提示词: %d 条", len(_default_prompts()))
    else:
        # 已存在时：对「未被人为编辑过（version==1）且 is_default」的默认提示词，
        # 同步为最新常量内容，确保代码升级默认提示词（如新增错误规避规则）后自动生效，
        # 而管理员编辑过（version>1）的内容不受影响。
        defaults = {d["prompt_key"]: d for d in _default_prompts()}
        rows = (await db.execute(
            select(SystemPrompt).where(SystemPrompt.is_default.is_(True))
        )).scalars().all()
        for sp in rows:
            latest = defaults.get(sp.prompt_key)
            if not latest:
                continue
            if sp.version == 1 and sp.content != latest["content"]:
                sp.content = latest["content"]
                sp.variables_doc = latest["variables_doc"]
                logger.info("同步更新默认提示词 %s 至最新内容", sp.prompt_key)


# ═══════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════

def mask_api_key(key: str) -> str:
    """脱敏 API Key：仅保留前 4 位与后 4 位，中间用 **** 替代"""
    if not key:
        return ""
    if len(key) <= 12:
        return "****"
    return f"{key[:4]}****{key[-4:]}"


def llm_config_to_dict(cfg: LLMConfig, *, include_api_key: bool = False) -> dict:
    """LLMConfig 序列化 — 默认脱敏 API Key；include_api_key=True 时返回明文（仅内部使用）"""
    return {
        "id": cfg.id,
        "mode": cfg.mode,
        "name": cfg.name,
        "model_name": cfg.model_name,
        "base_url": cfg.base_url,
        "api_key": cfg.api_key if include_api_key else mask_api_key(cfg.api_key),
        "api_key_set": bool(cfg.api_key),
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
        "is_active": cfg.is_active,
        "is_default": cfg.is_default,
        "description": cfg.description or "",
        "created_by": cfg.created_by,
        "created_at": cfg.created_at.isoformat() + "Z" if cfg.created_at else None,
        "updated_by": cfg.updated_by,
        "updated_at": cfg.updated_at.isoformat() + "Z" if cfg.updated_at else None,
    }


def _llm_config_snapshot(cfg: LLMConfig) -> dict:
    """完整快照（用于历史记录，含明文 key 不可泄露 — 实际仅记录脱敏值）"""
    return {
        "mode": cfg.mode,
        "name": cfg.name,
        "model_name": cfg.model_name,
        "base_url": cfg.base_url,
        "api_key": mask_api_key(cfg.api_key),
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
        "is_active": cfg.is_active,
        "description": cfg.description or "",
    }


def _diff_summary(before: dict | None, after: dict | None) -> str:
    """生成前后值差异摘要"""
    if before is None:
        return "新建配置"
    if after is None:
        return "删除配置"
    changes = []
    for key in sorted(set(before.keys()) | set(after.keys())):
        if key in ("updated_at", "created_at"):
            continue
        b = before.get(key)
        a = after.get(key)
        if b != a:
            changes.append(f"{key}: {b!r} → {a!r}")
    if not changes:
        return "无实质变化"
    return "；".join(changes)


async def _write_llm_history(
    db: AsyncSession,
    *,
    config: LLMConfig | None,
    action: str,
    before: dict | None,
    after: dict | None,
    admin_user: User,
) -> None:
    """写入一条大模型配置变更历史"""
    history = LLMConfigHistory(
        config_id=config.id if config else None,
        config_name=(config.name if config else (before or {}).get("name")),
        mode=(config.mode if config else (before or {}).get("mode")),
        action=action,
        before_value=json.dumps(before, ensure_ascii=False) if before else None,
        after_value=json.dumps(after, ensure_ascii=False) if after else None,
        change_summary=_diff_summary(before, after),
        changed_by=admin_user.id,
        changed_by_username=admin_user.email or admin_user.username or f"user#{admin_user.id}",
    )
    db.add(history)


async def _write_prompt_version(
    db: AsyncSession,
    *,
    prompt: SystemPrompt,
    change_note: str,
    admin_user: User,
) -> None:
    """写入一条提示词版本快照"""
    db.add(SystemPromptVersion(
        prompt_key=prompt.prompt_key,
        version=prompt.version,
        content=prompt.content,
        variables_doc=prompt.variables_doc,
        change_note=change_note,
        changed_by=admin_user.id,
        changed_by_username=admin_user.email or admin_user.username or f"user#{admin_user.id}",
    ))


# ═══════════════════════════════════════════════════════════
# 大模型配置 CRUD
# ═══════════════════════════════════════════════════════════

async def list_llm_configs(db: AsyncSession, mode: Optional[str] = None) -> list[LLMConfig]:
    """列出所有大模型配置（可按 mode 过滤）"""
    query = select(LLMConfig).order_by(LLMConfig.mode.asc(), LLMConfig.is_active.desc(), LLMConfig.id.asc())
    if mode:
        query = query.where(LLMConfig.mode == mode)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_llm_config(db: AsyncSession, config_id: int) -> LLMConfig | None:
    return (await db.execute(select(LLMConfig).where(LLMConfig.id == config_id))).scalar_one_or_none()


async def get_active_llm_config(db: AsyncSession, mode: str) -> LLMConfig | None:
    """获取指定 mode 当前生效的配置"""
    return (
        await db.execute(
            select(LLMConfig).where(LLMConfig.mode == mode, LLMConfig.is_active.is_(True))
        )
    ).scalar_one_or_none()


async def create_llm_config(db: AsyncSession, data: dict, admin_user: User) -> LLMConfig:
    """新建大模型配置"""
    mode = data.get("mode", "fast")
    if mode not in ("fast", "think", "vision"):
        raise ValueError("mode 必须为 fast / think / vision 之一")
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("配置名称不能为空")
    # 同一 mode 下名称唯一
    exists = (
        await db.execute(select(LLMConfig).where(LLMConfig.mode == mode, LLMConfig.name == name))
    ).scalar_one_or_none()
    if exists:
        raise ValueError(f"模式 [{mode}] 下已存在同名配置: {name}")

    cfg = LLMConfig(
        mode=mode,
        name=name,
        model_name=(data.get("model_name") or "").strip(),
        base_url=(data.get("base_url") or "https://api.openai.com/v1").strip(),
        api_key=(data.get("api_key") or "").strip(),
        temperature=float(data.get("temperature", 0.7)),
        max_tokens=int(data.get("max_tokens", 32768)),
        is_active=False,
        is_default=False,
        description=data.get("description") or "",
        created_by=admin_user.id,
        updated_by=admin_user.id,
    )
    # 校验
    _validate_llm_params(cfg.temperature, cfg.max_tokens)
    db.add(cfg)
    await db.flush()
    await _write_llm_history(
        db, config=cfg, action="create",
        before=None, after=_llm_config_snapshot(cfg),
        admin_user=admin_user,
    )
    return cfg


async def update_llm_config(db: AsyncSession, config_id: int, data: dict, admin_user: User) -> LLMConfig:
    """更新大模型配置（部分字段）"""
    cfg = await get_llm_config(db, config_id)
    if not cfg:
        raise ValueError("配置不存在")
    before = _llm_config_snapshot(cfg)

    # 名称变更需校验同 mode 下唯一
    if "name" in data and data["name"] and data["name"] != cfg.name:
        new_name = data["name"].strip()
        exists = (
            await db.execute(
                select(LLMConfig).where(
                    LLMConfig.mode == cfg.mode,
                    LLMConfig.name == new_name,
                    LLMConfig.id != config_id,
                )
            )
        ).scalar_one_or_none()
        if exists:
            raise ValueError(f"模式 [{cfg.mode}] 下已存在同名配置: {new_name}")
        cfg.name = new_name

    if "model_name" in data:
        cfg.model_name = (data.get("model_name") or "").strip()
    if "base_url" in data:
        cfg.base_url = (data.get("base_url") or "").strip()
    if "api_key" in data:
        # 空字符串或与脱敏值相同视为不修改
        new_key = (data.get("api_key") or "").strip()
        if new_key and not new_key.startswith("****"):
            cfg.api_key = new_key
    if "temperature" in data:
        cfg.temperature = float(data["temperature"])
    if "max_tokens" in data:
        cfg.max_tokens = int(data["max_tokens"])
    if "description" in data:
        cfg.description = data.get("description") or ""

    _validate_llm_params(cfg.temperature, cfg.max_tokens)
    cfg.updated_by = admin_user.id
    await db.flush()

    after = _llm_config_snapshot(cfg)
    await _write_llm_history(
        db, config=cfg, action="update",
        before=before, after=after,
        admin_user=admin_user,
    )
    return cfg


def _validate_llm_params(temperature: float, max_tokens: int) -> None:
    """参数校验"""
    if not (0.0 <= temperature <= 2.0):
        raise ValueError("temperature 必须在 0.0 ~ 2.0 之间")
    if not (1 <= max_tokens <= 200000):
        raise ValueError("max_tokens 必须在 1 ~ 200000 之间")


async def delete_llm_config(db: AsyncSession, config_id: int, admin_user: User) -> None:
    """删除大模型配置（默认配置不可删除；生效配置不可删除）"""
    cfg = await get_llm_config(db, config_id)
    if not cfg:
        raise ValueError("配置不存在")
    if cfg.is_default:
        raise ValueError("系统默认配置不可删除")
    if cfg.is_active:
        raise ValueError("当前生效的配置不可删除，请先切换到其他配置")
    before = _llm_config_snapshot(cfg)
    await db.execute(delete(LLMConfig).where(LLMConfig.id == config_id))
    await _write_llm_history(
        db, config=None, action="delete",
        before=before, after=None,
        admin_user=admin_user,
    )


async def activate_llm_config(db: AsyncSession, config_id: int, admin_user: User) -> LLMConfig:
    """激活指定配置：同 mode 下其他配置自动设为 inactive"""
    cfg = await get_llm_config(db, config_id)
    if not cfg:
        raise ValueError("配置不存在")
    if cfg.is_active:
        return cfg  # 幂等
    before = _llm_config_snapshot(cfg)

    # 同 mode 下取消其他 active
    await db.execute(
        update(LLMConfig)
        .where(LLMConfig.mode == cfg.mode, LLMConfig.id != config_id)
        .values(is_active=False)
    )
    cfg.is_active = True
    cfg.updated_by = admin_user.id
    await db.flush()
    after = _llm_config_snapshot(cfg)
    await _write_llm_history(
        db, config=cfg, action="activate",
        before=before, after=after,
        admin_user=admin_user,
    )
    return cfg


async def list_llm_history(
    db: AsyncSession,
    *,
    config_id: Optional[int] = None,
    mode: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
) -> tuple[list[LLMConfigHistory], int]:
    """查询大模型配置变更历史"""
    query = select(LLMConfigHistory)
    count_query = select(func.count(LLMConfigHistory.id))
    if config_id:
        query = query.where(LLMConfigHistory.config_id == config_id)
        count_query = count_query.where(LLMConfigHistory.config_id == config_id)
    if mode:
        query = query.where(LLMConfigHistory.mode == mode)
        count_query = count_query.where(LLMConfigHistory.mode == mode)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(LLMConfigHistory.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(query)).scalars().all())
    return items, total


def llm_history_to_dict(h: LLMConfigHistory) -> dict:
    return {
        "id": h.id,
        "config_id": h.config_id,
        "config_name": h.config_name,
        "mode": h.mode,
        "action": h.action,
        "before_value": h.before_value,
        "after_value": h.after_value,
        "change_summary": h.change_summary,
        "changed_by": h.changed_by,
        "changed_by_username": h.changed_by_username,
        "created_at": h.created_at.isoformat() + "Z" if h.created_at else None,
    }


# ═══════════════════════════════════════════════════════════
# 系统提示词 CRUD + 版本控制
# ═══════════════════════════════════════════════════════════

async def list_prompts(db: AsyncSession, prompt_type: Optional[str] = None) -> list[SystemPrompt]:
    """列出所有提示词（可按类型过滤）"""
    query = select(SystemPrompt).order_by(SystemPrompt.prompt_type.asc(), SystemPrompt.prompt_key.asc())
    if prompt_type:
        query = query.where(SystemPrompt.prompt_type == prompt_type)
    return list((await db.execute(query)).scalars().all())


async def get_prompt(db: AsyncSession, prompt_id: int) -> SystemPrompt | None:
    return (await db.execute(select(SystemPrompt).where(SystemPrompt.id == prompt_id))).scalar_one_or_none()


async def get_prompt_by_key(db: AsyncSession, prompt_key: str) -> SystemPrompt | None:
    return (await db.execute(select(SystemPrompt).where(SystemPrompt.prompt_key == prompt_key))).scalar_one_or_none()


async def update_prompt_content(
    db: AsyncSession,
    prompt_id: int,
    data: dict,
    admin_user: User,
) -> SystemPrompt:
    """更新提示词内容（创建新版本快照）"""
    p = await get_prompt(db, prompt_id)
    if not p:
        raise ValueError("提示词不存在")

    content = (data.get("content") or "").strip()
    if not content:
        raise ValueError("提示词内容不能为空")

    # 写入旧版本快照（基于修改前的状态）
    await _write_prompt_version(
        db, prompt=p,
        change_note=data.get("change_note") or "更新提示词",
        admin_user=admin_user,
    )

    p.content = content
    if "variables_doc" in data:
        p.variables_doc = data.get("variables_doc") or ""
    if "description" in data:
        p.description = data.get("description") or ""
    if "name" in data and data["name"]:
        p.name = data["name"].strip()
    p.version = (p.version or 1) + 1
    p.updated_by = admin_user.id
    await db.flush()
    return p


async def restore_prompt_default(db: AsyncSession, prompt_id: int, admin_user: User) -> SystemPrompt:
    """恢复提示词为系统默认内容（写入新版本，便于回滚）"""
    p = await get_prompt(db, prompt_id)
    if not p:
        raise ValueError("提示词不存在")
    if not p.is_default:
        raise ValueError("仅系统内置提示词支持恢复默认")

    # 找到默认内容
    defaults = {d["prompt_key"]: d for d in _default_prompts()}
    if p.prompt_key not in defaults:
        raise ValueError("未找到该提示词的默认内容")
    default_content = defaults[p.prompt_key]["content"]
    default_vars = defaults[p.prompt_key].get("variables_doc") or ""

    # 写入旧版本快照
    await _write_prompt_version(
        db, prompt=p,
        change_note="恢复为系统默认配置",
        admin_user=admin_user,
    )

    p.content = default_content
    p.variables_doc = default_vars
    p.version = (p.version or 1) + 1
    p.updated_by = admin_user.id
    await db.flush()
    return p


async def list_prompt_versions(
    db: AsyncSession,
    prompt_key: str,
    *,
    page: int = 1,
    page_size: int = 30,
) -> tuple[list[SystemPromptVersion], int]:
    """查询提示词历史版本"""
    count_query = select(func.count(SystemPromptVersion.id)).where(SystemPromptVersion.prompt_key == prompt_key)
    total = (await db.execute(count_query)).scalar() or 0
    query = (
        select(SystemPromptVersion)
        .where(SystemPromptVersion.prompt_key == prompt_key)
        .order_by(SystemPromptVersion.version.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await db.execute(query)).scalars().all())
    return items, total


async def get_prompt_version(db: AsyncSession, version_id: int) -> SystemPromptVersion | None:
    return (
        await db.execute(select(SystemPromptVersion).where(SystemPromptVersion.id == version_id))
    ).scalar_one_or_none()


async def rollback_prompt_to_version(
    db: AsyncSession,
    prompt_id: int,
    version_id: int,
    admin_user: User,
) -> SystemPrompt:
    """将提示词回滚到指定历史版本"""
    p = await get_prompt(db, prompt_id)
    if not p:
        raise ValueError("提示词不存在")
    v = await get_prompt_version(db, version_id)
    if not v or v.prompt_key != p.prompt_key:
        raise ValueError("版本不存在或不属于该提示词")

    # 写入当前状态为快照（便于再次回滚）
    await _write_prompt_version(
        db, prompt=p,
        change_note=f"回滚前的版本（v{p.version}）",
        admin_user=admin_user,
    )

    p.content = v.content
    p.variables_doc = v.variables_doc or ""
    p.version = (p.version or 1) + 1
    p.updated_by = admin_user.id
    await db.flush()
    return p


def prompt_to_dict(p: SystemPrompt) -> dict:
    return {
        "id": p.id,
        "prompt_key": p.prompt_key,
        "name": p.name,
        "prompt_type": p.prompt_type,
        "content": p.content,
        "variables_doc": p.variables_doc or "",
        "description": p.description or "",
        "version": p.version,
        "is_default": p.is_default,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() + "Z" if p.created_at else None,
        "updated_by": p.updated_by,
        "updated_at": p.updated_at.isoformat() + "Z" if p.updated_at else None,
    }


def prompt_version_to_dict(v: SystemPromptVersion) -> dict:
    return {
        "id": v.id,
        "prompt_key": v.prompt_key,
        "version": v.version,
        "content": v.content,
        "variables_doc": v.variables_doc or "",
        "change_note": v.change_note or "",
        "changed_by": v.changed_by,
        "changed_by_username": v.changed_by_username,
        "created_at": v.created_at.isoformat() + "Z" if v.created_at else None,
    }


# ═══════════════════════════════════════════════════════════
# 运行时加载器（供 harness / main.py 使用）
# ═══════════════════════════════════════════════════════════

async def load_active_llm_settings(db: AsyncSession, mode: str) -> dict | None:
    """加载指定 mode 当前生效的 LLM 配置（含明文 api_key）

    返回 None 表示未配置，调用方应 fallback 到 settings.* 环境变量。
    """
    cfg = await get_active_llm_config(db, mode)
    if not cfg:
        return None
    return {
        "model_name": cfg.model_name,
        "base_url": cfg.base_url,
        "api_key": cfg.api_key,
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
    }


async def load_active_prompt_content(db: AsyncSession, prompt_key: str) -> str | None:
    """加载指定 key 当前生效的提示词内容

    返回 None 表示未配置，调用方应 fallback 到 prompts.py 中的常量。
    """
    p = await get_prompt_by_key(db, prompt_key)
    if not p:
        return None
    return p.content
