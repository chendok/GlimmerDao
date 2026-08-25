"""数据库连接管理"""
import logging
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from .config import settings

logger = logging.getLogger("uvicorn")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """获取数据库会话（依赖注入）"""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def _ensure_column(conn, table_name: str, column_name: str, column_def: str) -> None:
    """SQLite 兼容的字段迁移：若字段不存在则添加，已存在则忽略"""
    try:
        await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))
    except Exception:
        # 字段已存在或表不存在，忽略
        pass


async def init_db():
    """初始化数据库表"""
    # 导入所有模型以确保 Base.metadata 包含全部表定义
    from .models import user, chat, profile, metrics, knowledge  # noqa: F401
    from .models import system_config  # noqa: F401
    from .models.user import Base, User
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 手动迁移：为已存在的 bazi_reports 表添加 archive_id 字段
        # （create_all 不会修改已存在的表结构）
        await _ensure_column(conn, "bazi_reports", "archive_id", "INTEGER")
        # 手动迁移：为已存在的 bazi_archives 表添加个人补充信息字段
        await _ensure_column(conn, "bazi_archives", "supplemental_info", "TEXT")
        # 手动迁移：为已存在的 users 表添加 is_admin 字段
        await _ensure_column(conn, "users", "is_admin", "BOOLEAN DEFAULT 0")
        # 手动迁移：为已存在的 knowledge_categories 表添加 code 字段
        await _ensure_column(conn, "knowledge_categories", "code", "VARCHAR(64)")

        # 管理员初始化：若 chendok@163.com 用户存在，设置为管理员
        result = await conn.execute(
            select(User.is_admin).where(User.email == "chendok@163.com")
        )
        admin_row = result.first()
        if admin_row and not admin_row[0]:
            await conn.execute(
                text("UPDATE users SET is_admin = 1 WHERE email = :email"),
                {"email": "chendok@163.com"},
            )
            logger.info("管理员账户已初始化: chendok@163.com")

    # 系统配置默认数据 seeding：大模型配置 + 系统提示词
    try:
        from .services.system_config_service import seed_default_configs
        async with async_session() as session:
            await seed_default_configs(session)
            await session.commit()
    except Exception as e:
        logger.warning("系统配置默认数据初始化失败: %s", e)