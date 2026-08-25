import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../utils/constants'

interface Document {
  id: number
  title: string
  category_id: number | null
  category_name: string | null
  file_type: string
  file_size: number | null
  description: string | null
  author: string | null
  source: string | null
  is_public: boolean
  depth_level: number
  view_count: number
  page_count: number
  created_at: string | null
  updated_at: string | null
}

interface Props {
  categoryId: number | null
  searchQuery: string
  onSelectDocument: (doc: Document) => void
  onSearch: (q: string) => void
  isPersonal: boolean
  token: string | null
  selectedDocumentId: number | null
  refreshKey: number
  onDeleteDocument?: (doc: Document) => void
}

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', docx: 'Word', md: 'Markdown', txt: 'TXT',
  xlsx: 'Excel', pptx: 'PPT', epub: 'ePub', mobi: 'Mobi',
  html: 'HTML', image: '图片',
}

export default function KnowledgeDocumentList({
  categoryId, searchQuery, onSelectDocument, onSearch,
  isPersonal, token, selectedDocumentId, refreshKey,
  onDeleteDocument,
}: Props) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [localSearch, setLocalSearch] = useState('')
  const pageSize = 20

  const loadingRef = useRef(false)

  useEffect(() => {
    setPage(1)
  }, [categoryId, searchQuery])

  // 加载文档（useRef 防护 StrictMode 双重执行导致重复请求）
  useEffect(() => {
    if (loadingRef.current) return
    loadingRef.current = true

    const load = async () => {
      setLoading(true)
      try {
        const endpoint = isPersonal
          ? `${API_BASE}/knowledge/personal/documents`
          : `${API_BASE}/knowledge/documents`

        const params = new URLSearchParams()
        if (categoryId) params.set('category_id', String(categoryId))
        if (searchQuery) params.set('search', searchQuery)
        params.set('page', String(page))
        params.set('page_size', String(pageSize))

        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        const res = await fetch(`${endpoint}?${params}`, { headers })
        const data = await res.json()
        setDocuments(data.items || [])
        setTotal(data.total || 0)
      } catch (e) {
        console.error('[DocumentList] 加载文档失败:', e)
      } finally {
        setLoading(false)
        loadingRef.current = false
      }
    }
    load()
  }, [categoryId, searchQuery, page, isPersonal, token, refreshKey])

  const handleSearch = () => {
    onSearch(localSearch)
  }

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="kb-doc-list">
      {/* 搜索栏 */}
      <div className="kb-search-bar">
        <input
          type="text"
          className="kb-input kb-search-input"
          placeholder="搜索文档..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="kb-btn kb-btn-sm" onClick={handleSearch}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {/* 文档列表 */}
      {loading ? (
        <div className="kb-loading">加载中...</div>
      ) : documents.length === 0 ? (
        <div className="kb-empty">
          <p>{searchQuery ? `未找到包含 "${searchQuery}" 的文档` : '暂无文档'}</p>
        </div>
      ) : (
        <>
          <div className="kb-doc-items">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`kb-doc-card${selectedDocumentId === doc.id ? ' selected' : ''}`}
                onClick={() => onSelectDocument(doc)}
              >
                <div className="kb-doc-card-header">
                  <span className="kb-doc-type-badge">{FILE_TYPE_LABELS[doc.file_type] || doc.file_type}</span>
                  <span className="kb-doc-title">{doc.title}</span>
                  {isPersonal && onDeleteDocument && (
                    <button
                      className="kb-doc-delete-btn"
                      title="删除文档"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteDocument(doc)
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}
                </div>
                {doc.description && (
                  <p className="kb-doc-desc">{doc.description}</p>
                )}
                <div className="kb-doc-meta">
                  {doc.author && <span className="kb-doc-author">{doc.author}</span>}
                  <span className="kb-doc-size">{formatFileSize(doc.file_size)}</span>
                  {doc.page_count > 0 && <span className="kb-doc-pages">{doc.page_count}页</span>}
                  <span className="kb-doc-views">{doc.view_count}次浏览</span>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="kb-pagination">
              <button
                className="kb-btn kb-btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                上一页
              </button>
              <span className="kb-page-info">{page} / {totalPages}</span>
              <button
                className="kb-btn kb-btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}