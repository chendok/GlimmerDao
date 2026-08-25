"""FastAPI 应用入口"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import settings
from .middleware import SecurityHeadersMiddleware, RateLimitMiddleware
from .api.v1 import chat, session, auth, archive, huangli, speech, upload, profile, metrics, report, chart_info, physiognomy, knowledge, system

logger = logging.getLogger("uvicorn")


async def _init_database() -> None:
    """初始化数据库表"""
    try:
        from .database import init_db
        await init_db()
        logger.info("数据库表初始化完成")
    except Exception as e:
        logger.warning("数据库初始化失败: %s", e)


async def _init_agent() -> None:
    """初始化 Agent Harness（LLM 模型 + 工具 + MCP 服务）

    优先从数据库 system_config 加载激活的 LLM 配置（由系统管理模块维护），
    若数据库无激活配置或加载失败，则回退到 .env 环境变量配置。
    """
    try:
        from .core.agent.harness import init_agent_harness
        from .core.agent.prompts import SYSTEM_PROMPT
        from .core.tools.bazi_tools import ALL_TOOLS
        from langchain_openai import ChatOpenAI
        from .services.system_config_service import load_active_llm_settings
        from .database import async_session

        has_api_key = settings.FAST_LLM_API_KEY or settings.THINK_LLM_API_KEY or settings.OPENAI_API_KEY
        if not has_api_key:
            logger.warning(
                "未配置 FAST_LLM_API_KEY 或 THINK_LLM_API_KEY。请复制 .env.example 为 .env 并填入 API Key。"
                "服务将以降级模式运行，聊天功能不可用。"
            )
            return

        # 尝试从 DB 加载激活的 LLM 配置（失败则回退到 .env）
        fast_cfg = None
        think_cfg = None
        try:
            async with async_session() as db:
                fast_cfg = await load_active_llm_settings(db, "fast")
                think_cfg = await load_active_llm_settings(db, "think")
        except Exception as e:
            logger.warning("从数据库加载 LLM 配置失败，回退到 .env 配置: %s", e)

        # 快速模式 LLM（DB 配置优先，缺省回退到 .env）
        if fast_cfg and fast_cfg.get("api_key"):
            fast_model = fast_cfg["model_name"]
            fast_api_key = fast_cfg["api_key"]
            fast_base_url = fast_cfg["base_url"]
            fast_temperature = fast_cfg["temperature"]
            fast_max_tokens = fast_cfg["max_tokens"]
            logger.info("快速模式 LLM 使用 DB 配置: model=%s", fast_model)
        else:
            fast_model = settings.FAST_LLM_MODEL
            fast_api_key = settings.FAST_LLM_API_KEY or settings.OPENAI_API_KEY
            fast_base_url = settings.FAST_LLM_BASE_URL
            fast_temperature = settings.FAST_LLM_TEMPERATURE
            fast_max_tokens = 32768

        fast_llm = ChatOpenAI(
            model=fast_model,
            api_key=fast_api_key,
            base_url=fast_base_url,
            temperature=fast_temperature,
            streaming=True,
            max_tokens=fast_max_tokens,
        )

        # 思考模式 LLM（DB 配置优先，缺省回退到 .env）
        if think_cfg and think_cfg.get("api_key"):
            think_model = think_cfg["model_name"]
            think_api_key = think_cfg["api_key"]
            think_base_url = think_cfg["base_url"]
            think_temperature = think_cfg["temperature"]
            think_max_tokens = think_cfg["max_tokens"]
            logger.info("思考模式 LLM 使用 DB 配置: model=%s", think_model)
        else:
            think_model = settings.THINK_LLM_MODEL
            think_api_key = settings.THINK_LLM_API_KEY or settings.OPENAI_API_KEY
            think_base_url = settings.THINK_LLM_BASE_URL
            think_temperature = settings.THINK_LLM_TEMPERATURE
            think_max_tokens = 32768

        think_llm = ChatOpenAI(
            model=think_model,
            api_key=think_api_key,
            base_url=think_base_url,
            temperature=think_temperature,
            streaming=True,
            max_tokens=think_max_tokens,
        )

        # 摘要模型（可选）
        summary_llm = None
        if settings.SUMMARY_MODEL and settings.SUMMARY_MODEL != fast_model:
            try:
                summary_llm = ChatOpenAI(
                    model=settings.SUMMARY_MODEL,
                    api_key=fast_api_key,
                    base_url=fast_base_url,
                    temperature=0,
                    streaming=False,
                )
                logger.info("摘要模型已配置: %s", settings.SUMMARY_MODEL)
            except Exception as e:
                logger.warning("摘要模型初始化失败，将复用快速模式 LLM: %s", e)

        # 连接 MCP 服务并合并工具
        from .core.tools.mcp_client import mcp_client
        await mcp_client.connect_all()
        all_tools = ALL_TOOLS + mcp_client.to_langchain_tools()

        init_agent_harness(
            llm=fast_llm,
            think_llm=think_llm,
            tools=all_tools,
            system_prompt=SYSTEM_PROMPT,
            summary_llm=summary_llm,
        )
        logger.info("Agent Harness 初始化成功（工具数: %d，快速模型: %s，思考模型: %s）",
                   len(all_tools), fast_model, think_model)
    except Exception as e:
        logger.warning("Agent Harness 初始化失败: %s。服务将以降级模式运行。", e)


async def _cleanup_resources() -> None:
    """清理资源（MCP 连接等）"""
    try:
        from .core.tools.mcp_client import mcp_client
        await mcp_client.close_all()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    await _init_database()
    await _init_agent()
    yield
    await _cleanup_resources()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    request_max_size=52_428_800,  # 50MB 请求体大小限制（支持麻衣神相双图上传）
)

# 全局异常处理器 - 确保所有错误以 JSON 格式返回
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """处理 HTTP 异常"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
        },
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """处理请求验证错误"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error.get("loc", []) if loc != "body"),
            "message": error.get("msg", "Unknown error"),
        })
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "请求参数验证失败",
            "errors": errors,
        },
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """处理全局异常"""
    logger = logging.getLogger("uvicorn")
    logger.error(f"未处理的异常: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "服务器内部错误",
        },
    )

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    expose_headers=["X-Request-Id"],
)

# 安全响应头中间件
app.add_middleware(SecurityHeadersMiddleware)

# 请求频率限制中间件
app.add_middleware(RateLimitMiddleware, enabled=not settings.DEBUG)

# GZip 压缩中间件（大于 1KB 的响应启用压缩）
app.add_middleware(GZipMiddleware, minimum_size=1000)


class DisableGZipForSSEMiddleware:
    """对 SSE（text/event-stream）请求禁用 GZip 压缩

    GZip 会将整个响应缓冲后再压缩，破坏 SSE 流式传输。
    此中间件在 GZipMiddleware 之前执行，将 SSE 请求的
    Accept-Encoding 改为 identity，使 GZipMiddleware 跳过压缩。

    检测方式（满足任一即视为 SSE 请求）：
    1. Accept 头包含 text/event-stream
    2. URL 路径包含 /stream（覆盖 /chat/stream、/reports/generate/stream 等端点）
    """

    # SSE 端点路径关键字
    SSE_PATH_KEYWORDS = ("/stream",)

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = scope.get("headers", [])
            accept_value = ""
            path = scope.get("path", "").lower()

            for name, value in headers:
                if name == b"accept":
                    accept_value = value.decode("utf-8", "").lower()
                    break

            # 判断是否为 SSE 请求：Accept 头或 URL 路径匹配
            is_sse = (
                "text/event-stream" in accept_value
                or any(kw in path for kw in self.SSE_PATH_KEYWORDS)
            )

            if is_sse:
                # 将 Accept-Encoding 改为 identity，防止 GZipMiddleware 压缩
                new_headers = []
                for name, value in headers:
                    if name == b"accept-encoding":
                        value = b"identity"
                    new_headers.append((name, value))
                scope["headers"] = new_headers
        await self.app(scope, receive, send)


# SSE 禁用 GZip 中间件（后添加 = 先执行，在 GZipMiddleware 之前运行）
app.add_middleware(DisableGZipForSSEMiddleware)

# 注册路由
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(session.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(archive.router, prefix="/api/v1/archives", tags=["archives"])
app.include_router(huangli.router, prefix="/api/v1/huangli", tags=["huangli"])
app.include_router(speech.router, prefix="/api/v1/speech", tags=["speech"])
app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["profile"])
app.include_router(metrics.router, prefix="/api/v1/metrics", tags=["metrics"])
app.include_router(report.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(chart_info.router, prefix="/api/v1/chart-infos", tags=["chart-infos"])
app.include_router(physiognomy.router, prefix="/api/v1/physiognomy", tags=["physiognomy"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["knowledge"])
app.include_router(system.router, prefix="/api/v1/system", tags=["system"])

# 挂载上传文件静态目录
uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health")
async def health():
    return {"status": "ok"}
