import { useEffect, useRef } from 'react'
import Icon from './Icon'

interface ConfirmDialogProps {
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
 * 通用确认弹窗 — 使用项目全局 CSS 变量，不依赖特定模块样式
 *
 * 支持 Esc 取消、回车确认、点击遮罩取消
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => confirmRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
      if (e.key === 'Enter' && !loading) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, loading, onCancel, onConfirm])

  if (!open) return null

  return (
    <div className="confirm-dialog-overlay" onClick={() => !loading && onCancel()}>
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="confirm-dialog-header">
          <h3 id="confirm-dialog-title">{title}</h3>
          {!loading && (
            <button
              type="button"
              className="confirm-dialog-close"
              onClick={onCancel}
              aria-label="关闭"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <div className="confirm-dialog-body">
          {danger && (
            <div className="confirm-dialog-icon danger">
              <Icon name="warning" size={28} />
            </div>
          )}
          <p id="confirm-dialog-message" className="confirm-dialog-message">{message}</p>
        </div>

        <div className="confirm-dialog-footer">
          <button
            type="button"
            className="confirm-dialog-btn cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`confirm-dialog-btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
