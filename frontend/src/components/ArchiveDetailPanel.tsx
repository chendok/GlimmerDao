/**
 * 档案库右侧详情面板
 *
 * 展示选中档案的基本信息与解盘报告
 */
import { useMemo } from 'react'
import { useArchive } from '../context/ArchiveContext'
import { formatArchiveBirth } from '../utils/formatBirth'
import ReportArchivePanel from './ReportArchivePanel'

interface ArchiveDetailPanelProps {
  archiveId: number | null
  onEdit: () => void
  onDelete: () => void
  onBack?: () => void
}

export default function ArchiveDetailPanel({ archiveId, onEdit, onDelete, onBack }: ArchiveDetailPanelProps) {
  const { archives } = useArchive()

  const archive = useMemo(
    () => archives.find((a) => a.id === archiveId) || null,
    [archives, archiveId]
  )

  if (!archiveId || !archive) {
    return (
      <div className="ak-detail-panel">
        <div className="ak-detail-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 7h-7l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
          </svg>
          <p>请从左侧选择档案查看详情</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ak-detail-panel active">
      <div className="ak-detail-header">
        <div className="ak-detail-title-row">
          {onBack && (
            <button type="button" className="ak-detail-back-btn" onClick={onBack} title="返回列表">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <span className={`ak-list-item-gender${archive.gender === '女' ? ' female' : ''}`}>{archive.gender}</span>
          <h2 className="ak-detail-name">{archive.name}</h2>
          {archive.group_name && archive.group_name !== '全部' && (
            <span className="ak-list-item-group">{archive.group_name}</span>
          )}
          <div className="ak-detail-actions">
            <button type="button" className="ak-detail-action-btn" onClick={onEdit} title="编辑">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              编辑
            </button>
            <button type="button" className="ak-detail-action-btn danger" onClick={onDelete} title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              删除
            </button>
          </div>
        </div>
        <div className="ak-detail-info-grid">
          <div className="ak-detail-info-item">
            <span className="ak-detail-info-label">出生时间</span>
            <span className="ak-detail-info-value">{formatArchiveBirth(archive.birth_datetime, archive.calendar_type, archive.bazi_result)}</span>
          </div>
          <div className="ak-detail-info-item">
            <span className="ak-detail-info-label">出生地</span>
            <span className="ak-detail-info-value">{archive.birthplace || '-'}</span>
          </div>
          <div className="ak-detail-info-item">
            <span className="ak-detail-info-label">历法</span>
            <span className="ak-detail-info-value">{archive.calendar_type}</span>
          </div>
          <div className="ak-detail-info-item">
            <span className="ak-detail-info-label">创建时间</span>
            <span className="ak-detail-info-value">{archive.created_at ? new Date(archive.created_at).toLocaleString('zh-CN') : '-'}</span>
          </div>
        </div>
      </div>

      <div className="ak-detail-content">
        <ReportArchivePanel archiveId={archiveId} archiveName={archive.name} embedded />
      </div>
    </div>
  )
}
