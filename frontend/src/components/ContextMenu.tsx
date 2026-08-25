import { useEffect, useRef, useState, useCallback } from 'react'

export interface ContextMenuProps {
  /** 触发点的 clientX */
  x: number
  /** 触发点的 clientY */
  y: number
  /** 关闭菜单回调 */
  onClose: () => void
  /** 目标 textarea DOM 元素 */
  textareaEl: HTMLTextAreaElement | null
  /** 粘贴回调：将剪贴板文本插入光标位置 */
  onPasteText: (text: string) => void
}

interface MenuItem {
  label: string
  shortcut: string
  action: () => void
  disabled: boolean
  separatorAfter?: boolean
}

const MENU_WIDTH = 188
const MENU_ITEM_HEIGHT = 38
const GAP = 6

export default function ContextMenu({
  x,
  y,
  onClose,
  textareaEl,
  onPasteText,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x, y })
  const [visible, setVisible] = useState(false)

  // 智能定位：确保菜单不超出视窗
  const calcPosition = useCallback(() => {
    const menuEl = menuRef.current
    const itemCount = 4
    const menuHeight = itemCount * MENU_ITEM_HEIGHT + 2

    let adjustedX = x
    let adjustedY = y

    if (menuEl) {
      const rect = menuEl.getBoundingClientRect()
      const actualWidth = rect.width || MENU_WIDTH
      const actualHeight = rect.height || menuHeight

      if (x + actualWidth > window.innerWidth - GAP) {
        adjustedX = x - actualWidth
      }
      if (y + actualHeight > window.innerHeight - GAP) {
        adjustedY = y - actualHeight
      }
    } else {
      if (x + MENU_WIDTH > window.innerWidth - GAP) {
        adjustedX = x - MENU_WIDTH
      }
      if (y + menuHeight > window.innerHeight - GAP) {
        adjustedY = y - menuHeight
      }
    }

    if (adjustedX < GAP) adjustedX = GAP
    if (adjustedY < GAP) adjustedY = GAP

    setPos({ x: adjustedX, y: adjustedY })
    setVisible(true)
  }, [x, y])

  useEffect(() => {
    calcPosition()
  }, [calcPosition])

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const hasSelection = textareaEl
    ? textareaEl.selectionStart !== textareaEl.selectionEnd
    : false

  const items: MenuItem[] = [
    {
      label: '全选',
      shortcut: 'Ctrl+A',
      action: () => {
        textareaEl?.select()
        textareaEl?.focus()
        onClose()
      },
      disabled: !textareaEl || textareaEl.value.length === 0,
      separatorAfter: true,
    },
    {
      label: '剪切',
      shortcut: 'Ctrl+X',
      action: () => {
        if (textareaEl) {
          textareaEl.focus()
          document.execCommand('cut')
        }
        onClose()
      },
      disabled: !hasSelection,
    },
    {
      label: '复制',
      shortcut: 'Ctrl+C',
      action: () => {
        if (textareaEl) {
          textareaEl.focus()
          document.execCommand('copy')
        }
        onClose()
      },
      disabled: !hasSelection,
    },
    {
      label: '粘贴',
      shortcut: 'Ctrl+V',
      action: async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (text) {
            textareaEl?.focus()
            onPasteText(text)
          }
        } catch {
          // 剪贴板读取失败，静默忽略
        }
        onClose()
      },
      disabled: false,
    },
  ]

  return (
    <div
      className="context-menu-overlay"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={menuRef}
        className={`context-menu${visible ? ' visible' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        role="menu"
        aria-label="文本编辑菜单"
      >
        {items.map((item, i) => (
          <div key={item.label}>
            <button
              type="button"
              className={`context-menu-item${item.disabled ? ' disabled' : ''}`}
              role="menuitem"
              disabled={item.disabled}
              onClick={item.action}
            >
              <span className="context-menu-item-label">{item.label}</span>
              <span className="context-menu-item-shortcut">{item.shortcut}</span>
            </button>
            {item.separatorAfter && i < items.length - 1 && (
              <div className="context-menu-separator" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}