import { useState, useEffect, useCallback } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import LoginPrompt from './LoginPrompt'

// ── 类型定义 ──
interface ChartInfoItem {
  id: number
  user_id: number
  archive_id: number | null
  title: string
  chart_type: string
  chart_name: string | null
  selected_dayun: string | null
  selected_liunian: string | null
  selected_liuyue: string | null
  selected_liuri: string | null
  selected_liushi: string | null
  has_focus: boolean
  info_content?: string
  created_at: string
  updated_at: string
}

interface ChartInfoListResponse {
  total: number
  page: number
  page_size: number
  items: ChartInfoItem[]
}

// ── 获取 Token ──
function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

interface ChartInfoArchivePanelProps {
  /** 指定档案ID时，仅展示该档案的排盘信息；不传则展示当前用户全部 */
  archiveId?: number
  /** 档案名称，用于在标题中展示筛选来源 */
  archiveName?: string
  /** 嵌入模式：隐藏 header/搜索/筛选器，仅展示列表和详情 */
  embedded?: boolean
}

// ── 维度标签配置 ──
const DIMENSION_CONFIG: { key: keyof Pick<ChartInfoItem, 'selected_dayun' | 'selected_liunian' | 'selected_liuyue' | 'selected_liuri' | 'selected_liushi'>; label: string; cls: string }[] = [
  { key: 'selected_dayun', label: '大运', cls: 'dayun' },
  { key: 'selected_liunian', label: '流年', cls: 'liunian' },
  { key: 'selected_liuyue', label: '流月', cls: 'liuyue' },
  { key: 'selected_liuri', label: '流日', cls: 'liuri' },
  { key: 'selected_liushi', label: '流时', cls: 'liushi' },
]

