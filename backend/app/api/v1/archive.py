"""八字档案库 API"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, delete, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_current_user_id
from ...database import get_db
from ...models.user import BaziArchive, BaziReport, ChartInfoRecord

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ── 请求/响应模型 ──

class SaveArchiveRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, description="姓名")
    gender: str = Field(..., pattern="^(男|女)$", description="性别")
    birth_datetime: str = Field(..., min_length=1, max_length=32, description="出生时间")
    birthplace: Optional[str] = Field(None, max_length=64, description="出生地")
    calendar_type: str = Field(default="公历", max_length=10, description="历法类型")
    group_name: Optional[str] = Field("全部", max_length=20, description="分组")
    bazi_result: Optional[dict] = Field(None, description="八字排盘结果")
    supplemental_info: Optional[str] = Field(None, max_length=10000, description="个人补充信息")
    overwrite: bool = Field(default=False, description="姓名重复时是否覆盖已存在档案")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("姓名不能为空")
        return v


class ArchiveResponse(BaseModel):
    id: int
    user_id: int
    name: str
    gender: str
    birth_datetime: str
    birthplace: Optional[str]
    calendar_type: str
    group_name: Optional[str]
    bazi_result: Optional[dict]
    supplemental_info: Optional[str] = None
    report_count: int = 0
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: BaziArchive, report_count: int = 0) -> "ArchiveResponse":
        bazi_data = None
        if obj.bazi_result:
            try:
                bazi_data = json.loads(obj.bazi_result)
            except (json.JSONDecodeError, TypeError):
                bazi_data = None

        return cls(
            id=obj.id,
            user_id=obj.user_id,
            name=obj.name,
            gender=obj.gender,
            birth_datetime=obj.birth_datetime,
            birthplace=obj.birthplace,
            calendar_type=obj.calendar_type,
            group_name=obj.group_name,
            bazi_result=bazi_data,
            supplemental_info=obj.supplemental_info,
            report_count=report_count,
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


class ArchiveListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ArchiveResponse]


class MessageResponse(BaseModel):
    success: bool = True
    message: str


# ── API 路由 ──

class SupplementalInfoRequest(BaseModel):
    supplemental_info: Optional[str] = Field(None, max_length=10000, description="个人补充信息")


@router.put("/by-name/{name}/supplemental-info", response_model=ArchiveResponse)
async def update_supplemental_info(
    name: str,
    req: SupplementalInfoRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BaziArchive).where(BaziArchive.user_id == user_id, BaziArchive.name == name))
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="档案不存在")
    archive.supplemental_info = req.supplemental_info.strip() if req.supplemental_info else None
    archive.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(archive)
    return ArchiveResponse.from_orm(archive)


@router.post("/", response_model=ArchiveResponse)
async def save_archive(
    req: SaveArchiveRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """保存八字档案"""
    # 检查姓名是否重复（同一用户下姓名唯一）
    existing = await db.execute(
        select(BaziArchive).where(
            BaziArchive.user_id == user_id,
            BaziArchive.name == req.name,
        )
    )
    existing_archive = existing.scalar_one_or_none()

    bazi_json = json.dumps(req.bazi_result, ensure_ascii=False) if req.bazi_result else None

    # 姓名重复且允许覆盖：更新已存在档案
    if existing_archive and req.overwrite:
        existing_archive.gender = req.gender
        existing_archive.birth_datetime = req.birth_datetime
        existing_archive.birthplace = req.birthplace
        existing_archive.calendar_type = req.calendar_type
        existing_archive.group_name = req.group_name or "全部"
        existing_archive.bazi_result = bazi_json
        existing_archive.supplemental_info = req.supplemental_info
        existing_archive.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing_archive)
        logger.info(f"用户 {user_id} 覆盖保存档案: {req.name} (id={existing_archive.id})")
        return ArchiveResponse.from_orm(existing_archive)

    if existing_archive:
        raise HTTPException(status_code=400, detail=f"姓名「{req.name}」已存在，档案库中姓名不能重复")

    archive = BaziArchive(
        user_id=user_id,
        name=req.name,
        gender=req.gender,
        birth_datetime=req.birth_datetime,
        birthplace=req.birthplace,
        calendar_type=req.calendar_type,
        group_name=req.group_name or "全部",
        bazi_result=bazi_json,
        supplemental_info=req.supplemental_info,
    )
    db.add(archive)
    await db.commit()
    await db.refresh(archive)

    logger.info(f"用户 {user_id} 保存档案: {req.name}")
    return ArchiveResponse.from_orm(archive)


@router.get("/", response_model=ArchiveListResponse)
async def list_archives(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    keyword: Optional[str] = Query(None, description="搜索关键字（姓名/出生地）"),
    group: Optional[str] = Query(None, description="分组筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """查询档案列表"""
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
    archives = result.scalars().all()

    # 批量查询每个档案的报告数量（排盘信息统计已下线，固定返回 0）
    archive_ids = [a.id for a in archives]
    report_count_map: dict[int, int] = {}

    if archive_ids:
        report_counts_result = await db.execute(
            select(BaziReport.archive_id, func.count())
            .where(
                BaziReport.archive_id.in_(archive_ids),
                BaziReport.user_id == user_id,
            )
            .group_by(BaziReport.archive_id)
        )
        report_count_map = dict(report_counts_result.all())

    items = [
        ArchiveResponse.from_orm(
            a,
            report_count=report_count_map.get(a.id, 0),
        )
        for a in archives
    ]

    return ArchiveListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/{archive_id}", response_model=ArchiveResponse)
async def get_archive(
    archive_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取档案详情"""
    result = await db.execute(
        select(BaziArchive).where(
            BaziArchive.id == archive_id,
            BaziArchive.user_id == user_id,
        )
    )
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="档案不存在")
    return ArchiveResponse.from_orm(archive)


