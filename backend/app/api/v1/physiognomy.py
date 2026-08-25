"""麻衣神相 API — 图像上传、档案列表、详情、更新、删除"""
import io
import os
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, delete, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image

from ..deps import get_current_user_id
from ...database import get_db
from ...models.user import PhysiognomyArchive, BaziArchive

logger = logging.getLogger("uvicorn")
router = APIRouter()

# 上传根目录：backend/app/api/v1/physiognomy.py → 上溯 4 级到 backend/
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
UPLOADS_DIR = os.path.join(_BACKEND_DIR, "uploads")
PHYSIOGNOMY_DIR = os.path.join(UPLOADS_DIR, "physiognomy")

# 缩略图尺寸
THUMBNAIL_SIZE = (200, 200)
# 允许的图像 content-type
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
# 单图最大 20MB
MAX_IMAGE_SIZE = 20 * 1024 * 1024


# ── 响应模型 ──

class UploadResponse(BaseModel):
    record_id: int
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    annotated_image_url: Optional[str] = None


class PhysiognomySummary(BaseModel):
    """列表摘要（不含 feature_data，减少传输量）"""
    id: int
    archive_id: Optional[int]
    name: Optional[str]
    gender: Optional[str]
    analysis_type: str
    capture_method: Optional[str]
    thumbnail_url: Optional[str]
    feature_summary: Optional[str]
    analysis_result: Optional[str]
    report_id: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: PhysiognomyArchive) -> "PhysiognomySummary":
        return cls(
            id=obj.id,
            archive_id=obj.archive_id,
            name=obj.name,
            gender=obj.gender,
            analysis_type=obj.analysis_type,
            capture_method=obj.capture_method,
            thumbnail_url=obj.thumbnail_path,
            feature_summary=obj.feature_summary,
            analysis_result=obj.analysis_result,
            report_id=obj.report_id,
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


class PhysiognomyListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[PhysiognomySummary]


class PhysiognomyDetail(BaseModel):
    id: int
    user_id: int
    archive_id: Optional[int]
    name: Optional[str]
    gender: Optional[str]
    analysis_type: str
    capture_method: Optional[str]
    image_url: Optional[str]
    thumbnail_url: Optional[str]
    annotated_image_url: Optional[str]
    feature_data: Optional[dict] = None
    feature_summary: Optional[str]
    analysis_result: Optional[str]
    report_id: Optional[str]
    face_confidence: Optional[float]
    hand_confidence: Optional[float]
    image_width: Optional[int]
    image_height: Optional[int]
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, obj: PhysiognomyArchive) -> "PhysiognomyDetail":
        feature_data = None
        if obj.feature_data:
            try:
                feature_data = json.loads(obj.feature_data)
            except (json.JSONDecodeError, TypeError):
                feature_data = None
        return cls(
            id=obj.id,
            user_id=obj.user_id,
            archive_id=obj.archive_id,
            name=obj.name,
            gender=obj.gender,
            analysis_type=obj.analysis_type,
            capture_method=obj.capture_method,
            image_url=obj.image_path,
            thumbnail_url=obj.thumbnail_path,
            annotated_image_url=obj.annotated_image_path,
            feature_data=feature_data,
            feature_summary=obj.feature_summary,
            analysis_result=obj.analysis_result,
            report_id=obj.report_id,
            face_confidence=obj.face_confidence,
            hand_confidence=obj.hand_confidence,
            image_width=obj.image_width,
            image_height=obj.image_height,
            created_at=obj.created_at.isoformat() + "Z" if obj.created_at else "",
            updated_at=obj.updated_at.isoformat() + "Z" if obj.updated_at else "",
        )


class UpdateAnalysisRequest(BaseModel):
    analysis_result: Optional[str] = Field(None, description="即时分析结果文本")
    report_id: Optional[str] = Field(None, description="关联的深度报告ID")


class MessageResponse(BaseModel):
    success: bool = True
    message: str


class BatchDeleteRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, description="要删除的记录ID列表")


# ── 辅助函数 ──

def _validate_image(content: bytes, content_type: Optional[str]) -> None:
    """校验图像格式与大小"""
    if content_type and content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的图片格式: {content_type}，仅支持 JPG、PNG、WEBP",
        )
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"图片大小超过限制 ({len(content) / 1024 / 1024:.1f}MB > 20MB)",
        )


def _make_thumbnail(content: bytes, dest_path: str) -> None:
    """生成 200x200 缩略图并保存为 JPEG"""
    try:
        img = Image.open(io.BytesIO(content))
        img = img.convert("RGB")
        img.thumbnail(THUMBNAIL_SIZE, Image.LANCZOS)
        img.save(dest_path, "JPEG", quality=85)
    except Exception as e:
        logger.warning("[physiognomy] 缩略图生成失败: %s", e)