export default function ChartInfoArchivePanel({ archiveId, archiveName, embedded }: ChartInfoArchivePanelProps) {
  // ── 排盘类型显示标签 → 数据库 chart_type 值映射 ──
  // 注：六爻占卜和梅花易数不在档案库中保存排盘信息，故不列入
  const CHART_TYPE_LABELS: Record<string, string> = {
    '四柱八字': '八字',
    '紫微斗数': '紫微',
    '麻衣神相': '麻衣神相',
    '黄历择吉': '黄历择吉',
  }
  // 反向映射：chart_type 值 → 显示标签
  const CHART_TYPE_REVERSE: Record<string, string> = Object.fromEntries(
    Object.entries(CHART_TYPE_LABELS).map(([k, v]) => [v, k])
  )
  const CHART_TYPE_DISPLAY_LABELS = Object.keys(CHART_TYPE_LABELS)

  const { isLoggedIn } = useAuth()
  const [records, setRecords] = useState<ChartInfoItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [chartTypeFilter, setChartTypeFilter] = useState<string>('')
  const [focusFilter, setFocusFilter] = useState<'' | 'true' | 'false'>('')
  const [selectedRecord, setSelectedRecord] = useState<ChartInfoItem | null>(null)
  const [detailContent, setDetailContent] = useState<string>('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ChartInfoItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const PAGE_SIZE = 20

  // ── 加载列表 ──
  const fetchRecords = useCallback(async (kw?: string, ct?: string, ff?: string, p?: number) => {
    const token = getToken()
    if (!token) {
      setRecords([])
      setTotal(0)
      return
    }

    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.append('page', String(p || page))
      params.append('page_size', String(PAGE_SIZE))
      if (kw) params.append('keyword', kw)
      if (ct) params.append('chart_type', CHART_TYPE_LABELS[ct] || ct)
      if (ff === 'true') params.append('has_focus', 'true')
      if (ff === 'false') params.append('has_focus', 'false')
      if (archiveId) params.append('archive_id', String(archiveId))

      const res = await fetch(`${API_BASE}/chart-infos/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        throw new Error('登录已过期，请重新登录后查看')
      }
      if (!res.ok) throw new Error(`加载失败 (HTTP ${res.status})`)
      const data: ChartInfoListResponse = await res.json()
      setRecords(data.items)
      setTotal(data.total)
    } catch (e: unknown) {
      setRecords([])
      setTotal(0)
      setError(getErrorMessage(e) || '加载排盘信息失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }, [page, archiveId])

  useEffect(() => {
    if (isLoggedIn) {
      setPage(1)
      fetchRecords(searchKeyword, chartTypeFilter, focusFilter, 1)
    }
  }, [isLoggedIn, page, chartTypeFilter, focusFilter, fetchRecords, archiveId])

  // ── 搜索 ──
  const handleSearch = () => {
    setSearchKeyword(searchInput)
    setPage(1)
    fetchRecords(searchInput, chartTypeFilter, focusFilter, 1)
  }

  // ── 加载详情 ──
  const fetchDetail = useCallback(async (recordId: number) => {
    const token = getToken()
    if (!token) return

    setDetailLoading(true)
    try {
      const res = await fetch(`${API_BASE}/chart-infos/${recordId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`加载详情失败 (HTTP ${res.status})`)
      const data: ChartInfoItem = await res.json()
      setDetailContent(data.info_content || '')
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '加载详情失败')
      setDetailContent('')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // ── 点击查看详情 ──
  const handleViewDetail = (record: ChartInfoItem) => {
    setSelectedRecord(record)
    setDetailContent('')
    fetchDetail(record.id)
  }

  // ── 删除 ──
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条排盘信息吗？')) return
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/chart-infos/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        throw new Error('登录已过期，请重新登录后再操作')
      }
      if (res.status === 404) {
        throw new Error('排盘信息不存在或已被删除')
      }
      if (!res.ok) throw new Error(`删除失败 (HTTP ${res.status})`)

      setRecords((prev) => prev.filter((r) => r.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      if (selectedRecord?.id === id) setSelectedRecord(null)
      fetchRecords(searchKeyword, chartTypeFilter, focusFilter, page)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '删除失败，请检查网络连接')
    }
  }

  // ── 更新 ──
  const handleUpdate = async () => {
    if (!editingRecord) return
    const token = getToken()
    if (!token) return

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/chart-infos/${editingRecord.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle,
          info_content: editContent,
        }),
      })
      if (!res.ok) throw new Error('更新失败')
      const updated: ChartInfoItem = await res.json()
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      setEditingRecord(null)
      setSelectedRecord({ ...editingRecord, ...updated })
      setDetailContent(updated.info_content || '')
    } catch {
      setError('更新失败')
    } finally {
      setSaving(false)
    }
  }

  // ── 未登录 ──
  if (!isLoggedIn) {
    return (
      <div className="report-archive-panel">
        <LoginPrompt />
      </div>
    )
  }

  // ── 详情视图 ──
  if (selectedRecord && !editingRecord) {
    return (
      <div className="report-archive-panel">
        <div className="report-detail-header">
          <button type="button" className="report-back-btn" onClick={() => setSelectedRecord(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回列表
          </button>
          <div className="report-detail-actions">
            <button
              type="button"
              className="report-action-btn"
              onClick={() => {
                setEditingRecord(selectedRecord)
                setEditTitle(selectedRecord.title)
                setEditContent(detailContent || '')
              }}
            >
              编辑
            </button>
            <button type="button" className="report-action-btn danger" onClick={() => handleDelete(selectedRecord.id)}>
              删除
            </button>
          </div>
        </div>
        <div className="report-detail-content">
          <h2 className="report-detail-title">{selectedRecord.title}</h2>
          <div className="report-detail-meta">
            <span>{CHART_TYPE_REVERSE[selectedRecord.chart_type] || selectedRecord.chart_type}</span>
            {selectedRecord.chart_name && <span>· {selectedRecord.chart_name}</span>}
            <span>· {new Date(selectedRecord.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          </div>
          {/* 时间维度标签 */}
          <div className="chart-info-dimensions">
            {DIMENSION_CONFIG.map(({ key, label, cls }) => {
              const val = selectedRecord[key]
              if (!val) return null
              return (
                <span key={key} className={`chart-info-dimension-tag ${cls}`}>
                  {label}：{val}
                </span>
              )
            })}
            {!selectedRecord.has_focus && (
              <span className="chart-info-dimension-tag natal">本命盘（无运限焦点）</span>
            )}
          </div>
          {detailLoading ? (
            <div className="report-archive-loading">加载中...</div>
          ) : (
            <div className="report-markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {detailContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 编辑视图 ──
  if (editingRecord) {
    return (
      <div className="report-archive-panel">
        <div className="report-detail-header">
          <button type="button" className="report-back-btn" onClick={() => setEditingRecord(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            取消编辑
          </button>
          <button
            type="button"
            className="report-action-btn primary"
            onClick={handleUpdate}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
        <div className="report-edit-form">
          <label className="report-edit-label">标题</label>
          <input
            type="text"
            className="report-edit-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <label className="report-edit-label">内容</label>
          <textarea
            className="report-edit-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
          />
        </div>
      </div>
    )
  }

  // ── 列表视图 ──
  return (
    <div className="report-archive-panel">
      {!embedded && (
        <div className="report-archive-header">
          <h3>
            排盘信息
            {archiveName && <span className="report-archive-filter-source">· {archiveName}</span>}
          </h3>
          <span className="report-archive-count">{total} 条记录</span>
        </div>
      )}

      {error && (
        <div className="report-error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {!embedded && (
        <div className="report-archive-search">
          <div className="report-archive-search-input">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜索标题或姓名"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button type="button" className="report-archive-search-btn" onClick={handleSearch}>
            查询
          </button>
        </div>
      )}

      {!embedded && (
        <div className="report-archive-filters">
          {['', ...CHART_TYPE_DISPLAY_LABELS].map((ct) => (
          <button
            key={ct || 'all'}
            type="button"
            className={`report-filter-tag${chartTypeFilter === ct ? ' active' : ''}`}
            onClick={() => {
              setChartTypeFilter(ct)
              setPage(1)
              fetchRecords(searchKeyword, ct, focusFilter, 1)
            }}
          >
            {ct || '全部'}
          </button>
        ))}
        <span className="report-filter-divider" />
        {[
          { v: '' as const, label: '全部' },
          { v: 'true' as const, label: '含运限' },
          { v: 'false' as const, label: '本命盘' },
        ].map((f) => (
          <button
            key={f.v || 'all-focus'}
            type="button"
            className={`report-filter-tag${focusFilter === f.v ? ' active' : ''}`}
            onClick={() => {
              setFocusFilter(f.v)
              setPage(1)
              fetchRecords(searchKeyword, chartTypeFilter, f.v, 1)
            }}
          >
            {f.label}
          </button>
        ))}
        </div>
      )}

      {/* 嵌入模式：按排盘类型分类切换 */}
      {embedded && (
        <div className="ak-sub-tabs">
          <button
            type="button"
            className={`ak-sub-tab${chartTypeFilter === '' ? ' active' : ''}`}
            onClick={() => {
              setChartTypeFilter('')
              setPage(1)
              fetchRecords(searchKeyword, '', focusFilter, 1)
            }}
          >
            全部
          </button>
          {CHART_TYPE_DISPLAY_LABELS.map((ct) => (
            <button
              key={ct}
              type="button"
              className={`ak-sub-tab${chartTypeFilter === ct ? ' active' : ''}`}
              onClick={() => {
                setChartTypeFilter(ct)
                setPage(1)
                fetchRecords(searchKeyword, ct, focusFilter, 1)
              }}
            >
              {ct}
            </button>
          ))}
        </div>
      )}

      <div className="report-archive-list">
        {loading ? (
          <div className="report-archive-loading">加载中...</div>
        ) : records.length === 0 ? (
          <div className="report-archive-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p>{archiveId ? `该档案暂无${chartTypeFilter || ''}排盘信息` : '暂无排盘信息'}</p>
            <span>{archiveId ? '在排盘页面保存排盘信息后，即可在此查看' : '在排盘页面打开排盘信息弹窗并点击保存后，即可在此查看'}</span>
          </div>
        ) : (
          records.map((item) => (
            <div
              key={item.id}
              className="report-archive-item"
              onClick={() => handleViewDetail(item)}
            >
              <div className="report-archive-item-header">
                <span className={`report-chart-type-tag ${item.chart_type === '八字' ? 'bazi' : item.chart_type === '紫微' ? 'ziwei' : item.chart_type === '六爻' ? 'liuyao' : item.chart_type === '梅花易数' ? 'meihua' : item.chart_type === '黄历择吉' ? 'huangli' : 'physiognomy'}`}>
                  {CHART_TYPE_REVERSE[item.chart_type] || item.chart_type}
                </span>
                <span className="report-archive-item-title">{item.title}</span>
              </div>
              {/* 时间维度标签行 */}
              <div className="chart-info-dimensions">
                {DIMENSION_CONFIG.map(({ key, label, cls }) => {
                  const val = item[key]
                  if (!val) return null
                  return (
                    <span key={key} className={`chart-info-dimension-tag ${cls}`}>
                      {label}：{val}
                    </span>
                  )
                })}
                {!item.has_focus && (
                  <span className="chart-info-dimension-tag natal">本命盘</span>
                )}
              </div>
              <div className="report-archive-item-meta">
                {item.chart_name && <span>{item.chart_name}</span>}
                <span>· {new Date(item.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              </div>
              <div className="report-archive-item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="report-item-action-btn danger"
                  onClick={() => handleDelete(item.id)}
                  title="删除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {total > records.length && (
        <div className="report-archive-pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>{page} / {Math.ceil(total / PAGE_SIZE)}</span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / PAGE_SIZE)}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
