"""知识库相关 Pydantic 数据模型"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


# ── 分类 ──

class KnowledgeCategoryCreate(BaseModel):
    """创建分类请求"""
    name: str = Field(..., min_length=1, max_length=64, description="分类名称")
    code: Optional[str] = Field(None, max_length=64, description="分类编码")
    parent_id: Optional[int] = Field(None, description="父分类ID")
    description: Optional[str] = Field(None, description="分类描述")
    sort_order: int = Field(0, description="排序序号")
    icon: Optional[str] = Field(None, description="图标标识")


class KnowledgeCategoryUpdate(BaseModel):
    """更新分类请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    code: Optional[str] = Field(None, max_length=64)
    parent_id: Optional[int] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    icon: Optional[str] = None


class KnowledgeCategoryResponse(BaseModel):
    """分类响应"""
    id: int
    name: str
    code: Optional[str] = None
    parent_id: Optional[int] = None
    is_system: bool = False
    user_id: Optional[int] = None
    description: Optional[str] = None
    sort_order: int = 0
    icon: Optional[str] = None
    document_count: int = 0
    children: List["KnowledgeCategoryResponse"] = []
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── 文档 ──

class KnowledgeDocumentCreate(BaseModel):
    """创建文档请求"""
    title: str = Field(..., min_length=1, max_length=256, description="文档标题")
    category_id: Optional[int] = Field(None, description="所属分类ID")
    description: Optional[str] = Field(None, description="简介/摘要")
    author: Optional[str] = Field(None, max_length=128, description="作者")
    source: Optional[str] = Field(None, max_length=256, description="来源")
    depth_level: int = Field(2, ge=1, le=3, description="内容深度(1-3)")


class KnowledgeDocumentUpdate(BaseModel):
    """更新文档请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    category_id: Optional[int] = None
    description: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None
    depth_level: Optional[int] = Field(None, ge=1, le=3)
    is_public: Optional[bool] = None


class KnowledgeDocumentResponse(BaseModel):
    """文档响应"""
    id: int
    title: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    user_id: Optional[int] = None
    file_type: str
    file_size: Optional[int] = None
    cover_image: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None
    is_public: bool = True
    depth_level: int = 2
    view_count: int = 0
    page_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class KnowledgeDocumentContentResponse(BaseModel):
    """文档内容响应"""
    id: int
    title: str
    content_text: Optional[str] = None
    content_markdown: Optional[str] = None
    pages: List[dict] = []
    depth_level: int = 2
    page_count: int = 0


# ── 文档列表 ──

class KnowledgeDocumentListResponse(BaseModel):
    """文档列表响应"""
    total: int
    page: int
    page_size: int
    items: List[KnowledgeDocumentResponse]


# ── 学习进度 ──

class LearningProgressCreate(BaseModel):
    """保存学习进度请求"""
    document_id: int = Field(..., description="文档ID")
    current_page: int = Field(1, ge=1, description="当前页码")
    progress_percentage: float = Field(0.0, ge=0.0, le=100.0, description="学习进度百分比")
    depth_level: int = Field(2, ge=1, le=3, description="当前阅读深度")
    notes: Optional[str] = Field(None, description="用户笔记")


class LearningProgressResponse(BaseModel):
    """学习进度响应"""
    id: int
    document_id: int
    document_title: Optional[str] = None
    current_page: int = 1
    progress_percentage: float = 0.0
    depth_level: int = 2
    notes: Optional[str] = None
    last_read_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── 思维导图 ──

class MindMapResponse(BaseModel):
    """思维导图响应"""
    id: int
    document_id: Optional[int] = None
    title: Optional[str] = None
    content_json: str
    depth_level: int = 2
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ── 搜索 ──

class KnowledgeSearchRequest(BaseModel):
    """搜索请求"""
    q: str = Field(..., min_length=1, description="搜索关键词")
    category_id: Optional[int] = Field(None, description="限定分类")
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100, description="每页数量")


class KnowledgeSearchResponse(BaseModel):
    """搜索响应"""
    total: int
    page: int
    page_size: int
    items: List[KnowledgeDocumentResponse]


# ── 聊天 ──

class KnowledgeChatRequest(BaseModel):
    """知识库问答请求"""
    message: str = Field(..., min_length=1, description="用户消息")
    document_id: Optional[int] = Field(None, description="关联文档ID")
    category_id: Optional[int] = Field(None, description="关联分类ID")
    session_id: Optional[str] = Field(None, description="会话ID")
    depth: int = Field(2, ge=1, le=3, description="内容深度")


# ── 通用响应 ──

class MessageResponse(BaseModel):
    """通用消息响应"""
    message: str
    success: bool = True


class PaginationParams(BaseModel):
    """分页参数"""
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)