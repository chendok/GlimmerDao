"""启动脚本"""
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    force=True,
)

import os
import uvicorn
from app.config import settings

if __name__ == "__main__":
    # reload_dirs 使用「绝对路径」，避免 service.bat 通过 start /D 启动时
    # 子进程 cwd 传递不可靠，导致相对路径 "app" 解析错误、热重载失效。
    _BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    _APP_DIR = os.path.join(_BACKEND_DIR, "app")

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        # 仅监听 app/ 源码目录，排除数据库、缓存、日志等生成文件
        # 避免数据库写入触发误重载，导致流式连接中断（ERR_ABORTED）
        reload_dirs=[_APP_DIR],
        reload_excludes=[
            "**/__pycache__/**",
            "**/*.db",
            "**/*.db-journal",
            "**/*.sqlite*",
            "**/data/**",
            "**/logs/**",
            "**/.pytest_cache/**",
        ],
        log_level="info",
    )