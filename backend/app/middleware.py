"""安全中间件：安全响应头 + 请求频率限制"""
import time
import logging
from collections import defaultdict
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("uvicorn")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """为所有响应添加安全相关的 HTTP 头"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """基于内存滑动窗口的请求频率限制中间件"""

    # 路由前缀 → (最大请求数, 窗口秒数)
    DEFAULT_LIMITS: dict[str, tuple[int, int]] = {
        "/api/v1/auth/login": (10, 60),
        "/api/v1/auth/email/send-code": (3, 60),
        "/api/v1/chat/": (30, 60),
    }

    def __init__(self, app, enabled: bool = True):
        super().__init__(app)
        self._enabled = enabled
        self._windows: dict[str, list[float]] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    def _clean_window(self, key: str, window_seconds: int) -> None:
        now = time.time()
        cutoff = now - window_seconds
        self._windows[key] = [t for t in self._windows[key] if t > cutoff]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if not self._enabled:
            return await call_next(request)

        path = request.url.path
        matched_limit = None
        for prefix, limit in self.DEFAULT_LIMITS.items():
            if path.startswith(prefix):
                matched_limit = limit
                break

        if matched_limit is None:
            return await call_next(request)

        max_requests, window_seconds = matched_limit
        ip = self._get_client_ip(request)
        key = f"{ip}:{path}"

        self._clean_window(key, window_seconds)
        if len(self._windows[key]) >= max_requests:
            logger.warning("Rate limit exceeded: ip=%s path=%s count=%d", ip, path, len(self._windows[key]))
            return Response(
                status_code=429,
                content='{"success":false,"message":"请求过于频繁，请稍后重试"}',
                media_type="application/json",
            )

        self._windows[key].append(time.time())
        return await call_next(request)