/**
 * 大模型配置管理页签
 *
 * 功能：
 * - 模式切换（快速 / 思考）+ 模式说明
 * - 配置列表（含生效状态醒目标识）
 * - 配置新增/编辑/删除/激活
 * - 实时配置预览
 * - 完整修改历史记录（修改人/时间/内容对比）
 *
 * 权限：仅系统管理员可访问（由外层 SystemManagementPage 守卫）。
 */
import { useState, useEffect, useCallback, Fragment } from 'react'
import { getErrorMessage } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../utils/constants'
import ConfirmDialog from './ConfirmDialog'

interface LLMMode {
  value: string
  label: string
  description: string
  default_temperature: number
  default_max_tokens: number
}

interface LLMConfig {
  id: number
  mode: string
  name: string
  model_name: string
  base_url: string
  api_key: string  // 脱敏后的展示值
  api_key_set: boolean
  temperature: number
  max_tokens: number
  is_active: boolean
  is_default: boolean
  description: string
  created_by: number | null
  created_at: string | null
  updated_by: number | null
  updated_at: string | null
}

interface LLMHistoryEntry {
  id: number
  config_id: number | null
  config_name: string | null
  mode: string | null
  action: string  // create/update/delete/activate
  before_value: string | null  // JSON
  after_value: string | null  // JSON
  change_summary: string | null
  changed_by: number | null
  changed_by_username: string | null
  created_at: string | null
}

type ModeFilter = 'fast' | 'think'

const ACTION_LABELS: Record<string, string> = {
  create: '新建',
  update: '修改',
  delete: '删除',
  activate: '激活',
}

const ACTION_BADGES: Record<string, string> = {
  create: 'sys-badge-active',
  update: 'sys-badge-admin',
  delete: 'sys-badge-inactive',
  activate: 'sys-badge-admin',
}

const EMPTY_FORM: Omit<LLMConfig, 'id' | 'is_active' | 'is_default' | 'created_by' | 'created_at' | 'updated_by' | 'updated_at' | 'api_key_set'> = {
  mode: 'fast',
  name: '',
  model_name: '',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  temperature: 0.7,
  max_tokens: 32768,
  description: '',
}

