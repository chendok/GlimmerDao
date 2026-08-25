/**
 * 系统提示词管理页签
 *
 * 功能：
 * - 两类提示词分类展示：对话框提示词 / 生成报告提示词
 * - 富文本编辑区域（textarea + Markdown 渲染预览）
 * - 变量说明文档展示
 * - 实时预览（拼接 Skill 指南后的完整 System Prompt 样例）
 * - 版本控制：版本列表 / 版本切换（回滚）/ 当前版本号显示
 * - 一键恢复默认（二次确认）
 *
 * 权限：仅系统管理员可访问（由外层 SystemManagementPage 守卫）。
 */
import { useState, useEffect, useCallback, Fragment } from 'react'
import { getErrorMessage } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../utils/constants'
import ConfirmDialog from './ConfirmDialog'

interface PromptTypeMeta {
  value: string
  label: string
  description: string
}

interface SystemPromptData {
  id: number
  prompt_key: string
  name: string
  prompt_type: string  // chat / report
  content: string
  variables_doc: string
  description: string
  version: number
  is_default: boolean
  created_by: number | null
  created_at: string | null
  updated_by: number | null
  updated_at: string | null
}

interface PromptVersion {
  id: number
  prompt_key: string
  version: number
  content: string
  variables_doc: string
  change_note: string
  changed_by: number | null
  changed_by_username: string | null
  created_at: string | null
}

type PromptTypeFilter = 'chat' | 'report'