def _save_image(content: bytes, dest_path: str, convert_jpeg: bool = True) -> None:
    """保存图像。convert_jpeg=True 时统一转 JPEG"""
    try:
        if convert_jpeg:
            img = Image.open(io.BytesIO(content))
            img = img.convert("RGB")
            img.save(dest_path, "JPEG", quality=90)
        else:
            with open(dest_path, "wb") as f:
                f.write(content)
    except Exception as e:
        logger.warning("[physiognomy] 图像保存失败: %s", e)


def _delete_record_files(record: PhysiognomyArchive) -> None:
    """删除记录关联的所有图像文件"""
    for path_field in ("image_path", "thumbnail_path", "annotated_image_path"):
        rel = getattr(record, path_field, None)
        if not rel:
            continue
        # rel 形如 /uploads/physiognomy/{user_id}/{id}/xxx.jpg
        if rel.startswith("/uploads/"):
            abs_path = os.path.join(UPLOADS_DIR, rel[len("/uploads/"):])
        else:
            abs_path = os.path.join(UPLOADS_DIR, rel.lstrip("/"))
        try:
            if os.path.isfile(abs_path):
                os.remove(abs_path)
        except Exception as e:
            logger.warning("[physiognomy] 删除文件失败 %s: %s", abs_path, e)


async def _resolve_archive(db: AsyncSession, user_id: int, archive_id: Optional[int],
                           name: Optional[str]) -> tuple[Optional[int], Optional[str], Optional[str]]:
    """验证或自动匹配八字档案。返回 (archive_id, name, gender)"""
    if archive_id is not None:
        result = await db.execute(
            select(BaziArchive).where(
                BaziArchive.id == archive_id,
                BaziArchive.user_id == user_id,
            )
        )
        archive = result.scalar_one_or_none()
        if not archive:
            raise HTTPException(
                status_code=404,
                detail={"code": "ARCHIVE_NOT_FOUND", "message": "关联档案不存在或无权访问"}
            )
        return archive.id, archive.name, archive.gender
    # 未关联档案：使用前端传入的 name/gender
    return None, name, None


# ── API 路由 ──

