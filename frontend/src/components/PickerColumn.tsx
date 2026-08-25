import { useRef, useCallback, useEffect, useId } from 'react'

export interface PickerColumnProps {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}

const ITEM_HEIGHT = 40
const PADDING_TOP = 80
// 拖拽阈值:超过此距离视为拖拽(非点击),抑制 click
const DRAG_THRESHOLD = 5
// 惯性物理参数
const FRICTION = 0.93          // 摩擦系数:越大减速越慢,滚动越远
const MIN_VELOCITY = 0.5       // 低于此速度(px/帧)停止惯性,触发吸附
const MAX_VELOCITY = 60        // 最大惯性速度,防止失控
const SNAP_VELOCITY = 2        // 低于此速度直接吸附,不启动惯性
// 松手后若距上次移动超过此毫秒数,视为已停顿,不产生惯性
const STOP_THRESHOLD = 100

export default function PickerColumn({ label, options, value, onChange }: PickerColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastWheelRef = useRef<number>(0)
  const hasScrolledRef = useRef(false)
  const reactId = useId()
  const WHEEL_COOLDOWN = 150

  // ── 拖拽 / 惯性状态(均用 ref,不触发重渲染)──
  const isDraggingRef = useRef(false)
  const movedDuringDragRef = useRef(false)
  const dragStartYRef = useRef(0)
  const dragStartScrollTopRef = useRef(0)
  const lastMoveYRef = useRef(0)
  const lastMoveTimeRef = useRef(0)
  const velocityRef = useRef(0)        // px/ms,带方向(向下拨为正)
  const rafRef = useRef<number | null>(null)

  // 居中滚动到指定索引
  const scrollToIndex = useCallback((idx: number, smooth: boolean) => {
    const el = containerRef.current
    if (!el) return
    const viewportHeight = el.clientHeight
    if (viewportHeight === 0) return
    const itemCenter = PADDING_TOP + idx * ITEM_HEIGHT + ITEM_HEIGHT / 2
    const target = itemCenter - viewportHeight / 2
    el.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // 吸附到离视口中心最近的选项(惯性结束后调用)
  const snapToNearest = useCallback(() => {
    const el = containerRef.current
    if (!el || options.length === 0) return
    const viewportHeight = el.clientHeight
    const centerOffset = el.scrollTop + viewportHeight / 2 - PADDING_TOP - ITEM_HEIGHT / 2
    let nearestIdx = Math.round(centerOffset / ITEM_HEIGHT)
    nearestIdx = Math.max(0, Math.min(options.length - 1, nearestIdx))
    const target = options[nearestIdx]
    if (!target) return
    if (target.value !== value) {
      onChange(target.value)
    } else {
      scrollToIndex(nearestIdx, true)
    }
  }, [options, value, onChange, scrollToIndex])

  // 启动惯性滚动:根据松手时速度做减速运动,结束后吸附
  const startInertia = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    let velocity = velocityRef.current * 16  // px/ms → px/frame(约16ms/帧)
    velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity))

    if (Math.abs(velocity) < SNAP_VELOCITY) {
      snapToNearest()
      return
    }

    const tick = () => {
      const el2 = containerRef.current
      if (!el2) {
        rafRef.current = null
        return
      }
      velocity *= FRICTION
      if (Math.abs(velocity) < MIN_VELOCITY) {
        rafRef.current = null
        snapToNearest()
        return
      }
      const maxScroll = el2.scrollHeight - el2.clientHeight
      let newScrollTop = el2.scrollTop - velocity
      if (newScrollTop <= 0) {
        el2.scrollTop = 0
        rafRef.current = null
        snapToNearest()
        return
      }
      if (newScrollTop >= maxScroll) {
        el2.scrollTop = maxScroll
        rafRef.current = null
        snapToNearest()
        return
      }
      el2.scrollTop = newScrollTop
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [snapToNearest])

  // ── Pointer 拖拽:鼠标/触摸按下启动 ──
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = containerRef.current
    if (!el || options.length === 0) return

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    isDraggingRef.current = true
    movedDuringDragRef.current = false
    dragStartYRef.current = e.clientY
    dragStartScrollTopRef.current = el.scrollTop
    lastMoveYRef.current = e.clientY
    lastMoveTimeRef.current = Date.now()
    velocityRef.current = 0
    el.classList.add('is-dragging')
    el.focus({ preventScroll: true })

    const onMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return
      const el2 = containerRef.current
      if (!el2) return
      const dy = ev.clientY - dragStartYRef.current
      if (Math.abs(dy) > DRAG_THRESHOLD) {
        movedDuringDragRef.current = true
      }
      let newScrollTop = dragStartScrollTopRef.current - dy
      const maxScroll = el2.scrollHeight - el2.clientHeight
      newScrollTop = Math.max(0, Math.min(maxScroll, newScrollTop))
      el2.scrollTop = newScrollTop

      // 计算瞬时速度(指数移动平均,平滑抖动)
      const now = Date.now()
      const dt = now - lastMoveTimeRef.current
      if (dt > 0) {
        const moveDy = ev.clientY - lastMoveYRef.current
        const instant = moveDy / dt
        velocityRef.current = velocityRef.current * 0.5 + instant * 0.5
      }
      lastMoveYRef.current = ev.clientY
      lastMoveTimeRef.current = now
    }

    const onUp = () => {
      isDraggingRef.current = false
      const el2 = containerRef.current
      if (el2) el2.classList.remove('is-dragging')
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)

      const idle = Date.now() - lastMoveTimeRef.current
      if (idle > STOP_THRESHOLD) {
        velocityRef.current = 0
      }
      startInertia()
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    e.preventDefault()
  }, [options.length, startInertia])

  // options 变化时,若 value 已失效则回退到首项
  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value)
    if (idx < 0 && options.length > 0) {
      onChange(options[0].value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  // value/options 变化时滚动居中(首次瞬时,后续平滑)
  // 拖拽/惯性期间跳过:此时滚动位置由指针控制,value 变化会在吸附阶段统一处理
  useEffect(() => {
    if (isDraggingRef.current || rafRef.current !== null) return
    const idx = options.findIndex((o) => o.value === value)
    if (idx >= 0) {
      const smooth = hasScrolledRef.current
      requestAnimationFrame(() => scrollToIndex(idx, smooth))
      hasScrolledRef.current = true
    }
  }, [value, options, scrollToIndex])

  // 滚轮:节流,每次移动一项(拖拽/惯性期间忽略)
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (isDraggingRef.current || rafRef.current !== null) return
    const now = Date.now()
    if (now - lastWheelRef.current < WHEEL_COOLDOWN) return
    lastWheelRef.current = now
    const idx = options.findIndex((o) => o.value === value)
    const delta = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0
    if (delta === 0) return
    const nextIdx = Math.max(0, Math.min(options.length - 1, idx + delta))
    if (nextIdx !== idx && options[nextIdx]) {
      onChange(options[nextIdx].value)
    }
  }, [options, value, onChange])

  // 键盘导航(拖拽/惯性期间忽略)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isDraggingRef.current || rafRef.current !== null) return
    const idx = options.findIndex((o) => o.value === value)
    let nextIdx = idx
    switch (e.key) {
      case 'ArrowUp': nextIdx = Math.max(0, idx - 1); break
      case 'ArrowDown': nextIdx = Math.min(options.length - 1, idx + 1); break
      case 'PageUp': nextIdx = Math.max(0, idx - 5); break
      case 'PageDown': nextIdx = Math.min(options.length - 1, idx + 5); break
      case 'Home': nextIdx = 0; break
      case 'End': nextIdx = options.length - 1; break
      default: return
    }
    e.preventDefault()
    if (nextIdx !== idx && options[nextIdx]) {
      onChange(options[nextIdx].value)
    }
  }, [options, value, onChange])

  // 点击选项:拖拽过程中产生的 click 会被抑制
  const handleItemClick = useCallback((val: string) => {
    if (movedDuringDragRef.current) {
      movedDuringDragRef.current = false
      return
    }
    onChange(val)
  }, [onChange])

  // 绑定 wheel / keydown / pointerdown
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('pointerdown', handlePointerDown)
    return () => el.removeEventListener('pointerdown', handlePointerDown)
  }, [handlePointerDown])

  // 卸载时清理惯性动画
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="bazi-dt-column">
      <div className="bazi-dt-column-header">{label}</div>
      <div className="bazi-dt-column-wrap">
        <div className="bazi-dt-column-indicator" />
        <div
          ref={containerRef}
          className="bazi-dt-column-list"
          tabIndex={0}
          role="listbox"
          aria-label={label}
          aria-activedescendant={value ? `${reactId}-${value}` : undefined}
        >
          <div className="bazi-dt-column-pad" style={{ height: `${PADDING_TOP}px` }} />
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <div
                key={opt.value}
                id={`${reactId}-${opt.value}`}
                className={`bazi-dt-column-item${isSelected ? ' selected' : ''}`}
                onClick={() => handleItemClick(opt.value)}
                role="option"
                aria-selected={isSelected}
                style={{ height: `${ITEM_HEIGHT}px`, lineHeight: `${ITEM_HEIGHT}px` }}
              >
                {opt.label}
              </div>
            )
          })}
          <div className="bazi-dt-column-pad" style={{ height: `${PADDING_TOP}px` }} />
        </div>
      </div>
    </div>
  )
}