@router.delete("/{archive_id}", response_model=MessageResponse)
async def delete_archive(
    archive_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除档案"""
    result = await db.execute(
        select(BaziArchive).where(
            BaziArchive.id == archive_id,
            BaziArchive.user_id == user_id,
        )
    )
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="档案不存在")

    await db.execute(delete(BaziArchive).where(BaziArchive.id == archive_id))
    await db.commit()

    logger.info(f"用户 {user_id} 删除档案: {archive.name} (id={archive_id})")
    return MessageResponse(message="档案已删除")


@router.put("/{archive_id}", response_model=ArchiveResponse)
async def update_archive(
    archive_id: int,
    req: SaveArchiveRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新档案"""
    result = await db.execute(
        select(BaziArchive).where(
            BaziArchive.id == archive_id,
            BaziArchive.user_id == user_id,
        )
    )
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="档案不存在")

    # 检查姓名是否与其他档案重复（排除自身）
    if archive.name != req.name:
        dup = await db.execute(
            select(BaziArchive).where(
                BaziArchive.user_id == user_id,
                BaziArchive.name == req.name,
                BaziArchive.id != archive_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"姓名「{req.name}」已存在，档案库中姓名不能重复")

    archive.name = req.name
    archive.gender = req.gender
    archive.birth_datetime = req.birth_datetime
    archive.birthplace = req.birthplace
    archive.calendar_type = req.calendar_type
    archive.group_name = req.group_name or "全部"
    archive.bazi_result = json.dumps(req.bazi_result, ensure_ascii=False) if req.bazi_result else None
    archive.supplemental_info = req.supplemental_info
    archive.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(archive)

    logger.info(f"用户 {user_id} 更新档案: {archive.name} (id={archive_id})")

    # 查询报告数量（排盘信息统计已下线，固定返回 0）
    report_count_result = await db.execute(
        select(func.count()).select_from(BaziReport).where(
            BaziReport.archive_id == archive_id,
            BaziReport.user_id == user_id,
        )
    )

    return ArchiveResponse.from_orm(
        archive,
        report_count=report_count_result.scalar() or 0,
    )


class BatchDeleteRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, description="要删除的档案ID列表")


@router.post("/batch-delete", response_model=MessageResponse)
async def batch_delete_archives(
    req: BatchDeleteRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """批量删除档案"""
    result = await db.execute(
        delete(BaziArchive).where(
            BaziArchive.id.in_(req.ids),
            BaziArchive.user_id == user_id,
        )
    )
    await db.commit()

    count = result.rowcount
    logger.info(f"用户 {user_id} 批量删除档案: {count} 条")
    return MessageResponse(message=f"已删除 {count} 条档案")


# ── 档案下的报告列表 ──

class ArchiveReportSummary(BaseModel):
    """档案下的报告摘要（不含完整 report_content，减少传输量）"""
    id: int
    title: str
    chart_type: str
    chart_name: Optional[str] = None
    skill_name: Optional[str] = None
    report_format: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: BaziReport) -> "ArchiveReportSummary":
        return cls(
            id=obj.id,
            title=obj.title,
            chart_type=obj.chart_type,
            chart_name=obj.chart_name,
            skill_name=obj.skill_name,
            report_format=obj.report_format,
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


@router.get("/{archive_id}/reports", response_model=list[ArchiveReportSummary])
async def list_archive_reports(
    archive_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """列出某档案下的所有报告（按创建时间倒序）"""
    # 先验证档案归属当前用户
    archive_result = await db.execute(
        select(BaziArchive).where(
            BaziArchive.id == archive_id,
            BaziArchive.user_id == user_id,
        )
    )
    if not archive_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="档案不存在或无权访问")

    result = await db.execute(
        select(BaziReport).where(
            BaziReport.archive_id == archive_id,
            BaziReport.user_id == user_id,
        ).order_by(BaziReport.created_at.desc())
    )
    reports = result.scalars().all()
    return [ArchiveReportSummary.from_orm(r) for r in reports]
