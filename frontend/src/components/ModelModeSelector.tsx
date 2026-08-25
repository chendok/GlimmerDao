/**
 * 大模型模式选择器（快速 / 深度思考）
 *
 * 与对话框 InputBar 中的模型选择器保持完全一致的交互逻辑、视觉样式和动画效果。
 * 复用同一套 CSS 类名（.model-mode-wrapper / .model-mode-btn / .model-mode-menu / .model-mode-option），
 * 样式定义在 App.css 中，无需额外样式。
 */
import { useState, useRef, useEffect } from 'react'
import type { ModelMode } from '../types'

interface ModelModeSelectorProps {
  /** 当前选中的模式 */
  modelMode: ModelMode
  /** 模式切换回调 */
  onModeChange: (mode: ModelMode) => void
  /** 是否禁用 */
  disabled?: boolean
}

export default function ModelModeSelector({
  modelMode,
  onModeChange,
  disabled = false,
}: ModelModeSelectorProps) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单（与 InputBar 逻辑一致）
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  return (
    <div className="model-mode-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`model-mode-btn ${modelMode}`}
        onClick={() => setShowMenu((p) => !p)}
        disabled={disabled}
        title={modelMode === 'fast' ? '快速模式' : '深度思考模式'}
      >
        <span className="model-mode-label">
          {modelMode === 'fast' ? '⚡ 快速' : '🧠 深度思考'}
        </span>
        <svg
          className={`model-mode-arrow${showMenu ? ' expanded' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {showMenu && (
        <div className="model-mode-menu">
          <button
            type="button"
            className={`model-mode-option${modelMode === 'fast' ? ' active' : ''}`}
            onClick={() => {
              onModeChange('fast')
              setShowMenu(false)
            }}
          >
            <span>⚡ 快速模式</span>
            <span className="model-mode-desc">响应更快</span>
          </button>
          <button
            type="button"
            className={`model-mode-option${modelMode === 'think' ? ' active' : ''}`}
            onClick={() => {
              onModeChange('think')
              setShowMenu(false)
            }}
          >
            <span>🧠 深度思考</span>
            <span className="model-mode-desc">推理更深入</span>
          </button>
        </div>
      )}
    </div>
  )
}
