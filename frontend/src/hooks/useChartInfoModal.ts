import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * 排盘信息弹窗共享 Hook
 *
 * 封装 BaziInfoModal / ZiweiInfoModal / DivinationInfoModal / PhysiognomyInfoModal
 * 四个弹窗**完全相同**的通用逻辑：
 *   - 编辑/预览切换（editMode）
 *   - 复制到剪贴板（handleCopy，含降级方案）
 *   - 点击遮罩关闭（handleOverlayClick）
 *   - ESC 键关闭
 *   - copied / saving / saveSuccess / saveError 状态
 *
 * 各组件差异较大的「保存档案」逻辑（API 端点、请求体、错误处理各异）保留在各组件内，
 * 由调用方自行实现 handleSave，避免过度抽象。
 */

export interface ChartInfoModalOptions {
  /** 预览模式的展示文本（markdown 或 JSON） */
  previewText: string
  /** 关闭弹窗回调 */
  onClose: () => void
}

export function useChartInfoModal({ previewText, onClose }: ChartInfoModalOptions) {
  const [copied, setCopied] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editText, setEditText] = useState(previewText)
  const overlayRef = useRef<HTMLDivElement>(null)

  // 预览文本变化时同步到编辑区
  useEffect(() => {
    setEditText(previewText)
  }, [previewText])

  // 编辑/预览切换
  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  // 复制到剪贴板（含降级方案）
  const handleCopy = useCallback(async () => {
    const textToCopy = editMode ? editText : previewText
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
    } catch {
      // 降级方案：旧浏览器 / 非安全上下文
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (!ok) return
      setCopied(true)
    }
    setTimeout(() => setCopied(false), 2000)
  }, [editMode, editText, previewText])

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 点击遮罩关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose],
  )

  return {
    copied,
    editMode,
    saving,
    setSaving,
    saveSuccess,
    setSaveSuccess,
    saveError,
    setSaveError,
    editText,
    setEditText,
    overlayRef,
    toggleEditMode,
    handleCopy,
    handleOverlayClick,
  }
}
