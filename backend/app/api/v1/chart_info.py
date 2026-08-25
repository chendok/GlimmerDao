"""排盘信息快照 API — 保存、查看、编辑、删除"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, delete, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_current_user_id
from ...database import get_db
from ...models.user import ChartInfoRecord, BaziArchive

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ── 请求/响应模型 ──

class SaveChartInfoRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=128, description="记录标题")
    chart_type: str = Field(..., pattern="^(八字|紫微|麻衣神相|六爻|梅花易数|黄历择吉)$", description="排盘类型：八字/紫微/麻衣神相/六爻/梅花易数/黄历择吉")
    chart_name: Optional[str] = Field(None, max_length=64, description="排盘对象姓名")
    archive_id: Optional[int] = Field(None, description="关联的排盘档案ID（可选，未提供时根据 chart_name 自动匹配）")
    selected_dayun: Optional[str] = Field(None, max_length=32, description="选中的大运")
    selected_liunian: Optional[str] = Field(None, max_length=16, description="选中的流年")
    selected_liuyue: Optional[str] = Field(None, max_length=16, description="选中的流月")
    selected_liuri: Optional[str] = Field(None, max_length=16, description="选中的流日")
    selected_liushi: Optional[str] = Field(None, max_length=16, description="选中的流时")
    has_focus: bool = Field(default=False, description="是否含时间维度焦点")
    info_content: str = Field(..., min_length=1, description="排盘信息Markdown正文")

    @field_validator("title", "info_content")
    @classmethod
    def _not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("不能为空")
        return v

    @field_validator("chart_name", "selected_dayun", "selected_liunian",
                     "selected_liuyue", "selected_liuri", "selected_liushi")
    @classmethod
    def _strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v if v else None


class ChartInfoResponse(BaseModel):
    id: int
    user_id: int
    archive_id: Optional[int]
    title: str
    chart_type: str
    chart_name: Optional[str]
    selected_dayun: Optional[str]
    selected_liunian: Optional[str]
    selected_liuyue: Optional[str]
    selected_liuri: Optional[str]
    selected_liushi: Optional[str]
    has_focus: bool
    info_content: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: ChartInfoRecord) -> "ChartInfoResponse":
        return cls(
            id=obj.id,
            user_id=obj.user_id,
            archive_id=obj.archive_id,
            title=obj.title,
            chart_type=obj.chart_type,
            chart_name=obj.chart_name,
            selected_dayun=obj.selected_dayun,
            selected_liunian=obj.selected_liunian,
            selected_liuyue=obj.selected_liuyue,
            selected_liuri=obj.selected_liuri,
            selected_liushi=obj.selected_liushi,
            has_focus=obj.has_focus,
            info_content=obj.info_content or "",
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


class ChartInfoSummary(BaseModel):
    """列表摘要（不含 info_content，减少传输量）"""
    id: int
    archive_id: Optional[int]
    title: str
    chart_type: str
    chart_name: Optional[str]
    selected_dayun: Optional[str]
    selected_liunian: Optional[str]
    selected_liuyue: Optional[str]
    selected_liuri: Optional[str]
    selected_liushi: Optional[str]
    has_focus: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: ChartInfoRecord) -> "ChartInfoSummary":
        return cls(
            id=obj.id,
            archive_id=obj.archive_id,
            title=obj.title,
            chart_type=obj.chart_type,
            chart_name=obj.chart_name,
            selected_dayun=obj.selected_dayun,
            selected_liunian=obj.selected_liunian,
            selected_liuyue=obj.selected_liuyue,
            selected_liuri=obj.selected_liuri,
            selected_liushi=obj.selected_liushi,
            has_focus=obj.has_focus,
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


class ChartInfoListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ChartInfoSummary]


class UpdateChartInfoRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=128, description="记录标题")
    info_content: Optional[str] = Field(None, min_length=1, description="排盘信息Markdown正文")

    @field_validator("title", "info_content")
    @classmethod
    def _not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("不能为空")
        return v


class MessageResponse(BaseModel):
    success: bool = True
    message: str


class BatchDeleteRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, description="要删除的记录ID列表")


# ── API 路由 ──

@router.post("/", response_model=ChartInfoResponse)
async def save_chart_info(
    req: SaveChartInfoRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """排盘信息存储功能已下线 — 拒绝任何写入请求"""
    raise HTTPException(
        status_code=410,
        detail={
            "code": "CHART_INFO_DISABLED",
            "message": "排盘信息存储功能已下线，禁止写入。"
        }
    )


@router.get("/", response_model=ChartInfoListResponse)
async def list_chart_infos(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    keyword: Optional[str] = Query(None, description="搜索关键字（标题/姓名）"),
    chart_type: Optional[str] = Query(None, description="排盘类型筛选"),
    archive_id: Optional[int] = Query(None, description="档案ID筛选"),
    has_focus: Optional[bool] = Query(None, description="是否含时间维度焦点"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """查询排盘信息快照列表"""
    query = select(ChartInfoRecord).where(ChartInfoRecord.user_id == user_id)

    if keyword:
        kw = f"%{keyword}%"
        query = query.where(
            or_(
                ChartInfoRecord.title.ilike(kw),
                ChartInfoRecord.chart_name.ilike(kw),
            )
        )

    if chart_type:
        query = query.where(ChartInfoRecord.chart_type == chart_type)

    if archive_id is not None:
        query = query.where(ChartInfoRecord.archive_id == archive_id)

    if has_focus is not None:
        query = query.where(ChartInfoRecord.has_focus == has_focus)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(ChartInfoRecord.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = [ChartInfoSummary.from_orm(r) for r in result.scalars().all()]

    return ChartInfoListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/{record_id}", response_model=ChartInfoResponse)
async def get_chart_info(
    record_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取排盘信息快照详情（含完整 info_content）"""
    result = await db.execute(
        select(ChartInfoRecord).where(
            ChartInfoRecord.id == record_id,
            ChartInfoRecord.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="排盘信息不存在")
    return ChartInfoResponse.from_orm(record)


@router.put("/{record_id}", response_model=ChartInfoResponse)
async def update_chart_info(
    record_id: int,
    req: UpdateChartInfoRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """排盘信息存储功能已下线 — 拒绝任何更新请求"""
    raise HTTPException(
        status_code=410,
        detail={
            "code": "CHART_INFO_DISABLED",
            "message": "排盘信息存储功能已下线，禁止写入。"
        }
    )


@router.delete("/{record_id}", response_model=MessageResponse)
async def delete_chart_info(
    record_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除单条排盘信息快照"""
    result = await db.execute(
        select(ChartInfoRecord).where(
            ChartInfoRecord.id == record_id,
            ChartInfoRecord.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="排盘信息不存在")

    await db.execute(delete(ChartInfoRecord).where(ChartInfoRecord.id == record_id))
    await db.commit()

    logger.info("用户 %d 删除排盘信息: %s (id=%d)", user_id, record.title, record_id)
    return MessageResponse(message="排盘信息已删除")


@router.post("/batch-delete", response_model=MessageResponse)
async def batch_delete_chart_infos(
    req: BatchDeleteRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """批量删除排盘信息快照"""
    result = await db.execute(
        delete(ChartInfoRecord).where(
            ChartInfoRecord.id.in_(req.ids),
            ChartInfoRecord.user_id == user_id,
        )
    )
    await db.commit()

    count = result.rowcount
    logger.info("用户 %d 批量删除排盘信息: %d 条", user_id, count)
    return MessageResponse(message=f"已删除 {count} 条排盘信息")
