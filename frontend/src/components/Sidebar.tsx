import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatContext } from '../hooks/useChatContext'
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { SUGGESTIONS } from '../utils/constants'
import type { FeatureKey } from '../context/ChatContext'
import type { SidebarMode } from '../App'

const FEATURE_ICONS: Record<FeatureKey, string> = {
  '四柱八字': '🔮',
  '黄历择吉': '📅',
  '麻衣神相': '👤',
  '六爻占卜': '🪙',
  '梅花易数': '🌸',
  '紫微斗数': '✨',
  '档案库': '📁',
  '知识库': '📚',
  '系统管理': '🛡️',
}

const FEATURE_THEME: Record<FeatureKey, string> = {
  '四柱八字': 'gold',
  '黄历择吉': 'green',
  '麻衣神相': 'blue',
  '六爻占卜': 'amber',
  '梅花易数': 'pink',
  '紫微斗数': 'violet',
  '档案库': '',
  '知识库': '',
  '系统管理': '',
}

interface SidebarProps {
  mode: SidebarMode
  onToggleMode: () => void
  onSelectFeature: (f: FeatureKey) => void
  onBackToChat?: () => void
}

export default function Sidebar({ mode, onToggleMode, onSelectFeature, onBackToChat }: SidebarProps) {
  const {
    sessionId, sessions, sessionsHasMore, sessionsLoading, loading,
    resetSession, switchSession, deleteSession, clearAllSessions, clearingAll,
    searchSessions, loadMoreSessions,
    theme, setTheme,
  } = useChatContext()

  const { user, isLoggedIn, openLoginModal, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<'sessions' | 'topics' | ''>('sessions')
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [themeExpanded, setThemeExpanded] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  // 搜索防抖：输入停顿 300ms 后再发起请求，避免每次击键都请求
  useEffect(() => {
    const timer = setTimeout(() => {
      searchSessions(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // ── 侧边栏拖拽宽度调整 ──
  const SIDEBAR_MIN_WIDTH = 155
  const SIDEBAR_MAX_WIDTH = 500
  const SIDEBAR_DEFAULT_WIDTH = 280
  const STORAGE_KEY = 'sidebarWidth'

  const getInitialWidth = (): number => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const val = parseInt(saved, 10)
        if (!isNaN(val) && val >= SIDEBAR_MIN_WIDTH && val <= SIDEBAR_MAX_WIDTH) {
          return val
        }
      }
    } catch { /* localStorage 不可用时忽略 */ }
    return SIDEBAR_DEFAULT_WIDTH
  }

  const [sidebarWidth, setSidebarWidth] = useState<number>(getInitialWidth)
  const sidebarWidthRef = useRef(sidebarWidth)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // 保持 ref 与 state 同步
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = sidebarWidthRef.current
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth.current + delta))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try {
        localStorage.setItem(STORAGE_KEY, String(sidebarWidthRef.current))
      } catch { /* 忽略 */ }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const isIcon = mode === 'icon'

  const userInitial = user?.wechat_nickname
    ? user.wechat_nickname.charAt(0)
    : (user?.phone ? user.phone.slice(-2) : 'U')

  const userName = user?.wechat_nickname || user?.phone || user?.email || '用户'

  // ── 图标模式 (紧凑) ──
  if (isIcon) {
    return (
      <>
        <aside className={`sidebar icon-mode`}>
        <button
          type="button"
          className="sidebar-icon-btn sidebar-icon-toggle"
          onClick={onToggleMode}
          aria-label="展开侧边栏"
          title="展开侧边栏"
        >
          <span className="sidebar-toggle-icon sidebar-toggle-icon--brand" aria-hidden="true">
            <Icon name="brand" size={22} />
          </span>
          <span className="sidebar-toggle-icon sidebar-toggle-icon--hamburger" aria-hidden="true">
            <Icon name="menu" size={20} />
          </span>
        </button>
        <nav className="sidebar-icon-nav">
          {/* 新会话 */}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => {
              resetSession()
              if (onBackToChat) onBackToChat()
            }}
            disabled={loading}
            title="新会话"
          >
            <Icon name="plus" size={22} />
          </button>

          {/* 专题 */}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => { onToggleMode(); setActiveTab('topics') }}
            title="专题"
          >
            <Icon name="grid" size={22} />
          </button>

          {/* 知识库 */}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => onSelectFeature('知识库')}
            title="知识库"
          >
            <Icon name="book" size={22} />
          </button>

          {/* 档案库 */}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => onSelectFeature('档案库')}
            title="档案库"
          >
            <Icon name="folder" size={22} />
          </button>

          {/* 设置 */}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => { onToggleMode(); setSettingsExpanded(true) }}
            title="设置"
          >
            <Icon name="settings" size={22} />
          </button>
        </nav>

        {/* 底部: 用户头像 / 登录入口 */}
        <div className="sidebar-icon-footer">
          {isLoggedIn ? (
            <button
              type="button"
              className="sidebar-icon-avatar"
              title={userName}
              onClick={() => { onToggleMode() }}
            >
              {userInitial}
            </button>
          ) : (
            <button
              type="button"
              className="sidebar-icon-btn sidebar-icon-login"
              onClick={() => openLoginModal()}
              title="登录"
            >
              <Icon name="user" size={22} />
            </button>
          )}
        </div>
      </aside>
      </>
    )
  }

  // ── 完整模式 (展开) ──
  return (
    <>
      <aside className="sidebar full-mode" style={{ width: sidebarWidth }}>
      {/* 拖拽手柄 */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        aria-hidden="true"
      />
      {/* 顶部: 收起按钮 + 新会话 */}
      <div className="sidebar-top">
        <button type="button" className="icon-btn" onClick={onToggleMode} aria-label="收起侧边栏">
          <Icon name="menu" size={20} />
        </button>
        <button
          type="button"
          className="btn-new-chat"
          onClick={() => {
            resetSession()
            if (onBackToChat) onBackToChat()
          }}
          disabled={loading}
          title="发起新对话"
        >
          <Icon name="plus" size={18} />
          <span className="new-chat-label">发起新对话</span>
        </button>
      </div>

      {/* Tab + 内容 (手风琴: 内容直接出现在被点击按钮下方) */}
      <div className="sidebar-accordion">
        {/* 对话 */}
        <div className={`accordion-item${activeTab === 'sessions' ? ' open' : ''}`}>
          <button
            type="button"
            className={`sidebar-tab${activeTab === 'sessions' ? ' active' : ''}`}
            onClick={() => {
            if (onBackToChat && activeTab === 'sessions') {
              onBackToChat()
            } else if (activeTab === 'sessions') {
              setActiveTab('')
            } else {
              setActiveTab('sessions')
            }
          }}
            aria-expanded={activeTab === 'sessions'}
          >
            <Icon name="chat" size={14} />
            <span>对话</span>
            <Icon name="chevron-down" size={14} className="sidebar-chevron" />
          </button>
          <div className="accordion-panel">
            <div className="session-list">
              {/* 搜索框 */}
              <div className="session-search-wrapper">
                <Icon name="search" size={14} className="session-search-icon" />
                <input
                  type="text"
                  className="session-search-input"
                  placeholder="搜索会话..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="session-search-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="清除搜索"
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>

              {/* 清除全部按钮 */}
              {sessions.length > 0 && (
                <button
                  type="button"
                  className="session-clear-all"
                  onClick={() => setConfirmClearAll(true)}
                  disabled={clearingAll}
                >
                  {clearingAll ? '清除中...' : '清除全部'}
                </button>
              )}

              {/* 会话列表 */}
              {sessions.map((s) => {
                const isActive = s.id === sessionId
                const isExpanded = expandedSession === s.id
                const displayTitle = s.title || s.preview || s.id.substring(0, 10)
                const previewText = s.preview || ''
                const updatedTime = s.updated_at || s.created_at
                const updatedDisplay = updatedTime
                  ? new Date(updatedTime).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''

                return (
                  <div
                    key={s.id}
                    className={`session-item ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`}
                  >
                    <button
                      type="button"
                      className="session-btn"
                      onClick={() => {
                        switchSession(s)
                        setExpandedSession(isExpanded ? null : s.id)
                      }}
                      disabled={loading}
                    >
                      <Icon name="chat" size={16} />
                      <span className="session-text" title={displayTitle}>{displayTitle}</span>
                    </button>

                    {/* 展开后显示会话元信息 */}
                    {isExpanded && (
                      <div className="session-meta">
                        <span className="session-meta-time" title={updatedTime}>{updatedDisplay}</span>
                        <span className="session-meta-count">{s.message_count} 条消息</span>
                        {previewText && previewText !== displayTitle && (
                          <span className="session-meta-preview" title={previewText}>
                            {previewText}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="session-actions">
                      <button
                        type="button"
                        className="session-delete"
                        onClick={() => setDeleteTarget(s.id)}
                        disabled={loading}
                        aria-label="删除"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* 加载更多 */}
              {sessionsHasMore && (
                <button
                  type="button"
                  className="session-load-more"
                  onClick={loadMoreSessions}
                  disabled={sessionsLoading}
                >
                  {sessionsLoading ? '加载中...' : '加载更多'}
                </button>
              )}

              {/* 空状态 */}
              {sessions.length === 0 && !sessionsLoading && (
                <p className="session-empty">
                  {searchQuery ? `未找到包含 "${searchQuery}" 的会话` : '暂无对话记录'}
                </p>
              )}
              {sessionsLoading && sessions.length === 0 && (
                <p className="session-empty">加载中...</p>
              )}
            </div>
          </div>
        </div>

        {/* 专题 */}
        <div className={`accordion-item${activeTab === 'topics' ? ' open' : ''}`}>
          <button
            type="button"
            className={`sidebar-tab${activeTab === 'topics' ? ' active' : ''}`}
            onClick={() => {
            if (activeTab === 'topics') {
              setActiveTab('')
            } else {
              setActiveTab('topics')
            }
          }}
            aria-expanded={activeTab === 'topics'}
          >
            <Icon name="grid" size={14} />
            <span>专题</span>
            <Icon name="chevron-down" size={14} className="sidebar-chevron" />
          </button>
          <div className="accordion-panel">
            <div className="topics-list">
              {SUGGESTIONS.map((s) => {
                const key = s.label as FeatureKey
                return (
                  <button
                    key={key}
                    type="button"
                    className="topic-item"
                    onClick={() => onSelectFeature(key)}
                    title={key}
                  >
                    <span className={`topic-icon theme-${FEATURE_THEME[key] || 'default'}`}>
                      {FEATURE_ICONS[key]}
                    </span>
                    <span className="topic-text">{key}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 知识库 */}
        <button
          type="button"
          className="sidebar-tab"
          onClick={() => onSelectFeature('知识库')}
        >
          <Icon name="book" size={14} />
          <span>知识库</span>
        </button>

        {/* 档案库 */}
        <button
          type="button"
          className="sidebar-tab"
          onClick={() => onSelectFeature('档案库')}
        >
          <Icon name="folder" size={14} />
          <span>档案库</span>
        </button>
      </div>

      {/* 底部: 设置 + 用户信息 */}
      <div className="sidebar-footer">
        {/* 设置 - 主题切换 */}
        <div className="sidebar-settings-group">
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={() => setSettingsExpanded(!settingsExpanded)}
          >
            <Icon name="settings" size={18} />
            <span>设置</span>
            <Icon name="chevron-down" size={14} className={`sidebar-chevron${settingsExpanded ? ' open' : ''}`} />
          </button>

          {settingsExpanded && (
            <div className="settings-submenu">
              {/* 主题 — 一级项，深色/浅色作为二级子菜单 */}
              <button
                type="button"
                className="settings-section-btn"
                onClick={() => setThemeExpanded(!themeExpanded)}
              >
                <Icon name="palette" size={16} />
                <span>主题</span>
                <Icon name="chevron-down" size={14} className={`sidebar-chevron${themeExpanded ? ' open' : ''}`} />
              </button>

              {themeExpanded && (
                <div className="settings-theme-submenu">
                  <button
                    type="button"
                    className={`settings-theme-btn${theme === 'dark' ? ' active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <Icon name="moon" size={16} />
                    <span>深色模式</span>
                    {theme === 'dark' && (
                      <Icon name="check" size={14} strokeWidth={2.5} className="settings-check" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`settings-theme-btn${theme === 'light' ? ' active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    <Icon name="sun" size={16} />
                    <span>浅色模式</span>
                    {theme === 'light' && (
                      <Icon name="check" size={14} strokeWidth={2.5} className="settings-check" />
                    )}
                  </button>
                </div>
              )}

              {/* 系统管理入口 — 仅管理员可见，基于角色访问控制 */}
              {user?.is_admin && (
                <>
                  <div className="settings-submenu-divider" />
                  <button
                    type="button"
                    className="settings-admin-btn"
                    onClick={() => onSelectFeature('系统管理')}
                    title="系统管理"
                  >
                    <Icon name="shield" size={16} />
                    <span>系统管理</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 用户信息 */}
        {isLoggedIn ? (
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar">
              {userInitial}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{userName}</span>
            </div>
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={logout}
              title="退出登录"
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="sidebar-login-btn"
            onClick={() => openLoginModal()}
          >
            登录/注册
          </button>
        )}
      </div>
    </aside>

    {/* 清除全部确认弹窗 */}
    <ConfirmDialog
      open={confirmClearAll}
      title="清除全部对话"
      message="确定要清除全部对话历史吗？此操作不可撤销，清除后无法恢复。"
      confirmText="清除"
      cancelText="取消"
      danger
      loading={clearingAll}
      onConfirm={async () => {
        setConfirmClearAll(false)
        const ok = await clearAllSessions()
        if (ok) {
          resetSession()
        } else {
          setActionError('清除失败，请稍后重试')
        }
      }}
      onCancel={() => setConfirmClearAll(false)}
    />

    {/* 删除会话确认弹窗 */}
    <ConfirmDialog
      open={deleteTarget !== null}
      title="删除对话"
      message="确定要删除这条对话吗？删除后无法恢复。"
      confirmText="删除"
      danger
      onConfirm={() => {
        if (deleteTarget) {
          deleteSession(deleteTarget)
        }
        setDeleteTarget(null)
      }}
      onCancel={() => setDeleteTarget(null)}
    />

    {/* 操作失败提示 */}
    {actionError && (
      <div className="session-action-error" role="alert">
        {actionError}
        <button
          type="button"
          className="session-action-error-close"
          onClick={() => setActionError('')}
          aria-label="关闭提示"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    )}
    </>
  )
}