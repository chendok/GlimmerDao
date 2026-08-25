// ── 类型定义 ──
export interface OutlineNode {
  id: string
  title: string
  children?: OutlineNode[]
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  category: string  // 模板所属分类目录: bazi/ziwei/liuyao/meihua/mayi/huangli
}

interface ReportOutlineEditorProps {
  /** 可选模板列表 */
  templates: TemplateInfo[]
  /** 当前选中的模板 ID */
  selectedTemplateId: string
  /** 模板选择变更回调 */
  onTemplateChange: (templateId: string) => void
  /** 当前模板的目录结构 */
  outline: OutlineNode[]
  /** 是否加载中 */
  loading?: boolean
  /** 错误信息 */
  error?: string
  disabled?: boolean
}

// ── ID 生成 ──
let _idCounter = 0
function genId(): string {
  _idCounter += 1
  return `node-${Date.now()}-${_idCounter}`
}

// ── 只读节点渲染组件 ──
function OutlineNodeItem({
  node,
  depth,
  index,
}: {
  node: OutlineNode
  depth: number
  index: number
}) {
  const children = node.children || []
  const hasChildren = children.length > 0

  return (
    <li className="outline-node-item" role="treeitem" aria-expanded={hasChildren ? true : undefined}>
      <div className="outline-node-row" style={{ paddingLeft: `${depth * 20}px` }}>
        <span className="outline-node-bullet">{hasChildren ? '▾' : '•'}</span>
        <span className="outline-node-title">
          {depth === 0 && <span className="outline-node-index">{index + 1}. </span>}
          {node.title}
        </span>
      </div>
      {hasChildren && (
        <ul className="outline-node-children" role="group">
          {children.map((child, idx) => (
            <OutlineNodeItem
              key={child.id || `${depth}-${idx}`}
              node={child}
              depth={depth + 1}
              index={idx}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ── 主组件 ──
export default function ReportOutlineEditor({
  templates,
  selectedTemplateId,
  onTemplateChange,
  outline,
  loading = false,
  error = '',
  disabled = false,
}: ReportOutlineEditorProps) {
  // 统计节点总数
  const countNodes = (nodes: OutlineNode[]): number => {
    return nodes.reduce((sum, n) => sum + 1 + (n.children ? countNodes(n.children) : 0), 0)
  }
  const totalCount = countNodes(outline)

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  return (
    <div className="report-outline-editor">
      <div className="outline-editor-header">
        <div className="outline-editor-title">
          <span className="outline-editor-icon">📋</span>
          <div>
            <strong>报告目录结构</strong>
            <p>
              {loading
                ? '加载模板中...'
                : outline.length > 0
                  ? `共 ${totalCount} 个章节 · 顶层 ${outline.length} 章`
                  : '请选择报告模板'}
            </p>
          </div>
        </div>
      </div>

      {/* 模板描述 */}
      {selectedTemplate && selectedTemplate.description && !loading && !error && (
        <div className="template-description">
          <span className="template-description-icon">💡</span>
          <span>{selectedTemplate.description}</span>
        </div>
      )}

      {/* 内容区域 */}
      {loading ? (
        <div className="outline-loading">
          <span className="outline-loading-spinner" />
          <p>加载模板目录...</p>
        </div>
      ) : error ? (
        <div className="outline-error">
          <p>{error}</p>
        </div>
      ) : outline.length > 0 ? (
        <ul className="outline-tree" role="tree">
          {outline.map((node, idx) => (
            <OutlineNodeItem
              key={node.id || `root-${idx}`}
              node={node}
              depth={0}
              index={idx}
            />
          ))}
        </ul>
      ) : (
        <div className="outline-empty">
          <p>请选择报告模板以加载目录结构</p>
        </div>
      )}
    </div>
  )
}

// ── 工具函数：为后端返回的 outline 节点补充 id ──
export function ensureNodeIds(nodes: any[]): OutlineNode[] {
  return (nodes || []).map((node) => ({
    id: node.id || genId(),
    title: node.title || '',
    children: node.children ? ensureNodeIds(node.children) : undefined,
  }))
}

// ── 工具函数：去除 id 字段，仅保留 title + children 用于传输 ──
export function stripNodeIds(nodes: OutlineNode[]): any[] {
  return nodes.map((node) => ({
    title: node.title,
    children: node.children ? stripNodeIds(node.children) : undefined,
  }))
}
