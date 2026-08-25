import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import './LoginPrompt.css'

interface LoginPromptProps {
  /** 提供时渲染"取消"按钮并以此回调；不提供时仅显示"登录"按钮 */
  onCancel?: () => void
  /** 外层附加类名，便于嵌入不同容器 */
  className?: string
}

/**
 * 统一登录提示组件
 * 用于内容锁定区域：锁图标 + 标准文案"请先登录以继续操作" + 登录按钮 + 整卡可点击触发登录弹窗
 */
export default function LoginPrompt({ onCancel, className }: LoginPromptProps) {
  const { openLoginModal } = useAuth()

  const handleTrigger = useCallback(() => {
    openLoginModal()
  }, [openLoginModal])

  const handleLoginClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    openLoginModal()
  }, [openLoginModal])

  const handleCancelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onCancel?.()
  }, [onCancel])

  return (
    <div
      className={`login-prompt-card${className ? ` ${className}` : ''}`}
      onClick={handleTrigger}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleTrigger()
        }
      }}
    >
      <svg
        className="login-prompt-icon"
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <p className="login-prompt-text">请先登录以继续操作</p>
      <div className="login-prompt-actions">
        <button
          type="button"
          className="login-prompt-btn login-prompt-btn-primary"
          onClick={handleLoginClick}
        >
          登录
        </button>
        {onCancel && (
          <button
            type="button"
            className="login-prompt-btn login-prompt-btn-secondary"
            onClick={handleCancelClick}
          >
            取消
          </button>
        )}
      </div>
    </div>
  )
}
