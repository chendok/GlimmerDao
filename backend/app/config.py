"""应用配置"""
import os
import secrets
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME: str = "微光问道"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # LLM 配置 - 快速模式（响应快、成本低）
    FAST_LLM_API_KEY: str = os.getenv("FAST_LLM_API_KEY", "")
    FAST_LLM_MODEL: str = os.getenv("FAST_LLM_MODEL", "gpt-4o-mini")
    FAST_LLM_BASE_URL: str = os.getenv("FAST_LLM_BASE_URL", "https://api.openai.com/v1")
    FAST_LLM_TEMPERATURE: float = float(os.getenv("FAST_LLM_TEMPERATURE", "0.7"))

    # LLM 配置 - 思考模式（深度思考、质量高）
    THINK_LLM_API_KEY: str = os.getenv("THINK_LLM_API_KEY", "")
    THINK_LLM_MODEL: str = os.getenv("THINK_LLM_MODEL", "gpt-4o")
    THINK_LLM_BASE_URL: str = os.getenv("THINK_LLM_BASE_URL", "https://api.openai.com/v1")
    THINK_LLM_TEMPERATURE: float = float(os.getenv("THINK_LLM_TEMPERATURE", "0.3"))

    # LLM 配置 - 视觉模式（支持图片输入，用于 OCR/图片解析）- 可选，未配置则回退到 FAST_LLM
    VISION_LLM_API_KEY: str = os.getenv("VISION_LLM_API_KEY", "")
    VISION_LLM_MODEL: str = os.getenv("VISION_LLM_MODEL", "")
    VISION_LLM_BASE_URL: str = os.getenv("VISION_LLM_BASE_URL", "")

    # 兼容旧配置（向后兼容）
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # 数据库
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "sqlite+aiosqlite:///./data/wendao.db"
    )

    # 服务
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "5050"))

    # 前端开发端口（供参考 / CORS）
    FRONTEND_PORT: int = int(os.getenv("FRONTEND_PORT", "5000"))
    CORS_ALLOW_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ALLOW_ORIGINS",
            "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5001,http://127.0.0.1:5001",
        ).split(",")
        if origin.strip()
    ]

    # Agent 配置
    MAX_TOOL_ITERATIONS: int = int(os.getenv("MAX_TOOL_ITERATIONS", "10"))
    MAX_CONVERSATION_TOKENS: int = int(os.getenv("MAX_CONVERSATION_TOKENS", "8000"))
    # 上下文压缩摘要用的模型（缺省复用 OPENAI_MODEL）；设为更廉价模型可降低成本
    SUMMARY_MODEL: str = os.getenv("SUMMARY_MODEL", "")
    # 自主规划：启用 Planner 节点（任务分解）与 Reflector 节点（执行反思）
    ENABLE_PLANNER: bool = os.getenv("ENABLE_PLANNER", "true").lower() == "true"
    ENABLE_REFLECTOR: bool = os.getenv("ENABLE_REFLECTOR", "true").lower() == "true"
    # 用户画像 / 长期记忆：跨会话记忆用户偏好与生辰数据（P2-2）
    ENABLE_USER_PROFILE: bool = os.getenv("ENABLE_USER_PROFILE", "true").lower() == "true"
    # 自适应学习：记录执行指标并从历史中学习最优配置（P3-1）
    ENABLE_LEARNING: bool = os.getenv("ENABLE_LEARNING", "true").lower() == "true"
    # 评估指标采集：生成自主性与任务质量报告（P3-2）
    ENABLE_METRICS: bool = os.getenv("ENABLE_METRICS", "true").lower() == "true"

    # JWT 认证配置
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

    # 腾讯云短信服务配置
    SMS_PROVIDER: str = os.getenv("SMS_PROVIDER", "tencent")
    TENCENTCLOUD_SECRET_ID: str = os.getenv("TENCENTCLOUD_SECRET_ID", "")
    TENCENTCLOUD_SECRET_KEY: str = os.getenv("TENCENTCLOUD_SECRET_KEY", "")
    TENCENT_SMS_SDK_APP_ID: str = os.getenv("TENCENT_SMS_SDK_APP_ID", "")
    TENCENT_SMS_SIGN_NAME: str = os.getenv("TENCENT_SMS_SIGN_NAME", "")
    TENCENT_SMS_TEMPLATE_LOGIN: str = os.getenv("TENCENT_SMS_TEMPLATE_LOGIN", "")
    TENCENT_SMS_TEMPLATE_REGISTER: str = os.getenv("TENCENT_SMS_TEMPLATE_REGISTER", "")
    TENCENT_SMS_TEMPLATE_RESET: str = os.getenv("TENCENT_SMS_TEMPLATE_RESET", "")
    TENCENT_SMS_REGION: str = os.getenv("TENCENT_SMS_REGION", "ap-guangzhou")
    SMS_SIMULATE: bool = os.getenv("SMS_SIMULATE", "false").lower() == "true"

    # 安全配置
    MAX_LOGIN_ATTEMPTS: int = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_MINUTES: int = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "30"))
    SMS_CODE_EXPIRE_MINUTES: int = int(os.getenv("SMS_CODE_EXPIRE_MINUTES", "5"))
    SMS_CODE_COOLDOWN_SECONDS: int = int(os.getenv("SMS_CODE_COOLDOWN_SECONDS", "60"))
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    REQUEST_MAX_SIZE: int = int(os.getenv("REQUEST_MAX_SIZE", "10485760"))  # 10MB

    # 邮件服务配置
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.qq.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "465"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_USE_SSL: bool = os.getenv("SMTP_USE_SSL", "true").lower() == "true"
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "微光问道")
    EMAIL_CODE_EXPIRE_MINUTES: int = int(os.getenv("EMAIL_CODE_EXPIRE_MINUTES", "15"))
    EMAIL_CODE_COOLDOWN_SECONDS: int = int(os.getenv("EMAIL_CODE_COOLDOWN_SECONDS", "60"))
    EMAIL_MAX_ATTEMPTS: int = int(os.getenv("EMAIL_MAX_ATTEMPTS", "5"))
    EMAIL_SIMULATE: bool = os.getenv("EMAIL_SIMULATE", "true").lower() == "true"


settings = Settings()

if not settings.JWT_SECRET_KEY:
    if settings.DEBUG:
        settings.JWT_SECRET_KEY = secrets.token_urlsafe(32)
        import logging
        logging.getLogger("uvicorn").warning(
            "JWT_SECRET_KEY 未配置，已自动生成临时密钥: %s。生产环境请务必在 .env 中显式配置强密钥。",
            settings.JWT_SECRET_KEY,
        )
    else:
        raise RuntimeError("JWT_SECRET_KEY 未配置，生产环境禁止使用空密钥启动。请在 .env 中设置 JWT_SECRET_KEY。")

