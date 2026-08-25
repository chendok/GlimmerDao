"""档案管理服务层 — 封装档案 CRUD 业务逻辑"""
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import BaziArchive, BaziReport

logger = logging.getLogger("uvicorn")


async def create_archive(
    db: AsyncSession,
    user_id: int,
    name: str,
    gender: str,
    birth_datetime: str,
    birthplace: Optional[str] = None,
    calendar_type: str = "公历",
    group_name: str = "全部",
    bazi_result: Optional[dict] = None,
) -> BaziArchive:
    """创建八字档案"""
    bazi_json = json.dumps(bazi_result, ensure_ascii=False) if bazi_result else None
    archive = BaziArchive(
        user_id=user_id,
        name=name,
        gender=gender,
        birth_datetime=birth_datetime,
        birthplace=birthplace,
        calendar_type=calendar_type,
        group_name=group_name or "全部",
        bazi_result=bazi_json,
    )
    db.add(archive)
    await db.commit()
    await db.refresh(archive)
    logger.info("用户 %d 保存档案: %s", user_id, name)
    return archive


async def get_archive_by_id(db: AsyncSession, archive_id: int, user_id: int) -> Optional[BaziArchive]:
    """根据 ID 和用户 ID 获取档案"""
    result = await db.execute(
        select(BaziArchive).where(
            BaziArchive.id == archive_id,
            BaziArchive.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_archives(
    db: AsyncSession,
    user_id: int,
    keyword: Optional[str] = None,
    group: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BaziArchive], int]:
    """分页查询档案列表，返回 (items, total)"""
    query = select(BaziArchive).where(BaziArchive.user_id == user_id)

    if keyword:
        kw = f"%{keyword}%"
        query = query.where(
            or_(
                BaziArchive.name.ilike(kw),
                BaziArchive.birthplace.ilike(kw),
            )
        )

    if group:
        query = query.where(BaziArchive.group_name == group)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(BaziArchive.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = list(result.scalars().all())
    return items, total


async def update_archive(
    db: AsyncSession,
    archive: BaziArchive,
    name: str,
    gender: str,
    birth_datetime: str,
    birthplace: Optional[str] = None,
    calendar_type: str = "公历",
    group_name: str = "全部",
    bazi_result: Optional[dict] = None,
) -> BaziArchive:
    """更新档案"""
    archive.name = name
    archive.gender = gender
    archive.birth_datetime = birth_datetime
    archive.birthplace = birthplace
    archive.calendar_type = calendar_type
    archive.group_name = group_name or "全部"
    archive.bazi_result = json.dumps(bazi_result, ensure_ascii=False) if bazi_result else None
    archive.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(archive)
    logger.info("用户 %d 更新档案: %s (id=%d)", archive.user_id, archive.name, archive.id)
    return archive


async def delete_archive(db: AsyncSession, archive: BaziArchive) -> None:
    """删除档案"""
    await db.execute(delete(BaziArchive).where(BaziArchive.id == archive.id))
    await db.commit()
    logger.info("用户 %d 删除档案: %s (id=%d)", archive.user_id, archive.name, archive.id)


async def batch_delete_archives(db: AsyncSession, user_id: int, ids: list[int]) -> int:
    """批量删除档案，返回删除数量"""
    result = await db.execute(
        delete(BaziArchive).where(
            BaziArchive.id.in_(ids),
            BaziArchive.user_id == user_id,
        )
    )
    await db.commit()
    count = result.rowcount
    logger.info("用户 %d 批量删除档案: %d 条", user_id, count)
    return count


async def list_archive_reports(
    db: AsyncSession,
    archive_id: int,
    user_id: int,
) -> list[BaziReport]:
    """列出某档案下的所有报告"""
    result = await db.execute(
        select(BaziReport).where(
            BaziReport.archive_id == archive_id,
            BaziReport.user_id == user_id,
        ).order_by(BaziReport.created_at.desc())
    )
    return list(result.scalars().all())