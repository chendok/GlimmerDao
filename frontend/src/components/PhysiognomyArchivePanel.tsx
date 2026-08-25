/**
 * 麻衣神相档案库面板
 *
 * 在档案库管理界面的"麻衣神相"页签中展示已保存的面相手相记录。
 * 支持按分析类型筛选、搜索、查看详情、删除。
 */
import { useState, useEffect, useCallback } from 'react'
import { getErrorMessage } from '../utils/helpers'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import LoginPrompt from './LoginPrompt'
import './PhysiognomyForm.css'

// ── 类型定义 ──
interface PhysiognomyItem {
  id: number
  archive_id: number | null
  name: string | null
  gender: string | null
  analysis_type: string
  capture_method: string | null
  thumbnail_url: string | null
  feature_summary: string | null
  analysis_result: string | null
  report_id: string | null
  created_at: string
  updated_at: string
}

interface PhysiognomyDetail extends PhysiognomyItem {
  user_id: number
  image_url: string | null
  annotated_image_url: string | null
  feature_data: Record<string, unknown> | null
  face_confidence: number | null
  hand_confidence: number | null
  image_width: number | null
  image_height: number | null
}

interface ListResponse {
  total: number
  page: number
  page_size: number
  items: PhysiognomyItem[]
}

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

// ── 分析类型配置 ──
const TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  face: { label: '面相', cls: 'face' },
  hand: { label: '手相', cls: 'hand' },
  combined: { label: '综合', cls: 'combined' },
}

interface PhysiognomyArchivePanelProps {
  archiveId?: number
  archiveName?: string
  /** 嵌入模式：隐藏 header/搜索/筛选器，仅展示列表和详情 */
  embedded?: boolean
}

export default function PhysiognomyArchivePanel({ archiveId, archiveName, embedded }: PhysiognomyArchivePanelProps) {
  const { isLoggedIn } = useAuth()
  const [records, setRecords] = useState<PhysiognomyItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<PhysiognomyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const PAGE_SIZE = 20

  // ── 加载列表 ──
  const fetchRecords = useCallback(async (kw?: string, tf?: string, p?: number) => {
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
      if (tf) params.append('analysis_type', tf)
      if (archiveId) params.append('archive_id', String(archiveId))

      const res = await fetch(`${API_BASE}/physiognomy/archives?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        throw new Error('登录已过期，请重新登录后查看')
      }
      if (!res.ok) throw new Error(`加载失败 (HTTP ${res.status})`)
      const data: ListResponse = await res.json()
      setRecords(data.items)
      setTotal(data.total)
    } catch (e: unknown) {
      setRecords([])
      setTotal(0)
      setError(getErrorMessage(e) || '加载麻衣神相记录失败')
    } finally {
      setLoading(false)
    }
  }, [page, archiveId])

  useEffect(() => {
    if (isLoggedIn) {
      setPage(1)
      fetchRecords(searchKeyword, typeFilter, 1)
    }
  }, [isLoggedIn, page, typeFilter, fetchRecords, archiveId])

  const handleSearch = () => {
    setSearchKeyword(searchInput)
    setPage(1)
    fetchRecords(searchInput, typeFilter, 1)
  }

  // ── 加载详情 ──
  const fetchDetail = useCallback(async (recordId: number) => {
    const token = getToken()
    if (!token) return

    setDetailLoading(true)
    try {
      const res = await fetch(`${API_BASE}/physiognomy/archives/${recordId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`加载详情失败 (HTTP ${res.status})`)
      const data: PhysiognomyDetail = await res.json()
      setSelectedRecord(data)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleViewDetail = (record: PhysiognomyItem) => {
    setSelectedRecord(null)
    fetchDetail(record.id)
  }

  // ── 删除 ──
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条麻衣神相记录吗？')) return
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/physiognomy/archives/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        throw new Error('登录已过期，请重新登录后再操作')
      }
      if (!res.ok) throw new Error(`删除失败 (HTTP ${res.status})`)

      setRecords((prev) => prev.filter((r) => r.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      if (selectedRecord?.id === id) setSelectedRecord(null)
      fetchRecords(searchKeyword, typeFilter, page)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '删除失败')
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
  if (selectedRecord) {
    const typeInfo = TYPE_CONFIG[selectedRecord.analysis_type] || { label: selectedRecord.analysis_type, cls: 'unknown' }
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
            <button type="button" className="report-action-btn danger" onClick={() => handleDelete(selectedRecord.id)}>
              删除
            </button>
          </div>
        </div>
        <div className="report-detail-content">
          <h2 className="report-detail-title">
            {selectedRecord.name || '未命名'} 的麻衣神相分析
          </h2>
          <div className="report-detail-meta">
            <span className={`physio-type-tag ${typeInfo.cls}`}>{typeInfo.label}</span>
            {selectedRecord.gender && <span>· {selectedRecord.gender}</span>}
            <span>· {new Date(selectedRecord.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          </div>

          {/* 缩略图 */}
          {selectedRecord.image_url && (
            <div className="physio-detail-image">
              <img src={selectedRecord.image_url} alt="采集图像" />
            </div>
          )}

          {/* 特征摘要 */}
          {selectedRecord.feature_summary && (
            <div className="physio-detail-section">
              <h3>特征摘要</h3>
              <p className="physio-summary-text">{selectedRecord.feature_summary}</p>
            </div>
          )}

          {/* 特征详情 */}
          {selectedRecord.feature_data && (
            <div className="physio-detail-section">
              <h3>特征数据</h3>
              <pre className="physio-feature-json">
                {JSON.stringify(selectedRecord.feature_data, null, 2)}
              </pre>
            </div>
          )}

          {/* 分析结果 */}
          {selectedRecord.analysis_result && (
            <div className="physio-detail-section">
              <h3>即时分析</h3>
              <div className="report-markdown-body">{selectedRecord.analysis_result}</div>
            </div>
          )}

          {detailLoading && <div className="report-archive-loading">加载中...</div>}
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
            麻衣神相
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
              placeholder="搜索姓名"
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
          {['', 'face', 'hand', 'combined'].map((tf) => (
          <button
            key={tf || 'all'}
            type="button"
            className={`report-filter-tag${typeFilter === tf ? ' active' : ''}`}
            onClick={() => {
              setTypeFilter(tf)
              setPage(1)
              fetchRecords(searchKeyword, tf, 1)
            }}
          >
            {tf ? (TYPE_CONFIG[tf]?.label || tf) : '全部'}
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
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            <p>{archiveId ? '该档案暂无麻衣神相记录' : '暂无麻衣神相记录'}</p>
            <span>在麻衣神相功能页面采集并保存后，即可在此查看</span>
          </div>
        ) : (
          records.map((item) => {
            const typeInfo = TYPE_CONFIG[item.analysis_type] || { label: item.analysis_type, cls: 'unknown' }
            return (
              <div
                key={item.id}
                className="report-archive-item physio-archive-item"
                onClick={() => handleViewDetail(item)}
              >
                <div className="report-archive-item-header">
                  <span className={`physio-type-tag ${typeInfo.cls}`}>{typeInfo.label}</span>
                  <span className="report-archive-item-title">{item.name || '未命名'}</span>
                </div>
                {item.thumbnail_url && (
                  <img
                    src={item.thumbnail_url}
                    alt="缩略图"
                    className="physio-thumb"
                  />
                )}
                {item.feature_summary && (
                  <p className="physio-item-summary">{item.feature_summary}</p>
                )}
                <div className="report-archive-item-meta">
                  {item.gender && <span>{item.gender}</span>}
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
            )
          })
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
