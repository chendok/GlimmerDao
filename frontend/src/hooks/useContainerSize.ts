import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * 容器尺寸观测 Hook
 * 使用 ResizeObserver 监听容器尺寸变化，采样频率 ≥30Hz
 * 通过 requestAnimationFrame 节流，确保侧边栏拖动时帧率稳定在 60fps
 *
 * @param throttleMs - 节流间隔（毫秒），默认 33ms（≈30Hz）
 * @returns { ref, width, height } - 容器 ref 和实时尺寸
 */
export function useContainerSize(throttleMs = 33) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const rafIdRef = useRef(0)
  const lastUpdateRef = useRef(0)

  const updateSize = useCallback(() => {
    const el = ref.current
    if (!el) return

    const now = performance.now()
    if (now - lastUpdateRef.current < throttleMs) {
      // 未达到节流间隔，预约下一帧
      rafIdRef.current = requestAnimationFrame(updateSize)
      return
    }

    lastUpdateRef.current = now
    const rect = el.getBoundingClientRect()
    setSize((prev) => {
      // 仅当尺寸真正变化时更新，避免无谓重渲染
      if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
        return prev
      }
      return { width: rect.width, height: rect.height }
    })
  }, [throttleMs])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 使用 ResizeObserver 检测容器尺寸变化
    const observer = new ResizeObserver(() => {
      // 使用 rAF 节流，确保与浏览器渲染帧同步
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
      rafIdRef.current = requestAnimationFrame(updateSize)
    })

    observer.observe(el)

    // 初始尺寸
    updateSize()

    return () => {
      observer.disconnect()
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [updateSize])

  return { ref, ...size }
}