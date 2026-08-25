import { useEffect, useRef, useState, useMemo } from 'react'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'

interface Props {
  /** Markdown 格式的思维导图内容 */
  markdown: string
  /** 是否暗色模式 */
  dark?: boolean
  /** 文档标题 */
  title?: string
  /** 保存回调（接收最新的 markdown） */
  onSave?: (markdown: string) => void
  /** 关闭回调 */
  onClose?: () => void
}

/**
 * 基于 markmap 的思维导图组件
 * - 接收 Markdown 字符串，渲染为思维导图
 * - 支持暗色模式
 * - 支持导出 SVG / PNG
 * - 支持手动编辑 Markdown 源码并实时预览
 * - 支持节点展开/折叠动画
 */
export default function MarkmapView({ markdown, dark, title, onSave, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const markmapRef = useRef<Markmap | null>(null)
  const transformer = useMemo(() => new Transformer(), [])
  const [editMode, setEditMode] = useState(false)
  const [editValue, setEditValue] = useState(markdown)
  const [showSource, setShowSource] = useState(false)

  // 初始化 markmap
  useEffect(() => {
    if (!svgRef.current) return
    markmapRef.current = Markmap.create(svgRef.current, {
      color: dark
        ? (node => d3Color(node.state?.depth || 0))
        : undefined,
      paddingX: 8,
      autoFit: true,
    })
    return () => {
      markmapRef.current = null
    }
  }, [dark])

  // 当 markdown 变化时更新思维导图
  useEffect(() => {
    if (!markmapRef.current) return
    const { root } = transformer.transform(editValue || markdown)
    markmapRef.current.setData(root)
    markmapRef.current.fit()
  }, [editValue, markdown, transformer])

  // 监听窗口大小变化重新适配
  useEffect(() => {
    const handleResize = () => markmapRef.current?.fit()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  /** 导出 SVG */
  const handleExportSVG = () => {
    if (!svgRef.current) return
    const svgEl = svgRef.current
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(svgEl.clientWidth || 1200))
    clone.setAttribute('height', String(svgEl.clientHeight || 800))

    // 暗色模式时设置背景
    if (dark) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('width', '100%')
      bg.setAttribute('height', '100%')
      bg.setAttribute('fill', '#1e1e2e')
      clone.insertBefore(bg, clone.firstChild)
    }

    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(clone)
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svgStr}`], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'mindmap'}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 导出 PNG（通过 canvas） */
  const handleExportPNG = async () => {
    if (!svgRef.current) return
    const svgEl = svgRef.current
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    const w = svgEl.clientWidth || 1200
    const h = svgEl.clientHeight || 800
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    if (dark) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('width', '100%')
      bg.setAttribute('height', '100%')
      bg.setAttribute('fill', '#1e1e2e')
      clone.insertBefore(bg, clone.firstChild)
    }

    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(clone)
    const img = new Image()
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2 // 2x 高清
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = pngUrl
        a.download = `${title || 'mindmap'}.png`
        a.click()
        URL.revokeObjectURL(pngUrl)
      }, 'image/png')
    }
    img.src = url
  }

  /** 适配视图 */
  const handleFit = () => markmapRef.current?.fit()

  return (
    <div className={`kb-mm-markmap-container${dark ? ' dark' : ''}`}>
      {/* 工具栏 */}
      <div className="kb-mm-toolbar">
        <div className="kb-mm-toolbar-left">
          <span className="kb-mm-title">{title || '思维导图'}</span>
        </div>
        <div className="kb-mm-toolbar-right">
          <button
            className="kb-btn kb-btn-sm"
            onClick={() => setShowSource(!showSource)}
            title="显示/隐藏 Markdown 源码"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
            {showSource ? '隐藏源码' : '源码'}
          </button>
          <button
            className="kb-btn kb-btn-sm"
            onClick={() => setEditMode(!editMode)}
            title="编辑 Markdown 源码"
          >
            {editMode ? '预览' : '编辑'}
          </button>
          <button className="kb-btn kb-btn-sm" onClick={handleFit} title="适配视图">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            适配
          </button>
          <button className="kb-btn kb-btn-sm" onClick={handleExportSVG} title="导出 SVG">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            SVG
          </button>
          <button className="kb-btn kb-btn-sm" onClick={handleExportPNG} title="导出 PNG">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            PNG
          </button>
          {onSave && (
            <button
              className="kb-btn kb-btn-sm kb-btn-primary"
              onClick={() => onSave(editMode ? editValue : markdown)}
            >
              保存
            </button>
          )}
          {onClose && (
            <button className="kb-btn kb-btn-sm" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>

      {/* 主体区 */}
      <div className="kb-mm-main">
        {editMode ? (
          <div className="kb-mm-split">
            <textarea
              className="kb-mm-source-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="# 根节点\n## 子节点\n### 三级节点"
              spellCheck={false}
            />
            <div className="kb-mm-preview">
              <svg ref={svgRef} className="kb-mm-svg" />
            </div>
          </div>
        ) : showSource ? (
          <div className="kb-mm-split">
            <pre className="kb-mm-source-readonly">{editValue || markdown}</pre>
            <div className="kb-mm-preview">
              <svg ref={svgRef} className="kb-mm-svg" />
            </div>
          </div>
        ) : (
          <div className="kb-mm-preview-full">
            <svg ref={svgRef} className="kb-mm-svg" />
          </div>
        )}
      </div>
    </div>
  )
}

/** 根据 depth 生成暗色模式下的节点颜色 */
function d3Color(depth: number): string {
  const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#ba68c8', '#ff8a65', '#4dd0e1', '#a1887f']
  return colors[depth % colors.length]
}