export default function LLMConfigTab() {
  const { token } = useAuth()

  // 模式切换
  const [mode, setMode] = useState<ModeFilter>('fast')
  const [modes, setModes] = useState<LLMMode[]>([])

  // 配置列表
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(false)
  const [configsError, setConfigsError] = useState('')

  // 编辑/新建表单
  const [editingId, setEditingId] = useState<number | null>(null)  // null=未编辑；'new' 用 'new' 字符串
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 历史记录
  const [history, setHistory] = useState<LLMHistoryEntry[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null)

  // 二次确认对话框
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  // ── 加载模式元信息 ──
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/system/admin/llm-configs/modes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.modes) setModes(d.modes.filter((m: LLMMode) => m.value === 'fast' || m.value === 'think'))
      })
      .catch((e) => console.error('[LLMConfig] 加载模式元信息失败:', e))
  }, [token])

  // ── 加载配置列表 ──
  const loadConfigs = useCallback(async () => {
    if (!token) return
    setConfigsLoading(true)
    setConfigsError('')
    try {
      const res = await fetch(`${API_BASE}/system/admin/llm-configs?mode=${mode}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.detail || `加载失败 (HTTP ${res.status})`)
      }
      const data = await res.json()
      setConfigs(data.items || [])
    } catch (e: unknown) {
      setConfigsError(getErrorMessage(e) || '加载配置失败')
    } finally {
      setConfigsLoading(false)
    }
  }, [token, mode])

  // ── 加载历史记录 ──
  const loadHistory = useCallback(async () => {
    if (!token) return
    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_BASE}/system/admin/llm-configs/history?mode=${mode}&page=${historyPage}&page_size=20`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setHistory(data.items || [])
      setHistoryTotal(data.total || 0)
    } catch (e) {
      console.error('[LLMConfig] 加载历史记录失败:', e)
    } finally {
      setHistoryLoading(false)
    }
  }, [token, mode, historyPage])

  useEffect(() => { loadConfigs() }, [loadConfigs])
  useEffect(() => { loadHistory() }, [loadHistory])

  // 切换模式时关闭编辑表单
  useEffect(() => {
    setEditingId(null)
    setIsNew(false)
    setForm({ ...EMPTY_FORM, mode })
    setFormErrors({})
    setActionMsg(null)
  }, [mode])

  // ── 表单校验 ──
  const validateForm = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = '配置名称不能为空'
    if (!form.model_name.trim()) errs.model_name = '模型名称不能为空'
    if (!form.base_url.trim()) errs.base_url = 'API Base URL 不能为空'
    if (form.temperature < 0 || form.temperature > 2) errs.temperature = '温度必须在 0.0 ~ 2.0 之间'
    if (form.max_tokens < 1 || form.max_tokens > 200000) errs.max_tokens = 'max_tokens 必须在 1 ~ 200000 之间'
    if (isNew && !form.api_key.trim()) errs.api_key = '新建配置时必须填写 API Key'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── 开始新建 ──
  const handleStartNew = () => {
    setIsNew(true)
    setEditingId(null)
    setForm({ ...EMPTY_FORM, mode })
    setFormErrors({})
    setActionMsg(null)
  }

  // ── 开始编辑 ──
  const handleStartEdit = (cfg: LLMConfig) => {
    setIsNew(false)
    setEditingId(cfg.id)
    setForm({
      mode: cfg.mode,
      name: cfg.name,
      model_name: cfg.model_name,
      base_url: cfg.base_url,
      api_key: '',  // 编辑时不显示原 key，留空表示不修改
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens,
      description: cfg.description,
    })
    setFormErrors({})
    setActionMsg(null)
  }

  // ── 取消编辑 ──
  const handleCancelEdit = () => {
    setIsNew(false)
    setEditingId(null)
    setForm({ ...EMPTY_FORM, mode })
    setFormErrors({})
    setActionMsg(null)
  }

  // ── 保存（新建/更新）──
  const handleSave = async () => {
    if (!token) return
    if (!validateForm()) return
    setSaving(true)
    setActionMsg(null)
    try {
      const url = isNew
        ? `${API_BASE}/system/admin/llm-configs`
        : `${API_BASE}/system/admin/llm-configs/${editingId}`
      const method = isNew ? 'POST' : 'PUT'
      // 编辑时若 api_key 为空，不传该字段（保持不变）
      const payload: Record<string, any> = { ...form }
      if (!isNew && !payload.api_key) delete payload.api_key
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.detail || `保存失败 (HTTP ${res.status})`)
      }
      setActionMsg({ type: 'success', text: data.message || '保存成功' })
      handleCancelEdit()
      await loadConfigs()
      await loadHistory()
    } catch (e: unknown) {
      setActionMsg({ type: 'error', text: getErrorMessage(e) || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  // ── 激活配置 ──
  const handleActivate = async (cfg: LLMConfig) => {
    if (!token || cfg.is_active) return
    setActionMsg(null)
    setConfirmDialog({
      open: true,
      title: '激活配置确认',
      message: `确定要激活配置「${cfg.name}」吗？同模式下其他配置将自动设为未生效，激活后立即对新的对话/报告生成生效。`,
      onConfirm: async () => {
        setConfirmDialog((s) => ({ ...s, open: false }))
        try {
          const res = await fetch(`${API_BASE}/system/admin/llm-configs/${cfg.id}/activate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await res.json().catch(() => null)
          if (!res.ok) throw new Error(data?.detail || `激活失败 (HTTP ${res.status})`)
          setActionMsg({ type: 'success', text: data.message || '激活成功' })
          await loadConfigs()
          await loadHistory()
        } catch (e: unknown) {
          setActionMsg({ type: 'error', text: getErrorMessage(e) || '激活失败' })
        }
      },
    })
  }

  // ── 删除配置 ──
  const handleDelete = async (cfg: LLMConfig) => {
    if (!token) return
    setActionMsg(null)
    setConfirmDialog({
      open: true,
      title: '删除配置确认',
      message: `确定要删除配置「${cfg.name}」吗？此操作不可恢复，但变更记录会保留在历史中。`,
      onConfirm: async () => {
        setConfirmDialog((s) => ({ ...s, open: false }))
        try {
          const res = await fetch(`${API_BASE}/system/admin/llm-configs/${cfg.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await res.json().catch(() => null)
          if (!res.ok) throw new Error(data?.detail || `删除失败 (HTTP ${res.status})`)
          setActionMsg({ type: 'success', text: data.message || '删除成功' })
          await loadConfigs()
          await loadHistory()
        } catch (e: unknown) {
          setActionMsg({ type: 'error', text: getErrorMessage(e) || '删除失败' })
        }
      },
    })
  }

  const currentModeMeta = modes.find((m) => m.value === mode)
  const editing = isNew || editingId !== null

  return (
    <div className="llm-config-tab">
      {/* 模式切换 + 说明 */}
      <div className="llm-mode-section">
        <div className="llm-mode-tabs">
          {modes.map((m) => (
            <button
              key={m.value}
              className={`llm-mode-tab${mode === m.value ? ' active' : ''}`}
              onClick={() => setMode(m.value as ModeFilter)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {currentModeMeta && (
          <div className="llm-mode-desc">
            <strong>{currentModeMeta.label}：</strong>
            {currentModeMeta.description}
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
      {configsError && (
        <div className="sys-action-error">
          <span>{configsError}</span>
          <button type="button" onClick={() => setConfigsError('')} aria-label="关闭提示">✕</button>
        </div>
      )}

      <div className="llm-config-grid">
        {/* 左侧：配置列表 */}
        <div className="llm-config-list">
          <div className="llm-list-header">
            <h3 className="llm-list-title">配置列表（{mode === 'fast' ? '快速模式' : '思考模式'}）</h3>
            <button className="sys-btn sys-btn-sm sys-btn-primary" onClick={handleStartNew} disabled={editing}>
              新增配置
            </button>
          </div>

          {configsLoading ? (
            <div className="sys-loading">加载中...</div>
          ) : configs.length === 0 ? (
            <div className="sys-empty">暂无配置，请新增</div>
          ) : (
            <div className="llm-config-cards">
              {configs.map((cfg) => (
                <div
                  key={cfg.id}
                  className={`llm-config-card${cfg.is_active ? ' active' : ''}${editingId === cfg.id ? ' editing' : ''}`}
                >
                  <div className="llm-card-header">
                    <div className="llm-card-name">
                      {cfg.name}
                      {cfg.is_default && <span className="sys-badge sys-badge-admin" style={{ marginLeft: 6 }}>默认</span>}
                      {cfg.is_active && <span className="sys-badge sys-badge-active" style={{ marginLeft: 6 }}>● 生效中</span>}
                    </div>
                    <div className="llm-card-actions">
                      {!cfg.is_active && (
                        <button className="sys-btn sys-btn-sm sys-btn-primary" onClick={() => handleActivate(cfg)}>
                          激活
                        </button>
                      )}
                      <button className="sys-btn sys-btn-sm" onClick={() => handleStartEdit(cfg)} disabled={editing}>
                        编辑
                      </button>
                      {!cfg.is_default && !cfg.is_active && (
                        <button className="sys-btn sys-btn-sm sys-btn-danger" onClick={() => handleDelete(cfg)} disabled={editing}>
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="llm-card-body">
                    <div className="llm-card-field"><span className="llm-field-label">模型</span><span className="llm-field-value">{cfg.model_name}</span></div>
                    <div className="llm-card-field"><span className="llm-field-label">Base URL</span><span className="llm-field-value">{cfg.base_url}</span></div>
                    <div className="llm-card-field"><span className="llm-field-label">API Key</span><span className="llm-field-value">{cfg.api_key_set ? cfg.api_key : '未设置'}</span></div>
                    <div className="llm-card-field-row">
                      <div className="llm-card-field"><span className="llm-field-label">温度</span><span className="llm-field-value">{cfg.temperature}</span></div>
                      <div className="llm-card-field"><span className="llm-field-label">max_tokens</span><span className="llm-field-value">{cfg.max_tokens}</span></div>
                    </div>
                    {cfg.description && <div className="llm-card-desc">{cfg.description}</div>}
                    {cfg.updated_at && (
                      <div className="llm-card-meta">
                        最后更新：{new Date(cfg.updated_at).toLocaleString('zh-CN')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：编辑表单 / 配置预览 */}
        <div className="llm-config-editor">
          {editing ? (
            <>
              <h3 className="llm-editor-title">{isNew ? '新增配置' : '编辑配置'}</h3>
              <div className="llm-form">
                <div className="llm-form-row">
                  <label className="llm-form-label">配置名称 <span className="llm-required">*</span></label>
                  <input
                    className="sys-input"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="如：生产快速模式"
                  />
                  {formErrors.name && <div className="llm-form-error">{formErrors.name}</div>}
                </div>
                <div className="llm-form-row">
                  <label className="llm-form-label">模型名称 <span className="llm-required">*</span></label>
                  <input
                    className="sys-input"
                    type="text"
                    value={form.model_name}
                    onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                    placeholder="如：gpt-4o-mini / deepseek-v4-pro"
                  />
                  {formErrors.model_name && <div className="llm-form-error">{formErrors.model_name}</div>}
                  <div className="llm-form-hint">推荐值：快速模式用 gpt-4o-mini / qwen-turbo；思考模式用 gpt-4o / deepseek-v4-pro / claude-3.5-sonnet</div>
                </div>
                <div className="llm-form-row">
                  <label className="llm-form-label">API Base URL <span className="llm-required">*</span></label>
                  <input
                    className="sys-input"
                    type="text"
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                  {formErrors.base_url && <div className="llm-form-error">{formErrors.base_url}</div>}
                </div>
                <div className="llm-form-row">
                  <label className="llm-form-label">API Key {isNew && <span className="llm-required">*</span>}</label>
                  <input
                    className="sys-input"
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    placeholder={isNew ? '请输入 API Key' : '留空表示不修改原 Key'}
                    autoComplete="off"
                  />
                  {formErrors.api_key && <div className="llm-form-error">{formErrors.api_key}</div>}
                  {!isNew && <div className="llm-form-hint">原 Key 已加密存储，留空则保持不变；输入新值将覆盖原 Key</div>}
                </div>
                <div className="llm-form-row llm-form-row-2col">
                  <div>
                    <label className="llm-form-label">温度 temperature <span className="llm-required">*</span></label>
                    <input
                      className="sys-input"
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={form.temperature}
                      onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
                    />
                    {formErrors.temperature && <div className="llm-form-error">{formErrors.temperature}</div>}
                    <div className="llm-form-hint">推荐值：快速模式 0.7；思考模式 0.3</div>
                  </div>
                  <div>
                    <label className="llm-form-label">max_tokens <span className="llm-required">*</span></label>
                    <input
                      className="sys-input"
                      type="number"
                      step="1024"
                      min="1"
                      max="200000"
                      value={form.max_tokens}
                      onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 0 })}
                    />
                    {formErrors.max_tokens && <div className="llm-form-error">{formErrors.max_tokens}</div>}
                    <div className="llm-form-hint">推荐值：32768（确保可生成万字以上报告）</div>
                  </div>
                </div>
                <div className="llm-form-row">
                  <label className="llm-form-label">描述/备注</label>
                  <textarea
                    className="sys-input llm-textarea"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="可选，记录该配置的用途与适用场景"
                    rows={3}
                  />
                </div>
                <div className="llm-form-actions">
                  <button className="sys-btn sys-btn-sm sys-btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button className="sys-btn sys-btn-sm" onClick={handleCancelEdit} disabled={saving}>
                    取消
                  </button>
                </div>
              </div>

              {/* 配置预览 */}
              <div className="llm-preview">
                <h4 className="llm-preview-title">配置预览（将发送给 LLM 的实际参数）</h4>
                <pre className="llm-preview-code">
{`{
  "model": "${form.model_name || '<未填写>'}",
  "base_url": "${form.base_url || '<未填写>'}",
  "api_key": "${form.api_key ? '****（已设置）' : isNew ? '<未填写>' : '****（保持原值）'}",
  "temperature": ${form.temperature},
  "max_tokens": ${form.max_tokens},
  "streaming": true
}`}
                </pre>
              </div>
            </>
          ) : (
            <div className="llm-editor-empty">
              <div className="llm-editor-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <p>点击右侧配置卡片的「编辑」按钮修改参数，或点击「新增配置」创建新配置。</p>
              <p className="llm-editor-empty-hint">所有修改都会写入历史记录，可随时审计追溯。</p>
            </div>
          )}
        </div>
      </div>

      {/* 配置修改历史 */}
      <div className="llm-history-section">
        <h3 className="llm-section-title">配置修改历史</h3>
        {historyLoading ? (
          <div className="sys-loading">加载中...</div>
        ) : history.length === 0 ? (
          <div className="sys-empty">暂无修改记录</div>
        ) : (
          <>
            <table className="sys-table">
              <thead>
                <tr>
                  <th>时间</th><th>配置名称</th><th>操作</th><th>修改人</th><th>变更摘要</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <Fragment key={h.id}>
                    <tr
                      className="llm-history-row"
                      onClick={() => setExpandedHistoryId(expandedHistoryId === h.id ? null : h.id)}
                    >
                      <td>{h.created_at ? new Date(h.created_at).toLocaleString('zh-CN') : '-'}</td>
                      <td>{h.config_name || '-'}</td>
                      <td>
                        <span className={`sys-badge ${ACTION_BADGES[h.action] || 'sys-badge-admin'}`}>
                          {ACTION_LABELS[h.action] || h.action}
                        </span>
                      </td>
                      <td>{h.changed_by_username || '-'}</td>
                      <td className="llm-history-summary">{h.change_summary || '-'}</td>
                    </tr>
                    {expandedHistoryId === h.id && (
                      <tr className="llm-history-detail-row">
                        <td colSpan={5}>
                          <div className="llm-history-detail">
                            <div className="llm-history-diff">
                              <div className="llm-history-diff-col">
                                <div className="llm-history-diff-title">变更前</div>
                                <pre className="llm-history-diff-code">{h.before_value ? JSON.stringify(JSON.parse(h.before_value), null, 2) : '（无）'}</pre>
                              </div>
                              <div className="llm-history-diff-col">
                                <div className="llm-history-diff-title">变更后</div>
                                <pre className="llm-history-diff-code">{h.after_value ? JSON.stringify(JSON.parse(h.after_value), null, 2) : '（无）'}</pre>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {historyTotal > 20 && (
              <div className="sys-pagination">
                <button className="sys-btn sys-btn-sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>上一页</button>
                <span>{historyPage} / {Math.ceil(historyTotal / 20)}</span>
                <button className="sys-btn sys-btn-sm" disabled={historyPage >= Math.ceil(historyTotal / 20)} onClick={() => setHistoryPage(p => p + 1)}>下一页</button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="确认"
        cancelText="取消"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((s) => ({ ...s, open: false }))}
      />
    </div>
  )
}
