"""知识库相关数据库模型"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from .user import Base


class KnowledgeCategory(Base):
    """知识分类 — 树形结构，支持通用分类(system)和个人分类"""
    __tablename__ = "knowledge_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False, comment="分类名称")
    code = Column(String(64), nullable=True, comment="分类编码，用于排序")
    parent_id = Column(Integer, ForeignKey("knowledge_categories.id", ondelete="CASCADE"), nullable=True, comment="父分类ID")
    is_system = Column(Boolean, default=False, comment="True=系统通用分类，False=个人分类")
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, comment="个人分类所属用户")
    description = Column(Text, nullable=True, comment="分类描述")
    sort_order = Column(Integer, default=0, comment="排序序号")
    icon = Column(String(64), nullable=True, comment="图标标识")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    parent = relationship("KnowledgeCategory", remote_side=[id], backref="children")
    documents = relationship("KnowledgeDocument", back_populates="category", cascade="all, delete-orphan")


class KnowledgeDocument(Base):
    """知识文档"""
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(256), nullable=False, comment="文档标题")
    category_id = Column(Integer, ForeignKey("knowledge_categories.id", ondelete="SET NULL"), nullable=True, comment="所属分类")
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, comment="个人文档所属用户")
    file_path = Column(String(512), nullable=True, comment="存储路径（相对路径）")
    file_type = Column(String(20), nullable=False, comment="文档类型: pdf/docx/md/txt/xlsx/pptx/epub/mobi/html/image")
    file_size = Column(Integer, nullable=True, comment="文件大小(字节)")
    content_text = Column(Text, nullable=True, comment="解析后的纯文本内容")
    content_markdown = Column(Text, nullable=True, comment="解析后的Markdown内容")
    cover_image = Column(String(512), nullable=True, comment="封面图路径")
    description = Column(Text, nullable=True, comment="简介/摘要")
    author = Column(String(128), nullable=True, comment="作者")
    source = Column(String(256), nullable=True, comment="来源")
    is_public = Column(Boolean, default=True, comment="是否公开")
    depth_level = Column(Integer, default=2, comment="默认内容深度(1-3)")
    view_count = Column(Integer, default=0, comment="浏览次数")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    category = relationship("KnowledgeCategory", back_populates="documents")
    pages = relationship("KnowledgeDocumentPage", back_populates="document", cascade="all, delete-orphan")
    mindmaps = relationship("MindMap", back_populates="document", cascade="all, delete-orphan")
    learning_progresses = relationship("LearningProgress", back_populates="document", cascade="all, delete-orphan")


class KnowledgeDocumentPage(Base):
    """文档分页 — 大文档按页存储"""
    __tablename__ = "knowledge_document_pages"
    __table_args__ = (
        UniqueConstraint("document_id", "page_number", name="uq_document_page"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False)
    page_number = Column(Integer, nullable=False, comment="页码")
    content_text = Column(Text, nullable=True, comment="该页文本")
    image_path = Column(String(512), nullable=True, comment="该页截图路径")

    # 关系
    document = relationship("KnowledgeDocument", back_populates="pages")


class LearningProgress(Base):
    """用户学习进度"""
    __tablename__ = "learning_progresses"
    __table_args__ = (
        UniqueConstraint("user_id", "document_id", name="uq_user_document_progress"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False)
    current_page = Column(Integer, default=1, comment="当前页码")
    progress_percentage = Column(Float, default=0.0, comment="学习进度百分比")
    depth_level = Column(Integer, default=2, comment="当前阅读深度")
    notes = Column(Text, nullable=True, comment="用户笔记")
    last_read_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    document = relationship("KnowledgeDocument", back_populates="learning_progresses")


class MindMap(Base):
    """思维导图"""
    __tablename__ = "mindmaps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=True, comment="关联文档")
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, comment="生成用户")
    title = Column(String(256), nullable=True, comment="导图标题")
    content_json = Column(Text, nullable=False, comment="markmap JSON格式")
    depth_level = Column(Integer, default=2, comment="展开深度")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    document = relationship("KnowledgeDocument", back_populates="mindmaps")