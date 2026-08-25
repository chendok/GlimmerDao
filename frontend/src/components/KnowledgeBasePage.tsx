import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../utils/constants'
import KnowledgeCategoryTree from './KnowledgeCategoryTree'
import KnowledgeDocumentList from './KnowledgeDocumentList'
import KnowledgeDocumentViewer from './KnowledgeDocumentViewer'
import KnowledgeDocumentUpload from './KnowledgeDocumentUpload'
import LoginPrompt from './LoginPrompt'
import KbConfirmDialog from './KbConfirmDialog'
import './KnowledgeBase.css'

// ── 侧边栏宽度配置 ──
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 500
const SIDEBAR_COLLAPSED_WIDTH = 44
const SIDEBAR_DEFAULT_WIDTH = 220
const SIDEBAR_WIDTH_STORAGE_KEY = 'kb-sidebar-width'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'kb-sidebar-collapsed'

interface Category {
  id: number
  name: string
  code: string | null
  parent_id: number | null
  description: string | null
  document_count: number
  children: Category[]
}

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

type TabKey = 'general' | 'personal'

export default function KnowledgeBasePage() {
  const { isLoggedIn, token, user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('general')
  const [categories, setCategories] = useState<Category[]>([])
  const [personalCategories, setPersonalCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // ── 侧边栏宽度与收缩状态（持久化到 localStorage）──
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    const w = saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
    return Number.isNaN(w) ? SIDEBAR_DEFAULT_WIDTH : Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, w))
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  })
  const [isResizing, setIsResizing] = useState(false)

  // 持久化宽度与收缩状态
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // 拖拽调整宽度
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (sidebarCollapsed) return
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + delta))
      setSidebarWidth(newWidth)
    }
    const onUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth, sidebarCollapsed])

  // 收缩/展开切换
  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed(prev => !prev)
  }, [])

  // 加载分类（useRef 防护 StrictMode 双重执行导致重复请求）
  const catLoadingRef = useRef(false)
  useEffect(() => {
    if (catLoadingRef.current) return
    catLoadingRef.current = true

    const load = async () => {
      try {
        if (activeTab === 'general') {
          const res = await fetch(`${API_BASE}/knowledge/categories`)
          const data = await res.json()
          setCategories(data.categories || [])
        } else if (activeTab === 'personal' && token) {
          const res = await fetch(`${API_BASE}/knowledge/personal/categories`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await res.json()
          setPersonalCategories(data.categories || [])
        }
      } catch (e) {
        console.error('[KnowledgeBase] 加载分类失败:', e)
      } finally {
        catLoadingRef.current = false
      }
    }
    load()
  }, [activeTab, token, refreshKey])

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab)
    setSelectedCategoryId(null)
    setSelectedDocumentId(null)
    setSearchQuery('')
  }

  const handleCategorySelect = (id: number) => {
    setSelectedCategoryId(id)
    setSelectedDocumentId(null)
  }

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocumentId(doc.id)
  }

  const handleUploadSuccess = () => {
    setShowUpload(false)
    setRefreshKey(k => k + 1)
  }

  const handleSearch = (q: string) => {
    setSearchQuery(q)
  }

  // ── 删除确认弹窗状态 ──
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ msg, type })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleDeleteDocument = (doc: Document) => {
    if (!token) return
    setDeleteTarget(doc)
  }

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_BASE}/knowledge/personal/documents/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        if (selectedDocumentId === deleteTarget.id) {
          setSelectedDocumentId(null)
        }
        setRefreshKey(k => k + 1)
        showToast(`「${deleteTarget.title}」已删除`, 'success')
      } else {
        showToast(data.message || '删除失败', 'error')
      }
    } catch (e) {
      console.error('[KnowledgeBase] 删除文档失败:', e)
      showToast('删除失败，请重试', 'error')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const cancelDelete = () => {
    if (deleting) return
    setDeleteTarget(null)
  }

  // Tab 渲染函数（避免 TypeScript 类型收窄问题）
  const renderTabs = (currentTab: TabKey) => (
    <div className="kb-tabs">
      <button className={`kb-tab${currentTab === 'general' ? ' active' : ''}`} onClick={() => handleTabChange('general')}>通用知识库</button>
      <button className={`kb-tab${currentTab === 'personal' ? ' active' : ''}`} onClick={() => handleTabChange('personal')}>个人知识库</button>
    </div>
  )

  const displayCategories = activeTab === 'personal' ? personalCategories : categories

  // 递归从分类树中查找分类名称
  const findCategoryName = useCallback((id: number, cats: Category[]): string | null => {
    for (const cat of cats) {
      if (cat.id === id) return cat.name
      if (cat.children.length > 0) {
        const found = findCategoryName(id, cat.children)
        if (found) return found
      }
    }
    return null
  }, [])

  const selectedCategoryName = selectedCategoryId ? findCategoryName(selectedCategoryId, displayCategories) : null

  // 需要登录提示
  if (activeTab === 'personal' && !isLoggedIn) {
    return (
      <div className="kb-page">
        <div className="kb-header">
          {renderTabs(activeTab)}
        </div>
        <LoginPrompt />
      </div>
    )
  }

  return (
    <div className="kb-page">
      {/* 顶部导航 */}
      <div className="kb-header">
        {renderTabs(activeTab)}
        <div className="kb-header-actions">
          {isLoggedIn && (
            <button className="kb-btn kb-btn-primary" onClick={() => setShowUpload(true)}>
              上传文档
            </button>
          )}
        </div>
      </div>

      {/* 主内容 */}
      <div className="kb-main">
        {/* 左侧分类树 */}
        <aside
          className={`kb-sidebar${sidebarCollapsed ? ' collapsed' : ''}${isResizing ? ' resizing' : ''}`}
          style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth, flexShrink: 0 }}
        >
          <div className="kb-sidebar-inner">
            <KnowledgeCategoryTree
              categories={displayCategories}
              selectedId={selectedCategoryId}
              onSelect={handleCategorySelect}
              isPersonal={activeTab === 'personal'}
              isAdmin={!!user?.is_admin}
              onRefresh={() => setRefreshKey(k => k + 1)}
              token={token}
              onCollapse={!sidebarCollapsed ? toggleCollapse : undefined}
              onToast={showToast}
            />
          </div>

          {/* 收缩状态下显示知识库图标，点击展开 */}
          {sidebarCollapsed && (
            <button className="kb-sidebar-collapsed-expand" onClick={toggleCollapse} title="展开分类面板">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
          )}

          {/* 拖拽调整宽度的手柄 */}
          {!sidebarCollapsed && (
            <div className="kb-sidebar-resize-handle" onMouseDown={handleResizeStart}>
              {/* 拖拽时的实时宽度反馈 */}
              {isResizing && (
                <span className="kb-sidebar-width-badge">{sidebarWidth}px</span>
              )}
            </div>
          )}
        </aside>

        {/* 中间文档列表 */}
        <div className="kb-content">
          <KnowledgeDocumentList
            categoryId={selectedCategoryId}
            searchQuery={searchQuery}
            onSelectDocument={handleDocumentSelect}
            onSearch={handleSearch}
            isPersonal={activeTab === 'personal'}
            token={token}
            selectedDocumentId={selectedDocumentId}
            refreshKey={refreshKey}
            onDeleteDocument={handleDeleteDocument}
          />
        </div>

        {/* 右侧文档阅读器 */}
        {selectedDocumentId && (
          <div className="kb-viewer">
            <KnowledgeDocumentViewer
              documentId={selectedDocumentId}
              onClose={() => setSelectedDocumentId(null)}
              token={token}
            />
          </div>
        )}
      </div>

      {/* 上传模态框 */}
      {showUpload && (
        <KnowledgeDocumentUpload
          isPersonal={activeTab === 'personal'}
          token={token}
          onSuccess={handleUploadSuccess}
          onClose={() => setShowUpload(false)}
          selectedCategoryId={selectedCategoryId}
          selectedCategoryName={selectedCategoryName}
        />
      )}

      {/* 删除确认弹窗 */}
      <KbConfirmDialog
        open={!!deleteTarget}
        title="删除文档"
        message={deleteTarget ? `确定要删除文档「${deleteTarget.title}」吗？此操作不可撤销，将同时删除文档的所有关联数据。` : ''}
        confirmText="删除"
        cancelText="取消"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* 轻量提示 */}
      {toast && (
        <div className={`kb-toast kb-toast-${toast.type}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {toast.type === 'success' ? (
              <>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            )}
          </svg>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}