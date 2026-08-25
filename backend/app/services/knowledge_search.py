"""知识库全文搜索服务 — 基于 SQLite FTS5（无触发器，手动索引）"""
import logging
from typing import List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("uvicorn")


async def init_fts(db: AsyncSession) -> None:
    """初始化 FTS5 全文搜索虚拟表（不使用触发器，避免数据库损坏）"""
    try:
        await db.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_documents_fts USING fts5(
                title,
                content_text,
                description,
                author,
                content='knowledge_documents',
                content_rowid='id'
            )
        """))
        await db.commit()
        logger.info("FTS5 全文搜索索引表已就绪（无触发器模式）")
    except Exception as e:
        logger.warning(f"FTS5 初始化失败: {e}")


async def index_document(
    db: AsyncSession,
    doc_id: int,
    title: str,
    content_text: Optional[str],
    description: Optional[str],
    author: Optional[str],
) -> None:
    """手动将文档添加到 FTS5 索引"""
    try:
        # 先删除旧索引（如果存在）
        await db.execute(text(
            "DELETE FROM knowledge_documents_fts WHERE rowid = :id"
        ), {"id": doc_id})
        # 插入新索引
        await db.execute(text(
            "INSERT INTO knowledge_documents_fts(rowid, title, content_text, description, author) "
            "VALUES (:id, :title, :content_text, :description, :author)"
        ), {
            "id": doc_id,
            "title": title or "",
            "content_text": content_text or "",
            "description": description or "",
            "author": author or "",
        })
        await db.commit()
    except Exception as e:
        logger.warning(f"FTS5 索引文档 {doc_id} 失败: {e}")


async def remove_document_from_index(db: AsyncSession, doc_id: int) -> None:
    """从 FTS5 索引中删除文档"""
    try:
        await db.execute(text(
            "DELETE FROM knowledge_documents_fts WHERE rowid = :id"
        ), {"id": doc_id})
        await db.commit()
    except Exception as e:
        logger.warning(f"FTS5 删除文档 {doc_id} 索引失败: {e}")


async def search_documents(
    db: AsyncSession,
    query: str,
    category_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple:
    """全文搜索文档"""
    from sqlalchemy import select, func
    from ..models.knowledge import KnowledgeDocument

    # 使用 FTS5 搜索
    try:
        # 清理查询字符串，避免 FTS5 语法错误
        safe_query = query.replace('"', '""').replace("'", "''")
        fts_sql = text("""
            SELECT rowid, rank FROM knowledge_documents_fts
            WHERE knowledge_documents_fts MATCH :query
            ORDER BY rank
            LIMIT :limit OFFSET :offset
        """)
        count_sql = text("""
            SELECT COUNT(*) FROM knowledge_documents_fts
            WHERE knowledge_documents_fts MATCH :query
        """)

        offset = (page - 1) * page_size
        count_result = await db.execute(count_sql, {"query": safe_query})
        total = count_result.scalar() or 0

        fts_result = await db.execute(fts_sql, {
            "query": safe_query,
            "limit": page_size,
            "offset": offset,
        })
        matched_ids = [row[0] for row in fts_result.fetchall()]

        if not matched_ids:
            return [], 0

        # 根据匹配的 ID 获取文档
        doc_query = select(KnowledgeDocument).where(
            KnowledgeDocument.id.in_(matched_ids),
            KnowledgeDocument.is_public == True,
        )
        if category_id:
            doc_query = doc_query.where(KnowledgeDocument.category_id == category_id)

        result = await db.execute(doc_query)
        documents = result.scalars().all()

        # 保持 FTS 排序
        doc_map = {doc.id: doc for doc in documents}
        ordered_docs = [doc_map[did] for did in matched_ids if did in doc_map]

        return ordered_docs, total

    except Exception as e:
        logger.warning(f"FTS5 搜索失败，回退到 LIKE 搜索: {e}")
        return await _fallback_search(db, query, category_id, page, page_size)


async def _fallback_search(
    db: AsyncSession,
    query: str,
    category_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple:
    """LIKE 回退搜索"""
    from sqlalchemy import select, func, or_
    from ..models.knowledge import KnowledgeDocument

    like_pattern = f"%{query}%"
    doc_query = select(KnowledgeDocument).where(
        KnowledgeDocument.is_public == True,
        or_(
            KnowledgeDocument.title.like(like_pattern),
            KnowledgeDocument.content_text.like(like_pattern),
            KnowledgeDocument.description.like(like_pattern),
            KnowledgeDocument.author.like(like_pattern),
        ),
    )
    count_query = select(func.count(KnowledgeDocument.id)).where(
        KnowledgeDocument.is_public == True,
        or_(
            KnowledgeDocument.title.like(like_pattern),
            KnowledgeDocument.content_text.like(like_pattern),
            KnowledgeDocument.description.like(like_pattern),
            KnowledgeDocument.author.like(like_pattern),
        ),
    )

    if category_id:
        doc_query = doc_query.where(KnowledgeDocument.category_id == category_id)
        count_query = count_query.where(KnowledgeDocument.category_id == category_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    doc_query = doc_query.order_by(KnowledgeDocument.updated_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(doc_query)
    documents = result.scalars().all()

    return documents, total


async def rebuild_fts_index(db: AsyncSession) -> None:
    """重建 FTS5 索引（从主表重新导入所有数据）"""
    try:
        # 清空 FTS 表
        await db.execute(text("DELETE FROM knowledge_documents_fts"))
        # 从主表重新导入
        await db.execute(text("""
            INSERT INTO knowledge_documents_fts(rowid, title, content_text, description, author)
            SELECT id, title, COALESCE(content_text, ''), COALESCE(description, ''), COALESCE(author, '')
            FROM knowledge_documents
            WHERE is_public = 1
        """))
        await db.commit()
        logger.info("FTS5 索引重建完成")
    except Exception as e:
        logger.error(f"FTS5 索引重建失败: {e}")