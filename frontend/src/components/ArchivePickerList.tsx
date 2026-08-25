/**
 * 档案选择列表
 *
 * 用于在排盘表单（八字/紫微/麻衣神相）中从档案库挑选命主档案。
 * 替代原 ArchivePanel 在 ArchivePickerModal 中的角色，仅保留"选择档案"的核心交互，
 * 去除与报告 Tab 等无关功能，采用 ak-* 设计体系样式。
 *
 * 复用 useArchive 上下文管理数据，支持搜索、分组筛选、分页。
 */
import { useState, useEffect, useCallback } from 'react'
import { useArchive, type ArchiveItem } from '../context/ArchiveContext'
import { formatArchiveBirth } from '../utils/formatBirth'

interface ArchivePickerListProps {
  /** 选中档案回调 */
  onSelectArchive: (archive: ArchiveItem) => void
}

const PAGE_SIZE = 20
const GROUPS = ['全部', '家人', '朋友', '客户', '其他']

export default function ArchivePickerList({ onSelectArchive }: ArchivePickerListProps) {
  const { archives, total, loading, fetchArchives } = useArchive()
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [activeGroup, setActiveGroup] = useState('全部')
  const [page, setPage] = useState(1)

  // 初次加载
  // 使用 cancelled flag 替代 AbortController，避免 React StrictMode 双调用 effect
  // 时 cleanup abort 引发的 net::ERR_ABORTED 噪音
  useEffect(() => {
    let cancelled = false
    fetchArchives(undefined, undefined, 1, PAGE_SIZE).then(() => {
      // 请求完成后检查是否已被取消（StrictMode 第二次调用会覆盖结果，无副作用）
      if (cancelled) return
    })
    return () => { cancelled = true }
  }, [fetchArchives])

  const handleSearch = useCallback(() => {
    setKeyword(searchInput.trim())
    setPage(1)
    const groupVal = activeGroup === '全部' ? undefined : activeGroup
    fetchArchives(searchInput.trim() || undefined, groupVal, 1, PAGE_SIZE)
  }, [searchInput, activeGroup, fetchArchives])

  const handleGroupChange = useCallback((group: string) => {
    setActiveGroup(group)
    setPage(1)
    const groupVal = group === '全部' ? undefined : group
    fetchArchives(keyword || undefined, groupVal, 1, PAGE_SIZE)
  }, [keyword, fetchArchives])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
    const groupVal = activeGroup === '全部' ? undefined : activeGroup
    fetchArchives(keyword || undefined, groupVal, newPage, PAGE_SIZE)
  }, [activeGroup, keyword, fetchArchives])

  const handleReset = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setActiveGroup('全部')
    setPage(1)
    fetchArchives(undefined, undefined, 1, PAGE_SIZE)
  }, [fetchArchives])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="ak-picker-list">
      {/* 搜索栏 */}
      <div className="ak-picker-search">
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
              onClick={() => { setSearchInput(''); setKeyword(''); setPage(1); fetchArchives(undefined, activeGroup === '全部' ? undefined : activeGroup, 1, PAGE_SIZE) }}
              aria-label="清除搜索"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button type="button" className="ak-picker-search-btn" onClick={handleSearch}>
          查询
        </button>
      </div>

      {/* 分组筛选 */}
      <div className="ak-picker-filters">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            className={`ak-list-filter-tag${activeGroup === g ? ' active' : ''}`}
            onClick={() => handleGroupChange(g)}
          >
            {g}
          </button>
        ))}
        {(keyword || activeGroup !== '全部') && (
          <button type="button" className="ak-list-reset-btn" onClick={handleReset} style={{ marginLeft: 'auto' }}>
            清除筛选
          </button>
        )}
      </div>

      {/* 列表 */}
      <div className="ak-picker-container">
        {loading ? (
          <div className="ak-list-loading">加载中...</div>
        ) : archives.length === 0 ? (
          <div className="ak-list-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7h-7l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
            </svg>
            <p>暂无档案</p>
            <span>在档案库中新增档案后即可在此选择</span>
          </div>
        ) : (
          archives.map((item) => (
            <div
              key={item.id}
              className="ak-picker-item"
              onClick={() => onSelectArchive(item)}
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
              </div>
            </div>
          ))
        )}
      </div>

      {/* 分页 + 总数 */}
      {total > PAGE_SIZE && (
        <div className="ak-list-pagination">
          <button
            type="button"
            className="ak-page-btn"
            disabled={page <= 1}
            onClick={() => handlePageChange(Math.max(1, page - 1))}
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
                onClick={() => handlePageChange(p)}
              >
                {p}
              </button>
            )
          })}
          <button
            type="button"
            className="ak-page-btn"
            disabled={page >= totalPages}
            onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
          >
            下一页
          </button>
        </div>
      )}

      {archives.length > 0 && (
        <div className="ak-picker-footer">
          <span className="ak-list-total">共 {total} 份档案</span>
        </div>
      )}
    </div>
  )
}