@router.post("/upload", response_model=UploadResponse)
async def upload_physiognomy(
    analysis_type: str = Form(..., description="分析类型：face/hand/combined"),
    capture_method: str = Form(..., description="采集方式：camera/upload"),
    feature_data: str = Form(..., description="JSON 格式的特征数据"),
    feature_summary: str = Form(..., description="特征摘要文本"),
    image: UploadFile = File(..., description="原始图像"),
    annotated_image: Optional[UploadFile] = File(None, description="标注图像（可选，无则复用原始图）"),
    archive_id: Optional[int] = Form(None, description="关联的八字档案ID"),
    name: Optional[str] = Form(None, description="姓名（未关联档案时必填）"),
    gender: Optional[str] = Form(None, description="性别（未关联档案时必填）"),
    face_confidence: Optional[float] = Form(None, description="面部检测置信度"),
    hand_confidence: Optional[float] = Form(None, description="手部检测置信度"),
    image_width: Optional[int] = Form(None, description="原始图像宽度"),
    image_height: Optional[int] = Form(None, description="原始图像高度"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """上传麻衣神相图像与特征数据，创建档案记录

    存储三份图像：原始图、缩略图（200x200）、标注图。
    路径规范：uploads/physiognomy/{user_id}/{record_id}/{original,thumbnail,annotated}.jpg
    """
    # 参数校验
    if analysis_type not in ("face", "hand", "combined"):
        raise HTTPException(status_code=400, detail="analysis_type 必须为 face/hand/combined")
    if capture_method not in ("camera", "upload"):
        raise HTTPException(status_code=400, detail="capture_method 必须为 camera/upload")

    # 解析 feature_data JSON
    try:
        json.loads(feature_data)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="feature_data 不是合法的 JSON")

    # 验证或匹配档案
    archive_id_resolved, name_resolved, gender_resolved = await _resolve_archive(
        db, user_id, archive_id, name
    )
    if archive_id_resolved is None and not name:
        raise HTTPException(
            status_code=400,
            detail="未关联档案时 name 不能为空"
        )

    # 读取并校验图像
    image_content = await image.read()
    _validate_image(image_content, image.content_type)

    # 标注图可选：未提供则复用原始图
    if annotated_image is not None:
        annotated_content = await annotated_image.read()
        _validate_image(annotated_content, annotated_image.content_type)
    else:
        annotated_content = image_content

    # 先创建记录以获取 id（路径依赖 record_id）
    record = PhysiognomyArchive(
        user_id=user_id,
        archive_id=archive_id_resolved,
        name=name_resolved or name,
        gender=gender_resolved or gender,
        analysis_type=analysis_type,
        capture_method=capture_method,
        feature_data=feature_data,
        feature_summary=feature_summary,
        face_confidence=face_confidence,
        hand_confidence=hand_confidence,
        image_width=image_width,
        image_height=image_height,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # 保存图像文件
    record_dir = os.path.join(PHYSIOGNOMY_DIR, str(user_id), str(record.id))
    os.makedirs(record_dir, exist_ok=True)

    original_path = os.path.join(record_dir, "original.jpg")
    thumbnail_path = os.path.join(record_dir, "thumbnail.jpg")
    annotated_path = os.path.join(record_dir, "annotated.jpg")

    _save_image(image_content, original_path, convert_jpeg=True)
    _make_thumbnail(image_content, thumbnail_path)
    _save_image(annotated_content, annotated_path, convert_jpeg=True)

    # 回写相对路径（/uploads/... 供前端直接访问）
    record.image_path = f"/uploads/physiognomy/{user_id}/{record.id}/original.jpg"
    record.thumbnail_path = f"/uploads/physiognomy/{user_id}/{record.id}/thumbnail.jpg"
    record.annotated_image_path = f"/uploads/physiognomy/{user_id}/{record.id}/annotated.jpg"
    await db.commit()
    await db.refresh(record)

    logger.info("用户 %d 上传麻衣神相记录: id=%d type=%s", user_id, record.id, analysis_type)
    return UploadResponse(
        record_id=record.id,
        image_url=record.image_path,
        thumbnail_url=record.thumbnail_path,
        annotated_image_url=record.annotated_image_path,
    )


@router.get("/archives", response_model=PhysiognomyListResponse)
async def list_physiognomy_archives(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    analysis_type: Optional[str] = Query(None, description="分析类型筛选：face/hand/combined"),
    archive_id: Optional[int] = Query(None, description="八字档案ID筛选"),
    keyword: Optional[str] = Query(None, description="搜索关键字（姓名）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """查询麻衣神相档案列表"""
    query = select(PhysiognomyArchive).where(PhysiognomyArchive.user_id == user_id)

    if analysis_type:
        query = query.where(PhysiognomyArchive.analysis_type == analysis_type)

    if archive_id is not None:
        query = query.where(PhysiognomyArchive.archive_id == archive_id)

    if keyword:
        kw = f"%{keyword}%"
        query = query.where(PhysiognomyArchive.name.ilike(kw))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(PhysiognomyArchive.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = [PhysiognomySummary.from_orm(r) for r in result.scalars().all()]

    return PhysiognomyListResponse(total=total, page=page, page_size=page_size, items=items)


@router.get("/archives/{record_id}", response_model=PhysiognomyDetail)
async def get_physiognomy_archive(
    record_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取麻衣神相档案详情（含完整 feature_data）"""
    result = await db.execute(
        select(PhysiognomyArchive).where(
            PhysiognomyArchive.id == record_id,
            PhysiognomyArchive.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="麻衣神相记录不存在")
    return PhysiognomyDetail.from_orm(record)


@router.put("/archives/{record_id}", response_model=PhysiognomyDetail)
async def update_physiognomy_archive(
    record_id: int,
    req: UpdateAnalysisRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新麻衣神相档案（分析结果/报告ID）"""
    result = await db.execute(
        select(PhysiognomyArchive).where(
            PhysiognomyArchive.id == record_id,
            PhysiognomyArchive.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="麻衣神相记录不存在")

    if req.analysis_result is not None:
        record.analysis_result = req.analysis_result
    if req.report_id is not None:
        record.report_id = req.report_id
    record.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(record)

    logger.info("用户 %d 更新麻衣神相记录: id=%d", user_id, record_id)
    return PhysiognomyDetail.from_orm(record)


@router.delete("/archives/{record_id}", response_model=MessageResponse)
async def delete_physiognomy_archive(
    record_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除单条麻衣神相记录（同时删除关联图像文件）"""
    result = await db.execute(
        select(PhysiognomyArchive).where(
            PhysiognomyArchive.id == record_id,
            PhysiognomyArchive.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="麻衣神相记录不存在")

    _delete_record_files(record)
    await db.execute(delete(PhysiognomyArchive).where(PhysiognomyArchive.id == record_id))
    await db.commit()

    logger.info("用户 %d 删除麻衣神相记录: id=%d", user_id, record_id)
    return MessageResponse(message="麻衣神相记录已删除")


@router.post("/archives/batch-delete", response_model=MessageResponse)
async def batch_delete_physiognomy_archives(
    req: BatchDeleteRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """批量删除麻衣神相记录（同时删除关联图像文件）"""
    result = await db.execute(
        select(PhysiognomyArchive).where(
            PhysiognomyArchive.id.in_(req.ids),
            PhysiognomyArchive.user_id == user_id,
        )
    )
    records = result.scalars().all()
    for record in records:
        _delete_record_files(record)

    await db.execute(
        delete(PhysiognomyArchive).where(
            PhysiognomyArchive.id.in_(req.ids),
            PhysiognomyArchive.user_id == user_id,
        )
    )
    await db.commit()

    count = len(records)
    logger.info("用户 %d 批量删除麻衣神相记录: %d 条", user_id, count)
    return MessageResponse(message=f"已删除 {count} 条麻衣神相记录")
