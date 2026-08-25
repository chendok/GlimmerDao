"""系统配置数据模型 — 大模型配置与提示词管理

承载系统管理模块「大模型」「提示词」页签的持久化数据：
- LLMConfig: 大模型配置项（区分 fast / think 两种运行模式）
- LLMConfigHistory: 大模型配置变更历史（审计追溯）
- SystemPrompt: 系统提示词（对话框 / 生成报告两类）
- SystemPromptVersion: 提示词版本快照（版本控制与对比）

所有表均通过 is_active 标识当前生效记录，便于一键切换与回滚。
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, Index
from .user import Base


class LLMConfig(Base):
    """大模型配置项

    同一种 mode（fast/think）下可有多个配置，仅一个 is_active=True。
    api_key 字段在 API 响应中永远以脱敏形式返回（mask_api_key）。
    """
    __tablename__ = "llm_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mode = Column(String(16), nullable=False, index=True, comment="运行模式: fast(快速)/think(思考)/vision(视觉)")
    name = Column(String(64), nullable=False, comment="配置名称（同一 mode 下唯一）")
    model_name = Column(String(128), nullable=False, comment="模型名称，如 gpt-4o-mini")
    base_url = Column(String(256), nullable=False, default="https://api.openai.com/v1", comment="API base URL")
    api_key = Column(String(256), nullable=False, default="", comment="API Key（明文存储，响应时脱敏）")
    temperature = Column(Float, nullable=False, default=0.7, comment="采样温度 0.0-2.0")
    max_tokens = Column(Integer, nullable=False, default=32768, comment="单次响应最大 tokens")
    is_active = Column(Boolean, nullable=False, default=False, index=True, comment="是否当前生效")
    is_default = Column(Boolean, nullable=False, default=False, comment="是否为系统默认（不可删除）")
    description = Column(Text, nullable=True, comment="配置描述/备注")
    created_by = Column(Integer, nullable=True, comment="创建人 user_id")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(Integer, nullable=True, comment="最后修改人 user_id")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_llm_configs_mode_active", "mode", "is_active"),
    )


class LLMConfigHistory(Base):
    """大模型配置变更历史 — 完整审计追溯

    每次配置新增/修改/删除/激活都会写入一条记录，包含修改人、修改时间、前后值对比。
    """
    __tablename__ = "llm_config_histories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_id = Column(Integer, nullable=True, index=True, comment="关联的 LLMConfig.id（删除后保留）")
    config_name = Column(String(64), nullable=True, comment="配置名称快照（删除后用于审计）")
    mode = Column(String(16), nullable=True, comment="运行模式快照")
    action = Column(String(16), nullable=False, comment="操作类型: create/update/delete/activate")
    before_value = Column(Text, nullable=True, comment="变更前 JSON 快照")
    after_value = Column(Text, nullable=True, comment="变更后 JSON 快照")
    change_summary = Column(Text, nullable=True, comment="变更摘要（自动生成）")
    changed_by = Column(Integer, nullable=True, comment="修改人 user_id")
    changed_by_username = Column(String(128), nullable=True, comment="修改人用户名/邮箱")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SystemPrompt(Base):
    """系统提示词

    每个 prompt_key（如 chat_system / report_system）对应一行「当前生效」记录，
    历史版本存放在 SystemPromptVersion。is_default 标识系统内置默认（不可删除）。
    """
    __tablename__ = "system_prompts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    prompt_key = Column(String(64), nullable=False, unique=True, index=True, comment="提示词键名: chat_system/report_system")
    name = Column(String(128), nullable=False, comment="显示名称")
    prompt_type = Column(String(16), nullable=False, index=True, comment="类型: chat(对话框)/report(生成报告)")
    content = Column(Text, nullable=False, comment="提示词正文")
    variables_doc = Column(Text, nullable=True, comment="变量说明文档（Markdown）")
    description = Column(Text, nullable=True, comment="提示词描述")
    version = Column(Integer, nullable=False, default=1, comment="当前版本号")
    is_default = Column(Boolean, nullable=False, default=False, comment="是否为系统默认（不可删除）")
    created_by = Column(Integer, nullable=True, comment="创建人 user_id")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(Integer, nullable=True, comment="最后修改人 user_id")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemPromptVersion(Base):
    """提示词版本快照 — 版本控制与对比

    每次保存提示词时写入一条历史版本，支持版本切换、版本对比、回滚。
    通过 prompt_key 跨版本关联（而非 prompt_id，避免删除重建后断裂）。
    """
    __tablename__ = "system_prompt_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    prompt_key = Column(String(64), nullable=False, index=True, comment="关联的提示词键名")
    version = Column(Integer, nullable=False, comment="版本号")
    content = Column(Text, nullable=False, comment="该版本提示词正文")
    variables_doc = Column(Text, nullable=True, comment="该版本变量说明")
    change_note = Column(Text, nullable=True, comment="修改说明")
    changed_by = Column(Integer, nullable=True, comment="修改人 user_id")
    changed_by_username = Column(String(128), nullable=True, comment="修改人用户名/邮箱")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_prompt_versions_key_version", "prompt_key", "version"),
    )
