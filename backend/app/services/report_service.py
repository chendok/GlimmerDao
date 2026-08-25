"""报告管理服务层 — 封装报告生成、保存、查询、删除业务逻辑"""
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import BaziReport, BaziArchive

logger = logging.getLogger("uvicorn")


async def find_archive_for_report(
    db: AsyncSession,
    user_id: int,
    archive_id: Optional[int] = None,
    chart_name: Optional[str] = None,
) -> int:
    """
    查找或验证报告关联的档案 ID。

    返回:
        archive_id (int)

    异常:
        HTTPException: 档案不存在或无权访问
    """
    from fastapi import HTTPException

    if archive_id is not None:
        result = await db.execute(
            select(BaziArchive).where(
                BaziArchive.id == archive_id,
                BaziArchive.user_id == user_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=404,
                detail={"code": "ARCHIVE_NOT_FOUND", "message": "关联档案不存在或无权访问"}
            )
        return archive_id

    if not chart_name:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_CHART_NAME", "message": "缺少 chart_name 无法匹配档案"}
        )

    result = await db.execute(
        select(BaziArchive).where(
            BaziArchive.user_id == user_id,
            BaziArchive.name == chart_name,
        ).limit(1)
    )
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ARCHIVE_NOT_FOUND",
                "message": f"未找到命主「{chart_name}」的排盘档案，请先保存档案"
            }
        )
    return archive.id


async def create_report(
    db: AsyncSession,
    user_id: int,
    archive_id: int,
    title: str,
    chart_type: str,
    report_content: str,
    chart_name: Optional[str] = None,
    skill_name: Optional[str] = None,
    report_format: str = "html",
) -> BaziReport:
    """创建并保存报告"""
    report = BaziReport(
        user_id=user_id,
        archive_id=archive_id,
        title=title,
        chart_type=chart_type,
        chart_name=chart_name,
        skill_name=skill_name,
        report_format=report_format,
        report_content=report_content,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    logger.info("用户 %d 保存解盘报告: %s (archive_id=%d)", user_id, title, archive_id)
    return report


async def get_report_by_id(db: AsyncSession, report_id: int, user_id: int) -> Optional[BaziReport]:
    """根据 ID 和用户 ID 获取报告"""
    result = await db.execute(
        select(BaziReport).where(
            BaziReport.id == report_id,
            BaziReport.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_reports(
    db: AsyncSession,
    user_id: int,
    keyword: Optional[str] = None,
    chart_type: Optional[str] = None,
    archive_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[BaziReport], int]:
    """分页查询报告列表，返回 (items, total)"""
    query = select(BaziReport).where(BaziReport.user_id == user_id)

    if keyword:
        kw = f"%{keyword}%"
        query = query.where(
            or_(
                BaziReport.title.ilike(kw),
                BaziReport.chart_name.ilike(kw),
            )
        )

    if chart_type:
        query = query.where(BaziReport.chart_type == chart_type)

    if archive_id is not None:
        query = query.where(BaziReport.archive_id == archive_id)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(BaziReport.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = list(result.scalars().all())
    return items, total


async def update_report(
    db: AsyncSession,
    report: BaziReport,
    title: Optional[str] = None,
    report_content: Optional[str] = None,
) -> BaziReport:
    """更新报告"""
    if title is not None:
        report.title = title
    if report_content is not None:
        report.report_content = report_content
    report.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(report)
    logger.info("用户 %d 更新报告: %s (id=%d)", report.user_id, report.title, report.id)
    return report


async def delete_report(db: AsyncSession, report: BaziReport) -> None:
    """删除报告"""
    await db.execute(delete(BaziReport).where(BaziReport.id == report.id))
    await db.commit()
    logger.info("用户 %d 删除报告: %s (id=%d)", report.user_id, report.title, report.id)


async def batch_delete_reports(db: AsyncSession, user_id: int, ids: list[int]) -> int:
    """批量删除报告，返回删除数量"""
    result = await db.execute(
        delete(BaziReport).where(
            BaziReport.id.in_(ids),
            BaziReport.user_id == user_id,
        )
    )
    await db.commit()
    count = result.rowcount
    logger.info("用户 %d 批量删除报告: %d 条", user_id, count)
    return count