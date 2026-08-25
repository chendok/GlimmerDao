import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 知识库通用确认弹窗 — 复用 .kb-modal 样式体系
 */
export default function KbConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // 打开时自动聚焦确认按钮，支持回车确认 / Esc 取消
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => confirmRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div className="kb-modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        className="kb-modal kb-confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="kb-modal-header">
          <h3>{title}</h3>
          {!loading && (
            <button className="kb-btn kb-btn-sm" onClick={onCancel} aria-label="关闭">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="kb-modal-body">
          <div className="kb-confirm-content">
            {danger && (
              <div className="kb-confirm-icon kb-confirm-icon-danger">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            )}
            <p className="kb-confirm-message">{message}</p>
          </div>
        </div>

        <div className="kb-modal-footer">
          <button className="kb-btn kb-btn-sm" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={`kb-btn kb-btn-sm ${danger ? 'kb-btn-danger' : 'kb-btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="kb-spinner" />
                <span style={{ marginLeft: 4 }}>处理中</span>
              </>
            ) : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
