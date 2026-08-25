/**
 * 档案库左侧列表面板
 *
 * 功能：搜索、分组筛选、排序、分页
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useArchive } from '../context/ArchiveContext'
import { formatArchiveBirth } from '../utils/formatBirth'

interface ArchiveListPanelProps {
  selectedArchiveId: number | null
  onSelect: (id: number) => void
  onAddNew: () => void
}

const PAGE_SIZE = 20
const GROUPS = ['全部', '家人', '朋友', '客户', '其他']

type SortField = 'created_at' | 'name' | 'birth_datetime'

export default function ArchiveListPanel({
  selectedArchiveId,
  onSelect,
  onAddNew,
}: ArchiveListPanelProps) {
  const { archives, total, loading, fetchArchives } = useArchive()
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [activeGroup, setActiveGroup] = useState('全部')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  // 加载数据
  useEffect(() => {
    const filterValue = activeGroup === '全部' ? undefined : activeGroup
    fetchArchives(keyword || undefined, filterValue, page, PAGE_SIZE)
  }, [keyword, activeGroup, page, fetchArchives])

  const handleSearch = useCallback(() => {
    setKeyword(searchInput.trim())
    setPage(1)
  }, [searchInput])

  const handleReset = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setActiveGroup('全部')
    setPage(1)
  }, [])

  // 排序
  const sortedArchives = useMemo(() => {
    const sorted = [...archives].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const va = a[sortField] || ''
      const vb = b[sortField] || ''
      return va > vb ? dir : va < vb ? -dir : 0
    })
    return sorted
  }, [archives, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="ak-list-panel">
      {/* 工具栏 */}
      <div className="ak-list-toolbar">
        <div className="ak-list-search">
          <svg className="ak-list-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="搜索姓名/出生地..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {searchInput && (
            <button
              type="button"
              className="ak-list-search-clear"
              onClick={() => { setSearchInput(''); setKeyword(''); setPage(1) }}
              aria-label="清除搜索"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button type="button" className="ak-list-add-btn" onClick={onAddNew} title="新增档案">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* 分组筛选 + 排序 */}
      <div className="ak-list-filters">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            className={`ak-list-filter-tag${activeGroup === g ? ' active' : ''}`}
            onClick={() => { setActiveGroup(g); setPage(1) }}
          >
            {g}
          </button>
        ))}
        <div className="ak-list-sort">
          <button type="button" className={`ak-list-sort-btn${sortField === 'name' ? ' active' : ''}`} onClick={() => handleSort('name')}>
            姓名{sortIcon('name')}
          </button>
          <button type="button" className={`ak-list-sort-btn${sortField === 'birth_datetime' ? ' active' : ''}`} onClick={() => handleSort('birth_datetime')}>
            出生{sortIcon('birth_datetime')}
          </button>
          <button type="button" className={`ak-list-sort-btn${sortField === 'created_at' ? ' active' : ''}`} onClick={() => handleSort('created_at')}>
            创建{sortIcon('created_at')}
          </button>
        </div>
      </div>

      {(keyword || activeGroup !== '全部') && (
        <div className="ak-list-reset-bar">
          <button type="button" className="ak-list-reset-btn" onClick={handleReset}>
            清除筛选条件
          </button>
        </div>
      )}

      {/* 列表 */}
      <div className="ak-list-container">
        {loading ? (
          <div className="ak-list-loading">加载中...</div>
        ) : sortedArchives.length === 0 ? (
          <div className="ak-list-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7h-7l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
            </svg>
            <p>暂无档案</p>
            <span>点击右上角 + 号新增档案</span>
          </div>
        ) : (
          sortedArchives.map((item) => (
            <div
              key={item.id}
              className={`ak-list-item${selectedArchiveId === item.id ? ' active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="ak-list-item-row1">
                <span className={`ak-list-item-gender${item.gender === '女' ? ' female' : ''}`}>{item.gender}</span>
                <span className="ak-list-item-name">{item.name}</span>
                {item.group_name && item.group_name !== '全部' && (
                  <span className="ak-list-item-group">{item.group_name}</span>
                )}
              </div>
              <div className="ak-list-item-meta">
                <span>{formatArchiveBirth(item.birth_datetime, item.calendar_type, item.bazi_result)}</span>
                {item.birthplace && <span>· {item.birthplace}</span>}
              </div>
              <div className="ak-list-item-meta">
                <span>{item.calendar_type}</span>
                <span>· 创建于 {item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}</span>
              </div>
              <div className="ak-list-item-stats">
                <span className={`ak-list-stat-tag report${(item.report_count || 0) > 0 ? ' has-data' : ''}`}>
                  报告 {item.report_count || 0}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="ak-list-pagination">
          <button
            type="button"
            className="ak-page-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number
            if (totalPages <= 5) p = i + 1
            else if (page <= 3) p = i + 1
            else if (page >= totalPages - 2) p = totalPages - 4 + i
            else p = page - 2 + i
            return (
              <button
                key={p}
                type="button"
                className={`ak-page-btn${p === page ? ' active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            )
          })}
          <button
            type="button"
            className="ak-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
