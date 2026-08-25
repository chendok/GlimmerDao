"""知识库 API 路由"""
import asyncio
import json
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...database import get_db
from ..deps import get_optional_user_id, get_current_user_id, get_current_admin_user
from ...models.user import User
from ...models.knowledge import (
    KnowledgeCategory, KnowledgeDocument, KnowledgeDocumentPage,
    LearningProgress, MindMap,
)
from ...schemas.knowledge import (
    KnowledgeCategoryCreate, KnowledgeCategoryUpdate, KnowledgeCategoryResponse,
    KnowledgeDocumentCreate, KnowledgeDocumentUpdate, KnowledgeDocumentResponse,
    KnowledgeDocumentContentResponse, KnowledgeDocumentListResponse,
    LearningProgressCreate, LearningProgressResponse,
    MindMapResponse,
    KnowledgeSearchRequest, KnowledgeSearchResponse,
    KnowledgeChatRequest,
    MessageResponse,
)
from pydantic import BaseModel, Field
from ...services.document_parser import parse_document, _get_file_type_from_extension
from ...services.knowledge_search import search_documents, init_fts, index_document, remove_document_from_index

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ── 辅助函数 ──

def _category_to_tree(cat: KnowledgeCategory, doc_counts: dict) -> dict:
    """将分类转为树形结构响应"""
    return {
        "id": cat.id,
        "name": cat.name,
        "code": cat.code,
        "parent_id": cat.parent_id,
        "is_system": cat.is_system,
        "user_id": cat.user_id,
        "description": cat.description,
        "sort_order": cat.sort_order,
        "icon": cat.icon,
        "document_count": doc_counts.get(cat.id, 0),
        "children": [],
        "created_at": cat.created_at.isoformat() + "Z" if cat.created_at else None,
    }


def _sort_category_children(tree: list) -> list:
    """递归对分类树按 code 字段排序（code 相同时按 name 排序）"""
    for node in tree:
        if node["children"]:
            node["children"] = _sort_category_children(node["children"])
            node["children"].sort(key=lambda x: (x.get("code") or "", x.get("name") or ""))
    return tree


def _build_category_tree(categories: List[KnowledgeCategory], doc_counts: dict) -> list:
    """构建分类树"""
    node_map = {}
    roots = []

    for cat in categories:
        node_map[cat.id] = _category_to_tree(cat, doc_counts)

    for cat in categories:
        if cat.parent_id and cat.parent_id in node_map:
            node_map[cat.parent_id]["children"].append(node_map[cat.id])
        else:
            roots.append(node_map[cat.id])

    # 对整棵树按 code 排序
    roots = _sort_category_children(roots)
    roots.sort(key=lambda x: (x.get("code") or "", x.get("name") or ""))
    return roots


def _doc_to_response(doc: KnowledgeDocument, category_name: Optional[str] = None, page_count: Optional[int] = None) -> dict:
    """将文档转为响应格式（不访问关系属性，避免 async lazy-load 错误）"""
    return {
        "id": doc.id,
        "title": doc.title,
        "category_id": doc.category_id,
        "category_name": category_name,
        "user_id": doc.user_id,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "cover_image": doc.cover_image,
        "description": doc.description,
        "author": doc.author,
        "source": doc.source,
        "is_public": doc.is_public,
        "depth_level": doc.depth_level,
        "view_count": doc.view_count,
        "page_count": page_count or 0,
        "created_at": doc.created_at.isoformat() + "Z" if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() + "Z" if doc.updated_at else None,
    }


async def _enrich_docs(db: AsyncSession, documents: list) -> list:
    """批量获取文档的 category_name 和 page_count，避免 N+1 查询"""
    if not documents:
        return []

    doc_ids = [d.id for d in documents]
    cat_ids = list({d.category_id for d in documents if d.category_id})

    # 批量获取分类名
    cat_map = {}
    if cat_ids:
        cat_result = await db.execute(
            select(KnowledgeCategory.id, KnowledgeCategory.name)
            .where(KnowledgeCategory.id.in_(cat_ids))
        )
        cat_map = {row[0]: row[1] for row in cat_result.fetchall()}

    # 批量获取页数
    page_result = await db.execute(
        select(KnowledgeDocumentPage.document_id, func.count(KnowledgeDocumentPage.id))
        .where(KnowledgeDocumentPage.document_id.in_(doc_ids))
        .group_by(KnowledgeDocumentPage.document_id)
    )
    page_map = {row[0]: row[1] for row in page_result.fetchall()}

    return [
        _doc_to_response(d, cat_map.get(d.category_id), page_map.get(d.id, 0))
        for d in documents
    ]


# ── 初始化 FTS ──

async def _ensure_fts(db: AsyncSession):
    """确保 FTS5 索引已初始化"""
    try:
        await init_fts(db)
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════
# 公共分类 API（无需认证）
# ═══════════════════════════════════════════════════════════

