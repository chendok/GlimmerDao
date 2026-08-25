import { useState, useEffect, useCallback, useRef } from 'react'

export interface TimeRowItem {
  key: number
  label: string
  subLabel?: string
  isSelected: boolean
}

const PREREQUISITE_MAP: Record<string, string> = {
  '流年': '大运',
  '流月': '流年',
  '流日': '流月',
  '流时': '流日',
}

export default function TimeDimensionRow({
  title,
  items,
  disabled,
  onSelect,
  prerequisiteLabel,
}: {
  title: string
  items: TimeRowItem[]
  disabled: boolean
  onSelect: (key: number, e: React.MouseEvent) => void
  prerequisiteLabel?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const prevSelectedKeyRef = useRef<number | null>(null)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    el.addEventListener('scroll', checkScroll, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', checkScroll)
    }
  }, [checkScroll, items])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    
    // 找到选中的项
    const selectedItem = items.find(item => item.isSelected)
    if (selectedItem) {
      // 只有当选中项发生变化时才滚动
      if (prevSelectedKeyRef.current !== selectedItem.key) {
        prevSelectedKeyRef.current = selectedItem.key
        
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          const itemEl = el.querySelector(`[data-time-item="${selectedItem.key}"]`) as HTMLElement
          if (itemEl) {
            itemEl.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'center',
            })
          }
        })
      }
    } else {
      // 如果没有选中项，滚动到开头
      prevSelectedKeyRef.current = null
      el.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, [items])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.6
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  const handleWheel = (e: React.WheelEvent) => {
    const el = scrollRef.current
    if (!el) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollBy({ left: e.deltaY, behavior: 'auto' })
    }
  }

  const handleItemClick = (key: number, e: React.MouseEvent) => {
    if (disabled) {
      setShowTooltip(true)
      setTimeout(() => setShowTooltip(false), 1500)
      return
    }
    onSelect(key, e)
  }

  const prereq = prerequisiteLabel ?? PREREQUISITE_MAP[title]

  return (
    <div className={`time-dimension-row${disabled ? ' disabled' : ''}`}>
      <div className="time-dimension-label">{title}</div>
      <div className="time-dimension-scroll-wrapper">
        <button
          className={`time-dimension-arrow time-dimension-arrow-left ${canScrollLeft ? '' : 'disabled'}`}
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          aria-label="向左滚动"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <div className="time-dimension-scroll" ref={scrollRef} onWheel={handleWheel}>
          {items.map((item) => (
            <div
              key={item.key}
              data-time-item={item.key}
              className={`time-dimension-item ${item.isSelected ? 'selected' : ''}${disabled ? ' disabled' : ''}`}
              onClick={(e) => handleItemClick(item.key, e)}
            >
              <span className="time-dimension-item-label">{item.label}</span>
              {item.subLabel && <span className="time-dimension-item-sub">{item.subLabel}</span>}
            </div>
          ))}
        </div>
        <button
          className={`time-dimension-arrow time-dimension-arrow-right ${canScrollRight ? '' : 'disabled'}`}
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          aria-label="向右滚动"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
      {showTooltip && prereq && (
        <div className="time-dimension-tooltip">
          请先选择{prereq}
        </div>
      )}
    </div>
  )
}
