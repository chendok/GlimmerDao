import { useState, useRef, useEffect, useCallback } from 'react'
import { API_BASE } from '../utils/constants'

interface Category {
  id: number
  name: string
  code: string | null
  parent_id: number | null
  description: string | null
  document_count: number
  children: Category[]
}

interface Props {
  categories: Category[]
  selectedId: number | null
  onSelect: (id: number) => void
  isPersonal: boolean
  isAdmin: boolean
  onRefresh: () => void
  token: string | null
  onCollapse?: () => void
  onToast?: (msg: string, type: 'success' | 'error') => void
}

/** 右键菜单位置 */
interface ContextMenu {
  x: number
  y: number
  categoryId: number
  categoryName: string
  categoryCode: string | null
}

export default function KnowledgeCategoryTree({
  categories,
  selectedId,
  onSelect,
  isPersonal,
  isAdmin,
  onRefresh,
  token,
  onCollapse,
  onToast,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)

  // 非管理员在通用知识库下不可维护分类；个人知识库下用户可管理自己的分类
  const canManage = isPersonal ? !!token : isAdmin

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 重命名状态
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // 确认弹窗
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  // 点击空白处关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // 重命名输入框自动聚焦
  useEffect(() => {
    if (renamingId !== null && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  const getEndpoint = useCallback(
    (path: string) => {
      const base = isPersonal ? `${API_BASE}/knowledge/personal` : `${API_BASE}/knowledge/admin`
      return `${base}${path}`
    },
    [isPersonal]
  )

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAddClick = () => {
    setParentId(null)
    setNewCategoryName('')
    setShowCreate(true)
    setContextMenu(null)
  }

  const handleCreate = async () => {
    if (!newCategoryName.trim() || !token) return

    try {
      const res = await fetch(getEndpoint('/categories'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          parent_id: parentId,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setNewCategoryName('')
        setShowCreate(false)
        // 如果父节点未展开，自动展开
        if (parentId !== null) {
          setExpanded((prev) => {
            const next = new Set(prev)
            next.add(parentId)
            return next
          })
        }
        onRefresh()
        onToast?.('分类添加成功', 'success')
      } else {
        onToast?.(data.message || '添加失败', 'error')
      }
    } catch (e) {
      console.error('[CategoryTree] 创建分类失败:', e)
      onToast?.('网络错误，请重试', 'error')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    setContextMenu(null)
    setConfirmDialog({
      title: '删除分类',
      message: `确定要删除分类「${name}」吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          const res = await fetch(getEndpoint(`/categories/${id}`), {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await res.json()
          if (res.ok) {
            onRefresh()
            onToast?.(`「${name}」已删除`, 'success')
          } else {
            onToast?.(data.detail || data.message || '删除失败', 'error')
          }
        } catch (e) {
          console.error('[CategoryTree] 删除分类失败:', e)
          onToast?.('网络错误，请重试', 'error')
        }
      },
    })
  }

  const handleRenameStart = (id: number, name: string) => {
    setContextMenu(null)
    setRenamingId(id)
    setRenameValue(name)
  }

  const handleRenameCancel = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const handleRenameConfirm = async () => {
    if (renamingId === null || !renameValue.trim() || !token) return

    try {
      const res = await fetch(getEndpoint(`/categories/${renamingId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: renameValue.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRenamingId(null)
        setRenameValue('')
        onRefresh()
        onToast?.('分类重命名成功', 'success')
      } else {
        onToast?.(data.message || '重命名失败', 'error')
      }
    } catch (e) {
      console.error('[CategoryTree] 重命名失败:', e)
      onToast?.('网络错误，请重试', 'error')
    }
  }

  const handleDoubleClick = (cat: Category) => {
    if (canManage) {
      handleRenameStart(cat.id, cat.name)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, cat: Category) => {
    if (!canManage) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      categoryId: cat.id,
      categoryName: cat.name,
      categoryCode: cat.code,
    })
  }

  // 递归渲染分类节点
  const renderCategory = (cat: Category, depth: number = 0) => {
    const hasChildren = cat.children && cat.children.length > 0
    const isExpanded = expanded.has(cat.id)
    const isSelected = selectedId === cat.id
    const isRenaming = renamingId === cat.id

    return (
      <div key={cat.id} className="kb-cat-item">
        {isRenaming ? (
          <div className="kb-cat-rename-form" style={{ paddingLeft: `${12 + depth * 16}px` }}>
            <input
              ref={renameInputRef}
              className="kb-input kb-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameConfirm()
                if (e.key === 'Escape') handleRenameCancel()
              }}
              placeholder="分类名称"
            />
            <div className="kb-cat-rename-actions">
              <button className="kb-btn kb-btn-sm kb-btn-primary" onClick={handleRenameConfirm}>确定</button>
              <button className="kb-btn kb-btn-sm" onClick={handleRenameCancel}>取消</button>
            </div>
          </div>
        ) : (
          <div
            className={`kb-cat-row${isSelected ? ' selected' : ''}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => onSelect(cat.id)}
            onDoubleClick={() => handleDoubleClick(cat)}
            onContextMenu={(e) => handleContextMenu(e, cat)}
          >
            {hasChildren ? (
              <button
                className="kb-cat-expand"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpand(cat.id)
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            ) : (
              <span className="kb-cat-expand-placeholder" />
            )}
            <span className="kb-cat-name" title={cat.name}>
              <span className="kb-cat-name-text">{cat.name}</span>
              {cat.code && <span className="kb-cat-code">[{cat.code}]</span>}
            </span>
            <span className="kb-cat-count">{cat.document_count}</span>
          </div>
        )}
        {hasChildren && isExpanded && (
          <div className="kb-cat-children">
            {cat.children.map((child) => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="kb-category-tree">
      <div className="kb-cat-header">
        <h3>
          <svg
            className="kb-cat-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          {isPersonal ? '我的分类' : '知识分类'}
        </h3>
        <div className="kb-cat-header-actions">
          {canManage && (
            <button className="kb-cat-add-btn" onClick={handleAddClick} title="添加分类">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
          {onCollapse && (
            <button className="kb-cat-add-btn" onClick={onCollapse} title="收缩分类面板">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 创建分类表单 */}
      {showCreate && (
        <div className="kb-cat-create-form">
          <div className="kb-cat-create-hint">
            {parentId !== null ? (
              <>新分类将添加到当前选中分类下</>
            ) : (
              <>新分类将添加为顶级分类</>
            )}
          </div>
          <input
            type="text"
            className="kb-input"
            placeholder="分类名称 *"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <div className="kb-cat-create-actions">
            <button className="kb-btn kb-btn-sm kb-btn-primary" onClick={handleCreate}>
              创建
            </button>
            <button
              className="kb-btn kb-btn-sm"
              onClick={() => {
                setShowCreate(false)
                setNewCategoryName('')
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 分类列表 */}
      <div className="kb-cat-list">
        {categories.length === 0 ? (
          <p className="kb-empty">暂无分类</p>
        ) : (
          categories.map((cat) => renderCategory(cat))
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="kb-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="kb-context-menu-header">{contextMenu.categoryName}</div>
          <button
            className="kb-context-menu-item"
            onClick={() => {
              onSelect(contextMenu.categoryId)
              setParentId(contextMenu.categoryId)
              setNewCategoryName('')
              setShowCreate(true)
              setContextMenu(null)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加子分类
          </button>
          <button
            className="kb-context-menu-item"
            onClick={() =>
              handleRenameStart(contextMenu.categoryId, contextMenu.categoryName)
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            重命名
          </button>
          <div className="kb-context-menu-divider" />
          <button
            className="kb-context-menu-item kb-context-menu-danger"
            onClick={() => handleDelete(contextMenu.categoryId, contextMenu.categoryName)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
            删除
          </button>
        </div>
      )}

      {/* 确认弹窗 */}
      {confirmDialog && (
        <div className="kb-modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="kb-modal kb-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="kb-modal-header">
              <h3>{confirmDialog.title}</h3>
            </div>
            <div className="kb-modal-body">
              <div className="kb-confirm-content">
                <div className="kb-confirm-icon kb-confirm-icon-danger">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p className="kb-confirm-message">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="kb-modal-footer">
              <button className="kb-btn" onClick={() => setConfirmDialog(null)}>
                取消
              </button>
              <button
                className="kb-btn kb-btn-danger"
                onClick={() => {
                  confirmDialog.onConfirm()
                  setConfirmDialog(null)
                }}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