@router.get("/categories")
async def get_categories(
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    """获取分类树（通用分类）"""
    # 查询系统分类
    result = await db.execute(
        select(KnowledgeCategory)
        .where(KnowledgeCategory.is_system == True)
        .order_by(KnowledgeCategory.sort_order, KnowledgeCategory.id)
    )
    categories = result.scalars().all()

    # 统计每个分类下的文档数量
    doc_count_result = await db.execute(
        select(
            KnowledgeDocument.category_id,
            func.count(KnowledgeDocument.id),
        )
        .where(
            KnowledgeDocument.is_public == True,
            KnowledgeDocument.category_id.in_([c.id for c in categories]),
        )
        .group_by(KnowledgeDocument.category_id)
    )
    doc_counts = {row[0]: row[1] for row in doc_count_result.fetchall()}

    return {
        "categories": _build_category_tree(categories, doc_counts),
    }


@router.get("/categories/{category_id}")
async def get_category_detail(
    category_id: int,
    db: AsyncSession = Depends(get_db),
):
    """获取分类详情"""
    result = await db.execute(
        select(KnowledgeCategory).where(KnowledgeCategory.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")

    # 统计文档数
    count_result = await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.category_id == category_id,
            KnowledgeDocument.is_public == True,
        )
    )
    doc_count = count_result.scalar() or 0

    return {
        **_category_to_tree(cat, {cat.id: doc_count}),
        "children": [],  # 详情不展开子节点
    }


# ═══════════════════════════════════════════════════════════
# 公共文档 API（无需认证）
# ═══════════════════════════════════════════════════════════

@router.get("/documents")
async def get_documents(
    category_id: Optional[int] = Query(None, description="分类ID过滤"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    file_type: Optional[str] = Query(None, description="文件类型过滤"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
):
    """获取文档列表"""
    await _ensure_fts(db)

    # 如果有搜索关键词，使用全文搜索
    if search:
        documents, total = await search_documents(
            db, search, category_id=category_id, page=page, page_size=page_size
        )
        items = await _enrich_docs(db, documents)
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items,
        }

    # 常规查询
    query = select(KnowledgeDocument).where(KnowledgeDocument.is_public == True)
    count_query = select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.is_public == True)

    if category_id:
        query = query.where(KnowledgeDocument.category_id == category_id)
        count_query = count_query.where(KnowledgeDocument.category_id == category_id)
    if file_type:
        query = query.where(KnowledgeDocument.file_type == file_type)
        count_query = count_query.where(KnowledgeDocument.file_type == file_type)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(desc(KnowledgeDocument.updated_at)).offset(offset).limit(page_size)
    result = await db.execute(query)
    documents = result.scalars().all()

    items = await _enrich_docs(db, documents)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


@router.get("/documents/{document_id}")
async def get_document_detail(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """获取文档详情"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 注意：不在 GET 请求中执行 UPDATE（避免 FTS5 触发器导致的数据库错误）
    # 浏览次数通过单独的 POST 端点更新

    # 获取 category_name 和 page_count
    cat_name = None
    if doc.category_id:
        cat_result = await db.execute(
            select(KnowledgeCategory.name).where(KnowledgeCategory.id == doc.category_id)
        )
        cat_row = cat_result.first()
        if cat_row:
            cat_name = cat_row[0]

    page_count_result = await db.execute(
        select(func.count(KnowledgeDocumentPage.id)).where(KnowledgeDocumentPage.document_id == document_id)
    )
    page_count = page_count_result.scalar() or 0

    return _doc_to_response(doc, cat_name, page_count)


@router.get("/documents/{document_id}/content")
async def get_document_content(
    document_id: int,
    page: int = Query(1, ge=1, description="页码"),
    depth: int = Query(2, ge=1, le=3, description="内容深度"),
    db: AsyncSession = Depends(get_db),
):
    """获取文档内容"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 根据深度返回内容
    content_text = doc.content_text
    content_md = doc.content_markdown

    if depth == 1 and content_text:
        # 摘要级别：取前 500 字符
        content_text = content_text[:500] + ("..." if len(content_text) > 500 else "")
        content_md = content_md[:500] + ("..." if len(content_md) > 500 else "") if content_md else None
    elif depth == 2:
        # 详细级别：返回完整内容
        pass

    # 获取分页
    pages_result = await db.execute(
        select(KnowledgeDocumentPage)
        .where(KnowledgeDocumentPage.document_id == document_id)
        .order_by(KnowledgeDocumentPage.page_number)
    )
    db_pages = pages_result.scalars().all()
    pages = [
        {
            "page_number": p.page_number,
            "content_text": p.content_text,
            "image_url": f"/api/v1/knowledge/documents/{document_id}/slides/{p.page_number}/image" if p.image_path else None,
        }
        for p in db_pages
    ]

    return {
        "id": doc.id,
        "title": doc.title,
        "content_text": content_text,
        "content_markdown": content_md,
        "pages": pages,
        "depth_level": depth,
        "page_count": len(pages),
        "file_type": doc.file_type,
        "file_url": f"/api/v1/knowledge/documents/{document_id}/file",
        "is_public": doc.is_public,
    }


# 文件扩展名 → MIME 类型映射（覆盖 Office 等非标准类型）
_FILE_MEDIA_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "html": "text/html",
    "htm": "text/html",
    "md": "text/markdown",
    "txt": "text/plain",
    "epub": "application/epub+zip",
    "mobi": "application/x-mobipocket-ebook",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "webp": "image/webp",
}


@router.get("/documents/{document_id}/file")
async def get_document_file(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    """获取文档原始文件（用于 PDF/图片/HTML 等的前端原生渲染）"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 访问控制：公开文档任意访问；私有文档仅所有者可访问
    if not doc.is_public:
        if user_id is None or doc.user_id != user_id:
            raise HTTPException(status_code=403, detail="无权访问该文档")

    if not doc.file_path:
        raise HTTPException(status_code=404, detail="该文档无原始文件")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="原始文件不存在")

    ext = file_path.suffix.lower().lstrip(".")
    media_type = _FILE_MEDIA_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name.split("_", 1)[-1] if "_" in file_path.name else file_path.name,
    )


@router.get("/documents/{document_id}/slides/{page_number}/image")
async def get_slide_image(
    document_id: int,
    page_number: int,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    """获取 PPT 幻灯片渲染图片"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 访问控制
    if not doc.is_public:
        if user_id is None or doc.user_id != user_id:
            raise HTTPException(status_code=403, detail="无权访问该文档")

    # 获取该页的图片路径
    page_result = await db.execute(
        select(KnowledgeDocumentPage).where(
            KnowledgeDocumentPage.document_id == document_id,
            KnowledgeDocumentPage.page_number == page_number,
        )
    )
    page = page_result.scalar_one_or_none()
    if not page or not page.image_path:
        raise HTTPException(status_code=404, detail="幻灯片图片不存在")

    image_path = Path(page.image_path)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="幻灯片图片文件不存在")

    return FileResponse(
        path=str(image_path),
        media_type="image/png",
    )


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    category_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """全文搜索"""
    await _ensure_fts(db)
    documents, total = await search_documents(
        db, q, category_id=category_id, page=page, page_size=page_size
    )
    items = await _enrich_docs(db, documents)
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ═══════════════════════════════════════════════════════════
# 管理员 API（需认证 + 管理员权限）
# ═══════════════════════════════════════════════════════════

@router.post("/admin/categories")
async def create_system_category(
    req: KnowledgeCategoryCreate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """创建系统分类"""
    category = KnowledgeCategory(
        name=req.name,
        code=req.code,
        parent_id=req.parent_id,
        is_system=True,
        description=req.description,
        sort_order=req.sort_order,
        icon=req.icon,
    )
    db.add(category)
    await db.flush()

    logger.info(f"管理员 {admin_user.email} 创建了系统分类: {req.name}")

    return {
        "message": "分类创建成功",
        "success": True,
        "id": category.id,
    }


@router.put("/admin/categories/{category_id}")
async def update_system_category(
    category_id: int,
    req: KnowledgeCategoryUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """更新系统分类"""
    result = await db.execute(
        select(KnowledgeCategory).where(
            KnowledgeCategory.id == category_id,
            KnowledgeCategory.is_system == True,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")

    if req.name is not None:
        cat.name = req.name
    if req.code is not None:
        cat.code = req.code
    if req.parent_id is not None:
        cat.parent_id = req.parent_id
    if req.description is not None:
        cat.description = req.description
    if req.sort_order is not None:
        cat.sort_order = req.sort_order
    if req.icon is not None:
        cat.icon = req.icon

    await db.flush()

    return {"message": "分类更新成功", "success": True}


@router.delete("/admin/categories/{category_id}")
async def delete_system_category(
    category_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """删除系统分类"""
    result = await db.execute(
        select(KnowledgeCategory).where(
            KnowledgeCategory.id == category_id,
            KnowledgeCategory.is_system == True,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")

    # 检查是否有子分类
    child_result = await db.execute(
        select(func.count(KnowledgeCategory.id)).where(
            KnowledgeCategory.parent_id == category_id
        )
    )
    child_count = child_result.scalar() or 0
    if child_count > 0:
        raise HTTPException(status_code=400, detail="请先删除子分类")

    # 检查该分类下是否存在文档
    doc_count_result = await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.category_id == category_id,
        )
    )
    doc_count = doc_count_result.scalar() or 0
    if doc_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"该分类下存在 {doc_count} 篇文档，请先移除或转移文档后再删除分类",
        )

    await db.delete(cat)
    await db.flush()

    return {"message": "分类删除成功", "success": True}


@router.post("/admin/documents")
async def upload_admin_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    source: Optional[str] = Form(None),
    depth_level: int = Form(2),
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """上传文档到通用知识库"""
    return await _handle_document_upload(
        db, file, title, category_id, description, author, source, depth_level,
        admin_user.id, is_public=True, request=request,
    )


@router.put("/admin/documents/{document_id}")
async def update_admin_document(
    document_id: int,
    req: KnowledgeDocumentUpdate,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """更新文档元数据"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if req.title is not None:
        doc.title = req.title
    if req.category_id is not None:
        doc.category_id = req.category_id
    if req.description is not None:
        doc.description = req.description
    if req.author is not None:
        doc.author = req.author
    if req.source is not None:
        doc.source = req.source
    if req.depth_level is not None:
        doc.depth_level = req.depth_level
    if req.is_public is not None:
        doc.is_public = req.is_public

    await db.flush()

    return {"message": "文档更新成功", "success": True}


@router.delete("/admin/documents/{document_id}")
async def delete_admin_document(
    document_id: int,
    admin_user: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """删除文档"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 删除文件
    if doc.file_path:
        _delete_uploaded_file(doc.file_path)

    # 从 FTS5 索引中删除
    await remove_document_from_index(db, document_id)

    await db.delete(doc)
    await db.flush()

    return {"message": "文档删除成功", "success": True}


# ═══════════════════════════════════════════════════════════
# 个人知识库 API（需认证）
# ═══════════════════════════════════════════════════════════

@router.get("/personal/categories")
async def get_personal_categories(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取个人分类列表"""
    result = await db.execute(
        select(KnowledgeCategory)
        .where(
            KnowledgeCategory.is_system == False,
            KnowledgeCategory.user_id == user_id,
        )
        .order_by(KnowledgeCategory.sort_order, KnowledgeCategory.id)
    )
    categories = result.scalars().all()

    # 统计文档数
    cat_ids = [c.id for c in categories]
    doc_counts = {}
    if cat_ids:
        count_result = await db.execute(
            select(
                KnowledgeDocument.category_id,
                func.count(KnowledgeDocument.id),
            )
            .where(KnowledgeDocument.category_id.in_(cat_ids))
            .group_by(KnowledgeDocument.category_id)
        )
        doc_counts = {row[0]: row[1] for row in count_result.fetchall()}

    return {
        "categories": _build_category_tree(categories, doc_counts),
    }


@router.post("/personal/categories")
async def create_personal_category(
    req: KnowledgeCategoryCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """创建个人分类"""
    category = KnowledgeCategory(
        name=req.name,
        code=req.code,
        parent_id=req.parent_id,
        is_system=False,
        user_id=user_id,
        description=req.description,
        sort_order=req.sort_order,
        icon=req.icon,
    )
    db.add(category)
    await db.flush()

    return {"message": "分类创建成功", "success": True, "id": category.id}


@router.put("/personal/categories/{category_id}")
async def update_personal_category(
    category_id: int,
    req: KnowledgeCategoryUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新个人分类"""
    result = await db.execute(
        select(KnowledgeCategory).where(
            KnowledgeCategory.id == category_id,
            KnowledgeCategory.is_system == False,
            KnowledgeCategory.user_id == user_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在或无权操作")

    if req.name is not None:
        cat.name = req.name
    if req.code is not None:
        cat.code = req.code
    if req.parent_id is not None:
        cat.parent_id = req.parent_id
    if req.description is not None:
        cat.description = req.description
    if req.sort_order is not None:
        cat.sort_order = req.sort_order
    if req.icon is not None:
        cat.icon = req.icon

    await db.flush()
    return {"message": "分类更新成功", "success": True}


async def _collect_descendant_category_ids(
    db: AsyncSession, category_id: int, user_id: int
) -> List[int]:
    """递归收集某个人分类及其所有后代分类的 ID（仅限当前用户的个人分类）"""
    result = await db.execute(
        select(KnowledgeCategory.id, KnowledgeCategory.parent_id).where(
            KnowledgeCategory.is_system == False,
            KnowledgeCategory.user_id == user_id,
        )
    )

    # 构建父子映射
    parent_map: dict = {}
    for row in result.fetchall():
        pid = row[1]
        parent_map.setdefault(pid, []).append(row[0])

    collected = [category_id]
    stack = [category_id]
    while stack:
        current = stack.pop()
        for child_id in parent_map.get(current, []):
            if child_id not in collected:
                collected.append(child_id)
                stack.append(child_id)
    return collected


@router.delete("/personal/categories/{category_id}")
async def delete_personal_category(
    category_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除个人分类（若分类或其子分类下存在文档，则拒绝删除）"""
    result = await db.execute(
        select(KnowledgeCategory).where(
            KnowledgeCategory.id == category_id,
            KnowledgeCategory.is_system == False,
            KnowledgeCategory.user_id == user_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在或无权操作")

    # 收集该分类及其所有子分类 ID
    target_ids = await _collect_descendant_category_ids(db, category_id, user_id)

    # 检查这些分类下是否存在文档
    doc_count_result = await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.category_id.in_(target_ids),
            KnowledgeDocument.user_id == user_id,
        )
    )
    doc_count = doc_count_result.scalar() or 0

    if doc_count > 0:
        child_note = (
            f"（含子分类）" if len(target_ids) > 1 else ""
        )
        raise HTTPException(
            status_code=400,
            detail=f"该分类{child_note}下存在 {doc_count} 篇文档，请先移除或转移文档后再删除分类",
        )

    # 若有子分类，一并递归删除
    for tid in target_ids:
        if tid == category_id:
            continue
        sub_result = await db.execute(
            select(KnowledgeCategory).where(KnowledgeCategory.id == tid)
        )
        sub_cat = sub_result.scalar_one_or_none()
        if sub_cat:
            await db.delete(sub_cat)

    await db.delete(cat)
    await db.flush()
    return {"message": "分类删除成功", "success": True}


@router.get("/personal/documents")
async def get_personal_documents(
    category_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取个人文档列表"""
    query = select(KnowledgeDocument).where(KnowledgeDocument.user_id == user_id)
    count_query = select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.user_id == user_id)

    if category_id:
        query = query.where(KnowledgeDocument.category_id == category_id)
        count_query = count_query.where(KnowledgeDocument.category_id == category_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(desc(KnowledgeDocument.updated_at)).offset(offset).limit(page_size)
    result = await db.execute(query)
    documents = result.scalars().all()

    items = await _enrich_docs(db, documents)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/personal/documents")
async def upload_personal_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    source: Optional[str] = Form(None),
    depth_level: int = Form(2),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """上传个人文档"""
    return await _handle_document_upload(
        db, file, title, category_id, description, author, source, depth_level,
        user_id, is_public=False, request=request,
    )


@router.put("/personal/documents/{document_id}")
async def update_personal_document(
    document_id: int,
    req: KnowledgeDocumentUpdate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """更新个人文档"""
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.user_id == user_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在或无权操作")

    if req.title is not None:
        doc.title = req.title
    if req.category_id is not None:
        doc.category_id = req.category_id
    if req.description is not None:
        doc.description = req.description
    if req.author is not None:
        doc.author = req.author
    if req.source is not None:
        doc.source = req.source
    if req.depth_level is not None:
        doc.depth_level = req.depth_level

    await db.flush()
    return {"message": "文档更新成功", "success": True}


@router.delete("/personal/documents/{document_id}")
async def delete_personal_document(
    document_id: int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """删除个人文档"""
    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.user_id == user_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在或无权操作")

    # 收集幻灯片图片路径（在级联删除前）
    slide_image_paths = []
    if doc.file_type == "pptx":
        pages_result = await db.execute(
            select(KnowledgeDocumentPage).where(
                KnowledgeDocumentPage.document_id == document_id,
                KnowledgeDocumentPage.image_path.isnot(None),
            )
        )
        slide_image_paths = [p.image_path for p in pages_result.scalars().all()]

    # 删除上传文件
    if doc.file_path:
        _delete_uploaded_file(doc.file_path)

    # 删除幻灯片图片
    for img_path in slide_image_paths:
        _delete_uploaded_file(img_path)

    # 删除幻灯片目录（如果为空）
    if slide_image_paths:
        _cleanup_empty_slides_dir(slide_image_paths[0])

    # 从 FTS5 索引中删除
    await remove_document_from_index(db, document_id)

    await db.delete(doc)
    await db.flush()
    return {"message": "文档删除成功", "success": True}


# ═══════════════════════════════════════════════════════════
# 学习工具 API
# ═══════════════════════════════════════════════════════════

@router.get("/learning/progress")
async def get_learning_progress(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取学习进度列表"""
    result = await db.execute(
        select(LearningProgress)
        .where(LearningProgress.user_id == user_id)
        .order_by(desc(LearningProgress.last_read_at))
    )
    progresses = result.scalars().all()

    # 批量获取文档标题
    doc_ids = [p.document_id for p in progresses]
    doc_map = {}
    if doc_ids:
        doc_result = await db.execute(
            select(KnowledgeDocument.id, KnowledgeDocument.title)
            .where(KnowledgeDocument.id.in_(doc_ids))
        )
        doc_map = {row[0]: row[1] for row in doc_result.fetchall()}

    items = []
    for p in progresses:
        items.append({
            "id": p.id,
            "document_id": p.document_id,
            "document_title": doc_map.get(p.document_id),
            "current_page": p.current_page,
            "progress_percentage": p.progress_percentage,
            "depth_level": p.depth_level,
            "notes": p.notes,
            "last_read_at": p.last_read_at.isoformat() if p.last_read_at else None,
        })

    return {"items": items}


@router.post("/learning/progress")
async def save_learning_progress(
    req: LearningProgressCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """保存/更新学习进度"""
    # 查找现有记录
    result = await db.execute(
        select(LearningProgress).where(
            LearningProgress.user_id == user_id,
            LearningProgress.document_id == req.document_id,
        )
    )
    progress = result.scalar_one_or_none()

    if progress:
        progress.current_page = req.current_page
        progress.progress_percentage = req.progress_percentage
        progress.depth_level = req.depth_level
        progress.notes = req.notes
        progress.last_read_at = datetime.utcnow()
    else:
        progress = LearningProgress(
            user_id=user_id,
            document_id=req.document_id,
            current_page=req.current_page,
            progress_percentage=req.progress_percentage,
            depth_level=req.depth_level,
            notes=req.notes,
        )
        db.add(progress)

    await db.flush()
    return {"message": "进度保存成功", "success": True, "id": progress.id}


@router.get("/documents/{document_id}/mindmap")
async def get_mindmap(
    document_id: int,
    user_id: Optional[int] = Depends(get_optional_user_id),
    db: AsyncSession = Depends(get_db),
):
    """获取思维导图"""
    result = await db.execute(
        select(MindMap).where(MindMap.document_id == document_id).order_by(desc(MindMap.created_at)).limit(1)
    )
    mindmap = result.scalar_one_or_none()

    if not mindmap:
        return {"mindmap": None, "message": "暂无思维导图，请先生成"}

    return {
        "mindmap": {
            "id": mindmap.id,
            "document_id": mindmap.document_id,
            "title": mindmap.title,
            "content_json": mindmap.content_json,
            "depth_level": mindmap.depth_level,
            "created_at": mindmap.created_at.isoformat() + "Z" if mindmap.created_at else None,
        }
    }


@router.post("/documents/{document_id}/mindmap")
async def generate_mindmap(
    document_id: int,
    depth: int = Query(2, ge=1, le=3, description="展开深度"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """生成思维导图"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    content = doc.content_markdown or doc.content_text or ""
    if not content:
        raise HTTPException(status_code=400, detail="文档内容为空")

    # 基于标题层级提取思维导图结构
    mindmap_json = _extract_mindmap_from_markdown(content, doc.title)

    mindmap = MindMap(
        document_id=document_id,
        user_id=user_id,
        title=doc.title,
        content_json=json.dumps(mindmap_json, ensure_ascii=False),
        depth_level=depth,
    )
    db.add(mindmap)
    await db.flush()

    return {
        "mindmap": {
            "id": mindmap.id,
            "document_id": mindmap.document_id,
            "title": mindmap.title,
            "content_json": mindmap.content_json,
            "depth_level": mindmap.depth_level,
            "created_at": mindmap.created_at.isoformat() + "Z" if mindmap.created_at else None,
        }
    }


# ═══════════════════════════════════════════════════════════
# AI 生成思维导图 API
# ═══════════════════════════════════════════════════════════


class MindMapAIExpandRequest(BaseModel):
    """AI 扩展思维导图节点请求"""
    node_content: str = Field(..., description="要扩展的节点内容")
    document_id: Optional[int] = Field(None, description="关联文档ID，用于提供上下文")
    context: Optional[str] = Field(None, description="额外上下文（如父节点路径）")


async def _ai_generate_mindmap_content(document_text: str, title: str, max_depth: int = 3) -> str:
    """用 LLM 从文档内容生成 Markdown 格式思维导图"""
    from langchain_core.messages import HumanMessage, SystemMessage

    llm, err = await _get_llm_client()
    if llm is None:
        raise HTTPException(status_code=400, detail=err)

    # 截取前 4000 字用于 LLM 分析
    text_sample = document_text[:4000]

    system_prompt = """你是一个思维导图生成助手。请根据提供的文档内容，用 Markdown 格式生成一个结构化的思维导图。

要求：
1. 第一行使用 # 作为根节点（文档标题）
2. 第二级用 ##，第三级用 ###，最多到{}级
3. 每个节点的文字简洁扼要，控制在15字以内
4. 每个父节点应有2-5个子节点
5. 节点内容应反映文档的实际内容，不要添加文档中没有的信息
6. 只输出 Markdown 内容，不要添加 ```markdown 包裹，不要任何额外说明

示例：
# 周易
## 简介
### 群经之首
### 大道之源
## 核心理论
### 阴阳五行
### 天人合一
## 实践应用
### 学术研究
### 临床实践""".format(max_depth)

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"文档标题：{title}\n\n文档内容：\n{text_sample}"),
    ]

    try:
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=30.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI 生成超时，请重试")

    result = response.content.strip() if hasattr(response, 'content') else str(response).strip()
    # 去除可能的代码块包裹
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    return result


async def _ai_expand_mindmap_node(node_content: str, context: str, document_text: str = "") -> list:
    """用 LLM 扩展思维导图节点，返回子节点列表"""
    from langchain_core.messages import HumanMessage, SystemMessage

    llm, err = await _get_llm_client()
    if llm is None:
        raise HTTPException(status_code=400, detail=err)

    system_prompt = """你是一个思维导图扩展助手。用户指定了一个思维导图节点，请为该节点生成2-5个子节点。

要求：
1. 每个子节点的文字简洁扼要，控制在15字以内
2. 子节点应该是对父节点的合理细分或相关概念
3. 如果提供了文档上下文，子节点应基于文档内容
4. 如果没有文档上下文，基于常识生成合理的子节点

请以JSON格式返回，格式为：
[{"content": "子节点1"}, {"content": "子节点2"}, ...]

只返回JSON数组，不要添加任何其他内容。"""

    context_parts = [f"要扩展的节点：{node_content}"]
    if context:
        context_parts.append(f"父节点路径：{context}")
    if document_text:
        context_parts.append(f"文档内容（节选）：\n{document_text[:2000]}")

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="\n\n".join(context_parts)),
    ]

    try:
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=20.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="AI 扩展超时，请重试")

    result = response.content.strip() if hasattr(response, 'content') else str(response).strip()
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        children = json.loads(result)
        if not isinstance(children, list):
            raise ValueError("not a list")
        normalized = []
        for item in children:
            if isinstance(item, dict) and "content" in item:
                normalized.append({"content": str(item["content"])[:15], "children": []})
            elif isinstance(item, str):
                normalized.append({"content": item[:15], "children": []})
        return normalized
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=500, detail="AI 返回格式异常，请重试")


@router.post("/documents/{document_id}/mindmap/ai")
async def generate_mindmap_ai(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """使用 AI 生成思维导图"""
    result = await db.execute(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    content = doc.content_markdown or doc.content_text or ""
    if not content.strip():
        raise HTTPException(status_code=400, detail="文档内容为空，无法生成思维导图")

    try:
        mindmap_markdown = await _ai_generate_mindmap_content(content, doc.title or "未命名文档")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"AI 生成思维导图失败: {e}")
        raise HTTPException(status_code=500, detail=f"AI 生成失败: {str(e)}")

    # 保存到数据库
    mindmap = MindMap(
        document_id=document_id,
        user_id=user_id,
        title=doc.title,
        content_json=mindmap_markdown,
        depth_level=3,
    )
    db.add(mindmap)
    await db.flush()

    return {
        "mindmap": {
            "id": mindmap.id,
            "document_id": mindmap.document_id,
            "title": mindmap.title,
            "content_json": mindmap.content_json,
            "depth_level": mindmap.depth_level,
            "created_at": mindmap.created_at.isoformat() + "Z" if mindmap.created_at else None,
        }
    }


@router.post("/documents/{document_id}/mindmap/ai/expand")
async def expand_mindmap_node(
    document_id: int,
    req: MindMapAIExpandRequest,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """使用 AI 扩展思维导图节点，返回子节点列表"""
    document_text = ""
    if req.document_id:
        result = await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            document_text = doc.content_markdown or doc.content_text or ""

    try:
        children = await _ai_expand_mindmap_node(
            req.node_content, req.context or "", document_text
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"AI 扩展节点失败: {e}")
        raise HTTPException(status_code=500, detail=f"AI 扩展失败: {str(e)}")

    return {"children": children, "success": True}


@router.put("/mindmaps/{mindmap_id}")
async def update_mindmap(
    mindmap_id: int,
    content_json: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """更新思维导图内容（用户手动编辑后保存）"""
    result = await db.execute(select(MindMap).where(MindMap.id == mindmap_id))
    mindmap = result.scalar_one_or_none()
    if not mindmap:
        raise HTTPException(status_code=404, detail="思维导图不存在")

    mindmap.content_json = content_json
    await db.flush()

    return {"success": True, "message": "思维导图已保存"}


# ═══════════════════════════════════════════════════════════
# 知识库问答 API
# ═══════════════════════════════════════════════════════════

@router.post("/chat/query")
async def knowledge_chat_query(
    req: KnowledgeChatRequest,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    """知识库问答"""
    context_parts = []

    # 获取文档上下文
    if req.document_id:
        result = await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == req.document_id)
        )
        doc = result.scalar_one_or_none()
        if doc:
            context_parts.append(f"参考文档：《{doc.title}》")
            if doc.content_text:
                # 根据深度截取内容
                content = doc.content_text
                if req.depth == 1:
                    content = content[:1000]
                elif req.depth == 2:
                    content = content[:3000]
                context_parts.append(f"文档内容：\n{content}")

    # 获取分类上下文
    if req.category_id:
        result = await db.execute(
            select(KnowledgeCategory).where(KnowledgeCategory.id == req.category_id)
        )
        cat = result.scalar_one_or_none()
        if cat:
            context_parts.append(f"参考分类：{cat.name}")
            if cat.description:
                context_parts.append(f"分类描述：{cat.description}")

    context = "\n\n".join(context_parts) if context_parts else ""

    return {
        "message": "知识库问答功能已就绪",
        "context": context,
        "document_id": req.document_id,
        "category_id": req.category_id,
    }


# ═══════════════════════════════════════════════════════════
# 文档预解析 API（不保存，仅提取文本用于前端自动填充简介/作者）
# ═══════════════════════════════════════════════════════════

@router.post("/documents/preview")
async def preview_document(
    file: UploadFile = File(...),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    """预解析上传的文件，返回文本内容用于前端提取简介和作者（不保存到数据库）"""
    file_ext = Path(file.filename).suffix.lower().lstrip(".")
    file_type = _get_file_type_from_extension(file.filename)

    try:
        content_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件读取失败: {str(e)}")

    # 写入临时文件
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{file_ext}", delete=False) as tmp:
            tmp.write(content_bytes)
            tmp_path = tmp.name

        content_text, _, _ = await parse_document(tmp_path, file_type, None)
    except Exception as e:
        logger.warning(f"文档预解析失败: {e}")
        content_text = ""
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    return {
        "success": True,
        "content_text": content_text,
        "file_type": file_type,
    }


@router.post("/documents/preview/ai-summary")
async def ai_extract_summary(
    file: UploadFile = File(...),
    user_id: Optional[int] = Depends(get_optional_user_id),
):
    """使用 LLM 从文档内容中提取简介（100字以内）和作者，不保存到数据库"""
    import base64

    file_ext = Path(file.filename).suffix.lower().lstrip(".")
    file_type = _get_file_type_from_extension(file.filename)
    is_image = file_type in ("jpg", "jpeg", "png", "gif", "bmp", "webp", "image")

    try:
        content_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件读取失败: {str(e)}")

    # 写入临时文件并解析
    tmp_path = None
    content_text = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{file_ext}", delete=False) as tmp:
            tmp.write(content_bytes)
            tmp_path = tmp.name

        content_text, _, _ = await parse_document(tmp_path, file_type, None)
    except Exception as e:
        logger.warning(f"文档解析失败: {e}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # 图片类型：直接用多模态 LLM 分析图片
    if is_image and content_bytes:
        return await _ai_extract_from_image(content_bytes, file_ext)

    if not content_text.strip():
        return {"success": False, "description": "", "author": "", "message": "无法解析文档内容"}

    # 截取前 3000 字用于 LLM 分析（节省 token）
    text_sample = content_text[:3000]

    return await _ai_extract_from_text(text_sample)


async def _get_llm_client(vision: bool = False):
    """获取 LLM 客户端。vision=True 时优先使用 VISION_LLM_* 配置"""
    from langchain_openai import ChatOpenAI
    from ...config import settings

    if vision:
        # 视觉模式优先使用 VISION_LLM_* 配置
        api_key = getattr(settings, "VISION_LLM_API_KEY", None) or settings.FAST_LLM_API_KEY or settings.OPENAI_API_KEY
        model = getattr(settings, "VISION_LLM_MODEL", None) or settings.FAST_LLM_MODEL or settings.OPENAI_MODEL
        base_url = getattr(settings, "VISION_LLM_BASE_URL", None) or settings.FAST_LLM_BASE_URL or settings.OPENAI_BASE_URL
    else:
        api_key = settings.FAST_LLM_API_KEY or settings.OPENAI_API_KEY
        model = settings.FAST_LLM_MODEL or settings.OPENAI_MODEL
        base_url = settings.FAST_LLM_BASE_URL or settings.OPENAI_BASE_URL

    if not api_key:
        return None, "LLM 服务未配置，请在 .env 中设置 FAST_LLM_API_KEY 或 OPENAI_API_KEY"

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0.1,
        streaming=False,
    )
    return llm, None


async def _ai_extract_from_text(text_sample: str):
    """用 LLM 从文本中提取简介和作者"""
    from langchain_core.messages import HumanMessage, SystemMessage

    llm, err = await _get_llm_client()
    if llm is None:
        return {"success": False, "description": "", "author": "", "message": err}

    system_prompt = """你是一个文档摘要助手。根据文档内容提取以下两项信息：

1. 作者：仅在文档中明确署名时提取，否则留空。
2. 简介：用一句话概括文档的核心主题或主要内容，80字以内。只陈述文档讲了什么，不要包含任何评价、推荐语、技术栈说明、使用场景等无关信息。

返回JSON格式，不要添加任何其他内容：
{"author": "作者名", "description": "简介"}"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=text_sample),
    ]

    try:
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=15.0)
    except asyncio.TimeoutError:
        return {"success": False, "description": "", "author": "", "message": "AI 解析超时，请重试"}

    return _parse_ai_response(response)


async def _ai_extract_from_image(content_bytes: bytes, file_ext: str):
    """用多模态 LLM 直接分析图片，提取简介和作者"""
    import base64
    from langchain_core.messages import HumanMessage, SystemMessage

    llm, err = await _get_llm_client(vision=True)
    if llm is None:
        return {"success": False, "description": "", "author": "", "message": err}

    # 将图片转为 base64
    img_b64 = base64.b64encode(content_bytes).decode("utf-8")
    mime_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "gif": "image/gif",
        "bmp": "image/bmp", "webp": "image/webp",
    }
    mime = mime_map.get(file_ext, "image/jpeg")

    system_prompt = """你是一个文档摘要助手。根据图片内容提取以下两项信息：

1. 作者：仅在图片中有明确署名、题款、水印时提取，否则留空。
2. 简介：用一句话概括图片的核心内容（如画作主题、书法内容、图表数据等），80字以内。只陈述图片呈现了什么，不要包含任何评价、推荐语等无关信息。

返回JSON格式，不要添加任何其他内容：
{"author": "作者名", "description": "简介"}"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=[
            {"type": "text", "text": "请分析这张图片。"},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
        ]),
    ]

    try:
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=20.0)
    except asyncio.TimeoutError:
        return {"success": False, "description": "", "author": "", "message": "AI 解析超时，请重试"}
    except Exception as e:
        err_str = str(e)
        if "Model only support text input" in err_str or "BadRequest" in err_str:
            return {
                "success": False,
                "description": "",
                "author": "",
                "message": "当前 LLM 模型不支持图片输入，请在 .env 中配置支持视觉的 VISION_LLM_MODEL",
            }
        logger.warning(f"AI 图片解析失败: {e}")
        return {"success": False, "description": "", "author": "", "message": f"AI 解析失败: {str(e)}"}

    return _parse_ai_response(response)


def _parse_ai_response(response):
    """解析 LLM 返回的 JSON 响应"""
    result = response.content.strip() if hasattr(response, 'content') else str(response).strip()

    # 去除可能的 markdown 代码块包裹
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        parsed = json.loads(result)
        author = parsed.get("author", "").strip()
        description = parsed.get("description", "").strip()
    except json.JSONDecodeError:
        logger.warning(f"AI 返回 JSON 解析失败: {result[:200]}")
        return {"success": False, "description": "", "author": "", "message": "AI 返回格式异常，请重试"}

    # 确保简介不超过 80 字
    if len(description) > 80:
        description = description[:80]

    logger.info(f"AI 提取完成: author={author}, desc_len={len(description)}")
    return {"success": True, "description": description, "author": author}


# ═══════════════════════════════════════════════════════════
# 内部辅助函数
# ═══════════════════════════════════════════════════════════

async def _handle_document_upload(
    db: AsyncSession,
    file: UploadFile,
    title: str,
    category_id: Optional[int],
    description: Optional[str],
    author: Optional[str],
    source: Optional[str],
    depth_level: int,
    user_id: int,
    is_public: bool,
    request: Optional[Request] = None,
) -> dict:
    """处理文档上传的通用逻辑"""
    # 确定文件类型
    file_ext = Path(file.filename).suffix.lower().lstrip(".")
    file_type = _get_file_type_from_extension(file.filename)

    # 保存文件
    upload_dir = Path(__file__).resolve().parent.parent.parent.parent / "data" / "knowledge"
    upload_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = upload_dir / unique_name

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        file_size = len(content)
    except Exception as e:
        logger.error(f"文件保存失败: {e}")
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")

    # 解析文档内容
    content_text = ""
    content_md = ""
    pages = []

    # PPT 文件：创建幻灯片图片目录
    slides_dir = None
    if file_type == "pptx":
        slides_dir = upload_dir / "slides" / unique_name.rsplit(".", 1)[0]
        slides_dir.mkdir(parents=True, exist_ok=True)

    try:
        content_text, content_md, pages = await parse_document(str(file_path), file_type, str(slides_dir) if slides_dir else None)
        logger.info(f"文档解析完成: {file.filename}, 共 {len(pages)} 页")
    except Exception as e:
        logger.warning(f"文档解析失败，保留原始文件: {e}")

    # 创建文档记录
    document = KnowledgeDocument(
        title=title,
        category_id=category_id,
        user_id=user_id,
        file_path=str(file_path),
        file_type=file_type,
        file_size=file_size,
        content_text=content_text,
        content_markdown=content_md,
        description=description,
        author=author,
        source=source,
        is_public=is_public,
        depth_level=depth_level,
    )
    db.add(document)
    await db.flush()

    # 保存分页
    for page in pages:
        page_record = KnowledgeDocumentPage(
            document_id=document.id,
            page_number=page["page_number"],
            content_text=page["content_text"],
            image_path=page.get("image_path"),
        )
        db.add(page_record)

    await db.flush()

    # 手动添加到 FTS5 索引（不使用触发器）
    if is_public:
        await index_document(db, document.id, title, content_text, description, author)

    logger.info(f"文档上传成功: {title} (ID: {document.id}, 类型: {file_type})")

    return {
        "message": "文档上传成功",
        "success": True,
        "id": document.id,
        "title": title,
        "file_type": file_type,
        "file_size": file_size,
        "page_count": len(pages),
    }


def _delete_uploaded_file(file_path: str) -> None:
    """删除上传的文件"""
    try:
        path = Path(file_path)
        if path.exists():
            path.unlink()
    except Exception as e:
        logger.warning(f"文件删除失败: {file_path}, 错误: {e}")


def _cleanup_empty_slides_dir(sample_path: str) -> None:
    """清理幻灯片图片目录（如果为空则删除）"""
    try:
        img_path = Path(sample_path)
        slides_dir = img_path.parent
        if slides_dir.exists() and slides_dir.is_dir():
            # 检查目录是否为空
            if not any(slides_dir.iterdir()):
                slides_dir.rmdir()
                logger.info(f"幻灯片目录已清理: {slides_dir}")
    except Exception as e:
        logger.warning(f"幻灯片目录清理失败: {sample_path}, 错误: {e}")


def _extract_mindmap_from_markdown(content: str, title: str) -> dict:
    """从 Markdown 内容提取思维导图结构"""
    import re

    root = {"content": title, "children": []}
    stack = [(root, 0)]  # (node, level)

    for line in content.split("\n"):
        match = re.match(r"^(#{1,6})\s+(.+)$", line.strip())
        if match:
            level = len(match.group(1))
            heading_text = match.group(2).strip()

            # 找到合适的父节点
            while len(stack) > 1 and stack[-1][1] >= level:
                stack.pop()

            parent = stack[-1][0]
            new_node = {"content": heading_text, "children": []}
            if "children" not in parent:
                parent["children"] = []
            parent["children"].append(new_node)
            stack.append((new_node, level))

    return root