export default function PromptsTab() {
  const { token } = useAuth()

  const [types, setTypes] = useState<PromptTypeMeta[]>([])
  const [activeType, setActiveType] = useState<PromptTypeFilter>('chat')

  const [prompts, setPrompts] = useState<SystemPromptData[]>([])
  const [promptsLoading, setPromptsLoading] = useState(false)
  const [promptsError, setPromptsError] = useState('')

  // 当前选中的提示词
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null)
  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId) || null

  // 编辑表单
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editVariablesDoc, setEditVariablesDoc] = useState('')
  const [editChangeNote, setEditChangeNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 版本控制
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [versionsTotal, setVersionsTotal] = useState(0)
  const [versionsPage, setVersionsPage] = useState(1)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [showVersionPanel, setShowVersionPanel] = useState(false)
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null)

  // 二次确认对话框
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    danger?: boolean
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  // ── 加载类型元信息 ──
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/system/admin/prompts/types`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.types) setTypes(d.types)
      })
      .catch((e) => console.error('[Prompts] 加载类型元信息失败:', e))
  }, [token])

  // ── 加载提示词列表 ──
  const loadPrompts = useCallback(async () => {
    if (!token) return
    setPromptsLoading(true)
    setPromptsError('')
    try {
      const res = await fetch(`${API_BASE}/system/admin/prompts?prompt_type=${activeType}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.detail || `加载失败 (HTTP ${res.status})`)
      }
      const data = await res.json()
      const items: SystemPromptData[] = data.items || []
      setPrompts(items)
      // 自动选中第一个
      if (items.length > 0 && !items.find((p) => p.id === selectedPromptId)) {
        setSelectedPromptId(items[0].id)
      } else if (items.length === 0) {
        setSelectedPromptId(null)
      }
    } catch (e: unknown) {
      setPromptsError(getErrorMessage(e) || '加载提示词失败')
    } finally {
      setPromptsLoading(false)
    }
  }, [token, activeType, selectedPromptId])

  useEffect(() => { loadPrompts() }, [loadPrompts])

  // 切换类型时清空选中与编辑状态
  useEffect(() => {
    setSelectedPromptId(null)
    setEditing(false)
    setActionMsg(null)
    setShowVersionPanel(false)
  }, [activeType])

  // ── 加载版本列表 ──
  const loadVersions = useCallback(async () => {
    if (!token || !selectedPrompt) return
    setVersionsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/system/admin/prompts/${selectedPrompt.id}/versions?page=${versionsPage}&page_size=20`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setVersions(data.items || [])
      setVersionsTotal(data.total || 0)
    } catch (e) {
      console.error('[Prompts] 加载版本列表失败:', e)
    } finally {
      setVersionsLoading(false)
    }
  }, [token, selectedPrompt, versionsPage])

  useEffect(() => {
    if (showVersionPanel && selectedPrompt) {
      loadVersions()
    }
  }, [showVersionPanel, selectedPrompt, loadVersions])

  // ── 开始编辑 ──
  const handleStartEdit = () => {
    if (!selectedPrompt) return
    setEditContent(selectedPrompt.content)
    setEditVariablesDoc(selectedPrompt.variables_doc)
    setEditChangeNote('')
    setEditing(true)
    setActionMsg(null)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditContent('')
    setEditVariablesDoc('')
    setEditChangeNote('')
  }

  // ── 保存 ──
  const handleSave = async () => {
    if (!token || !selectedPrompt) return
    if (!editContent.trim()) {
      setActionMsg({ type: 'error', text: '提示词内容不能为空' })
      return
    }
    setSaving(true)
    setActionMsg(null)
    try {
      const res = await fetch(`${API_BASE}/system/admin/prompts/${selectedPrompt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: editContent,
          variables_doc: editVariablesDoc,
          change_note: editChangeNote || `更新提示词（v${selectedPrompt.version + 1}）`,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail || `保存失败 (HTTP ${res.status})`)
      setActionMsg({ type: 'success', text: data.message || '保存成功' })
      setEditing(false)
      await loadPrompts()
      // 重新加载版本
      if (showVersionPanel) await loadVersions()
    } catch (e: unknown) {
      setActionMsg({ type: 'error', text: getErrorMessage(e) || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  // ── 恢复默认（二次确认）──
  const handleRestoreDefault = () => {
    if (!token || !selectedPrompt) return
    setActionMsg(null)
    setConfirmDialog({
      open: true,
      title: '恢复默认配置确认',
      message: `确定要将「${selectedPrompt.name}」恢复为系统默认配置吗？当前自定义内容将作为历史版本保存，可随时回滚。`,
      danger: true,
      onConfirm: async () => {
        setConfirmDialog((s) => ({ ...s, open: false }))
        try {
          const res = await fetch(`${API_BASE}/system/admin/prompts/${selectedPrompt.id}/restore-default`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await res.json().catch(() => null)
          if (!res.ok) throw new Error(data?.detail || `恢复失败 (HTTP ${res.status})`)
          setActionMsg({ type: 'success', text: data.message || '已恢复为默认配置' })
          setEditing(false)
          await loadPrompts()
          if (showVersionPanel) await loadVersions()
        } catch (e: unknown) {
          setActionMsg({ type: 'error', text: getErrorMessage(e) || '恢复失败' })
        }
      },
    })
  }

  // ── 回滚到指定版本（二次确认）──
  const handleRollback = (v: PromptVersion) => {
    if (!token || !selectedPrompt) return
    setActionMsg(null)
    setConfirmDialog({
      open: true,
      title: '版本回滚确认',
      message: `确定要回滚到 v${v.version}（${v.created_at ? new Date(v.created_at).toLocaleString('zh-CN') : ''}）吗？当前内容将作为新版本保存，可再次回滚。`,
      onConfirm: async () => {
        setConfirmDialog((s) => ({ ...s, open: false }))
        try {
          const res = await fetch(`${API_BASE}/system/admin/prompts/${selectedPrompt.id}/rollback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ version_id: v.id }),
          })
          const data = await res.json().catch(() => null)
          if (!res.ok) throw new Error(data?.detail || `回滚失败 (HTTP ${res.status})`)
          setActionMsg({ type: 'success', text: data.message || '已回滚' })
          setEditing(false)
          await loadPrompts()
          await loadVersions()
        } catch (e: unknown) {
          setActionMsg({ type: 'error', text: getErrorMessage(e) || '回滚失败' })
        }
      },
    })
  }

  // ── 渲染 Markdown 变量说明为简单 HTML（保留换行）──
  const renderMarkdown = (md: string): string => {
    if (!md) return ''
    // 简单转义 + 保留换行
    return md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .replace(/\n/g, '<br/>')
  }

  const currentTypeMeta = types.find((t) => t.value === activeType)

  // 用于"实时预览"的样例 Skill 指南（仅展示拼接效果）
  const SAMPLE_SKILL_PROMPT = `## 当前任务指南
[此处由 Skill 匹配器自动注入对应专项技能指南，例如「八字分析」「紫微斗数」等]`

  return (
    <div className="prompts-tab">
      {/* 类型切换 + 说明 */}
      <div className="prompts-type-section">
        <div className="prompts-type-tabs">
          {types.map((t) => (
            <button
              key={t.value}
              className={`prompts-type-tab${activeType === t.value ? ' active' : ''}`}
              onClick={() => setActiveType(t.value as PromptTypeFilter)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {currentTypeMeta && (
          <div className="prompts-type-desc">
            <strong>{currentTypeMeta.label}：</strong>
            {currentTypeMeta.description}
          </div>
        )}
      </div>

      {/* 操作反馈 */}
      {actionMsg && (
        <div className={`sys-action-error${actionMsg.type === 'success' ? ' sys-action-success' : ''}`}>
          <span>{actionMsg.text}</span>
          <button type="button" onClick={() => setActionMsg(null)} aria-label="关闭提示">✕</button>
        </div>
      )}
      {promptsError && (
        <div className="sys-action-error">
          <span>{promptsError}</span>
          <button type="button" onClick={() => setPromptsError('')} aria-label="关闭提示">✕</button>
        </div>
      )}

      <div className="prompts-layout">
        {/* 左侧：提示词列表 */}
        <div className="prompts-list">
          <h3 className="prompts-list-title">提示词列表</h3>
          {promptsLoading ? (
            <div className="sys-loading">加载中...</div>
          ) : prompts.length === 0 ? (
            <div className="sys-empty">暂无提示词</div>
          ) : (
            <div className="prompts-list-items">
              {prompts.map((p) => (
                <div
                  key={p.id}
                  className={`prompts-list-item${selectedPromptId === p.id ? ' active' : ''}`}
                  onClick={() => { setSelectedPromptId(p.id); setEditing(false); setActionMsg(null) }}
                >
                  <div className="prompts-item-name">
                    {p.name}
                    {p.is_default && <span className="sys-badge sys-badge-admin" style={{ marginLeft: 6 }}>默认</span>}
                  </div>
                  <div className="prompts-item-meta">
                    <span>当前版本 v{p.version}</span>
                    {p.updated_at && <span>更新于 {new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>}
                  </div>
                  {p.description && <div className="prompts-item-desc">{p.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：编辑/预览区 */}
        <div className="prompts-editor-area">
          {!selectedPrompt ? (
            <div className="llm-editor-empty">
              <div className="llm-editor-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <p>请从左侧选择一个提示词进行查看或编辑。</p>
            </div>
          ) : (
            <>
              {/* 顶部信息 + 操作按钮 */}
              <div className="prompts-editor-header">
                <div className="prompts-editor-title">
                  <h3>{selectedPrompt.name}</h3>
                  <span className="prompts-version-badge">v{selectedPrompt.version}</span>
                  {selectedPrompt.is_default && <span className="sys-badge sys-badge-admin">系统默认</span>}
                </div>
                <div className="prompts-editor-actions">
                  {!editing && (
                    <>
                      <button className="sys-btn sys-btn-sm sys-btn-primary" onClick={handleStartEdit}>
                        编辑
                      </button>
                      <button
                        className="sys-btn sys-btn-sm"
                        onClick={() => setShowVersionPanel(!showVersionPanel)}
                      >
                        {showVersionPanel ? '隐藏版本' : '版本控制'}
                      </button>
                      {selectedPrompt.is_default && (
                        <button className="sys-btn sys-btn-sm sys-btn-danger" onClick={handleRestoreDefault}>
                          恢复默认
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {selectedPrompt.description && (
                <div className="prompts-editor-desc">{selectedPrompt.description}</div>
              )}

              {/* 编辑模式 */}
              {editing ? (
                <div className="prompts-edit-form">
                  <div className="prompts-edit-row">
                    <label className="llm-form-label">提示词正文 <span className="llm-required">*</span></label>
                    <textarea
                      className="sys-input prompts-content-textarea"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={20}
                      spellCheck={false}
                    />
                  </div>
                  <div className="prompts-edit-row">
                    <label className="llm-form-label">变量说明文档</label>
                    <textarea
                      className="sys-input prompts-content-textarea"
                      value={editVariablesDoc}
                      onChange={(e) => setEditVariablesDoc(e.target.value)}
                      rows={8}
                      spellCheck={false}
                    />
                  </div>
                  <div className="prompts-edit-row">
                    <label className="llm-form-label">修改说明（写入版本记录）</label>
                    <input
                      className="sys-input"
                      type="text"
                      value={editChangeNote}
                      onChange={(e) => setEditChangeNote(e.target.value)}
                      placeholder="简述本次修改的内容与原因，便于后续回溯"
                    />
                  </div>
                  <div className="llm-form-actions">
                    <button className="sys-btn sys-btn-sm sys-btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : '保存（创建新版本）'}
                    </button>
                    <button className="sys-btn sys-btn-sm" onClick={handleCancelEdit} disabled={saving}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prompts-view-mode">
                  {/* 提示词正文 */}
                  <div className="prompts-content-section">
                    <h4 className="prompts-section-title">提示词正文</h4>
                    <pre className="prompts-content-pre">{selectedPrompt.content}</pre>
                  </div>

                  {/* 变量说明 */}
                  <div className="prompts-content-section">
                    <h4 className="prompts-section-title">变量说明</h4>
                    {selectedPrompt.variables_doc ? (
                      <div
                        className="prompts-variables-doc"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedPrompt.variables_doc) }}
                      />
                    ) : (
                      <div className="sys-empty">暂无变量说明</div>
                    )}
                  </div>

                  {/* 实时预览（拼接 Skill 指南后的完整 System Prompt 样例） */}
                  <div className="prompts-content-section">
                    <h4 className="prompts-section-title">
                      实时预览
                      <span className="prompts-preview-hint">（下方为系统提示词与样例 Skill 指南拼接后的完整 System Prompt）</span>
                    </h4>
                    <pre className="prompts-content-pre prompts-preview-pre">
{selectedPrompt.content}

{SAMPLE_SKILL_PROMPT}
                    </pre>
                  </div>
                </div>
              )}

              {/* 版本控制面板 */}
              {showVersionPanel && !editing && (
                <div className="prompts-versions-panel">
                  <h4 className="prompts-section-title">
                    历史版本
                    <span className="prompts-preview-hint">（共 {versionsTotal} 个版本，当前为 v{selectedPrompt.version}）</span>
                  </h4>
                  {versionsLoading ? (
                    <div className="sys-loading">加载中...</div>
                  ) : versions.length === 0 ? (
                    <div className="sys-empty">暂无历史版本</div>
                  ) : (
                    <>
                      <table className="sys-table prompts-versions-table">
                        <thead>
                          <tr>
                            <th>版本</th><th>修改时间</th><th>修改人</th><th>修改说明</th><th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((v) => (
                            <Fragment key={v.id}>
                              <tr
                                className={`prompts-version-row${v.version === selectedPrompt.version ? ' current' : ''}`}
                              >
                                <td>
                                  v{v.version}
                                  {v.version === selectedPrompt.version && (
                                    <span className="sys-badge sys-badge-active" style={{ marginLeft: 6 }}>当前</span>
                                  )}
                                </td>
                                <td>{v.created_at ? new Date(v.created_at).toLocaleString('zh-CN') : '-'}</td>
                                <td>{v.changed_by_username || '-'}</td>
                                <td className="llm-history-summary">{v.change_note || '-'}</td>
                                <td>
                                  <button
                                    className="sys-btn sys-btn-sm"
                                    onClick={() => setCompareVersionId(compareVersionId === v.id ? null : v.id)}
                                  >
                                    {compareVersionId === v.id ? '隐藏内容' : '查看内容'}
                                  </button>
                                  {v.version !== selectedPrompt.version && (
                                    <button
                                      className="sys-btn sys-btn-sm sys-btn-primary"
                                      onClick={() => handleRollback(v)}
                                    >
                                      回滚到此版本
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {compareVersionId === v.id && (
                                <tr className="prompts-version-detail-row">
                                  <td colSpan={5}>
                                    <div className="prompts-version-detail">
                                      <div className="prompts-version-detail-label">版本 v{v.version} 内容：</div>
                                      <pre className="prompts-content-pre">{v.content}</pre>
                                      {v.variables_doc && (
                                        <>
                                          <div className="prompts-version-detail-label" style={{ marginTop: 12 }}>变量说明：</div>
                                          <pre className="prompts-content-pre">{v.variables_doc}</pre>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                      {versionsTotal > 20 && (
                        <div className="sys-pagination">
                          <button className="sys-btn sys-btn-sm" disabled={versionsPage <= 1} onClick={() => setVersionsPage(p => p - 1)}>上一页</button>
                          <span>{versionsPage} / {Math.ceil(versionsTotal / 20)}</span>
                          <button className="sys-btn sys-btn-sm" disabled={versionsPage >= Math.ceil(versionsTotal / 20)} onClick={() => setVersionsPage(p => p + 1)}>下一页</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="确认"
        cancelText="取消"
        danger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((s) => ({ ...s, open: false }))}
      />
    </div>
  )
}
