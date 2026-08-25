import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../utils/constants'
import LoginPrompt from './LoginPrompt'
import LLMConfigTab from './LLMConfigTab'
import PromptsTab from './PromptsTab'
import './SystemManagement.css'

interface UserData {
  id: number
  username: string | null
  email: string | null
  phone: string | null
  is_admin: boolean
  is_active: boolean
  is_verified: boolean
  created_at: string | null
  last_login_at: string | null
}

interface LogEntry {
  id: number
  user_id: number | null
  username: string | null
  ip_address: string | null
  device: string | null
  status: string
  failure_reason: string | null
  created_at: string | null
}

type AdminTab = 'users' | 'logs' | 'llm' | 'prompts'

// 默认管理员邮箱：该账户永远保持管理员权限，前端对其"取消管理员/禁用/删除"按钮置灰
const DEFAULT_ADMIN_EMAIL = 'chendok@163.com'
const isDefaultAdmin = (email: string | null) => !!email && email.toLowerCase() === DEFAULT_ADMIN_EMAIL

export default function SystemManagementPage() {
  const { token, user, isLoggedIn } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  // 用户管理
  const [users, setUsers] = useState<UserData[]>([])
  const [userPage, setUserPage] = useState(1)
  const [userTotal, setUserTotal] = useState(0)
  const [userLoading, setUserLoading] = useState(false)

  // 登录日志
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logPage, setLogPage] = useState(1)
  const [logTotal, setLogTotal] = useState(0)
  const [logLoading, setLogLoading] = useState(false)
  const [logStatus, setLogStatus] = useState<'all' | 'success' | 'failure' | 'logout'>('all')

  // 用户操作错误提示（用于展示后端拒绝原因，如"必须至少保留一个管理员"）
  const [actionError, setActionError] = useState('')

  // ── 数据加载（hooks 必须在任何早返回之前）──
  const loadUsers = useCallback(async () => {
    if (!token) return
    setUserLoading(true)
    try {
      const res = await fetch(`${API_BASE}/system/admin/users?page=${userPage}&page_size=20`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setUsers(data.items || [])
      setUserTotal(data.total || 0)
    } catch (e) {
      console.error('[SystemManagement] 加载用户失败:', e)
    } finally {
      setUserLoading(false)
    }
  }, [token, userPage])

  const loadLogs = useCallback(async () => {
    if (!token) return
    setLogLoading(true)
    try {
      const statusParam = logStatus !== 'all' ? `&status=${logStatus}` : ''
      const res = await fetch(`${API_BASE}/system/admin/login-logs?page=${logPage}&page_size=30${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setLogs(data.items || [])
      setLogTotal(data.total || 0)
    } catch (e) {
      console.error('[SystemManagement] 加载登录日志失败:', e)
    } finally {
      setLogLoading(false)
    }
  }, [token, logPage, logStatus])

  useEffect(() => {
    if (activeTab === 'users') loadUsers()
    else if (activeTab === 'logs') loadLogs()
  }, [activeTab, loadUsers, loadLogs])

  // ── RBAC 门禁：未登录 → 登录提示；非管理员 → 无权限提示 ──
  if (!isLoggedIn) {
    return (
      <div className="sys-page">
        <div className="sys-panel">
          <LoginPrompt />
        </div>
      </div>
    )
  }
  if (!user?.is_admin) {
    return (
      <div className="sys-page">
        <div className="sys-forbidden">
          <svg
            className="sys-forbidden-icon"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          <p className="sys-forbidden-text">权限不足，仅系统管理员可访问此模块</p>
        </div>
      </div>
    )
  }

  const handleToggleAdmin = async (userId: number, current: boolean) => {
    if (!token) return
    setActionError('')
    try {
      const res = await fetch(`${API_BASE}/system/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_admin: !current }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setActionError(data?.detail || `操作失败 (HTTP ${res.status})`)
        return
      }
      loadUsers()
    } catch (e) {
      console.error('[SystemManagement] 更新用户失败:', e)
      setActionError('网络异常，操作未完成，请检查网络连接')
    }
  }

  const handleToggleActive = async (userId: number, current: boolean) => {
    if (!token) return
    setActionError('')
    try {
      const res = await fetch(`${API_BASE}/system/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !current }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setActionError(data?.detail || `操作失败 (HTTP ${res.status})`)
        return
      }
      loadUsers()
    } catch (e) {
      console.error('[SystemManagement] 更新用户失败:', e)
      setActionError('网络异常，操作未完成，请检查网络连接')
    }
  }

  const handleDeleteUser = async (userId: number, email: string | null) => {
    if (!token) return
    if (!confirm(`确定要删除用户 ${email || userId} 吗？\n此操作将同时删除其所有关联数据且不可恢复。`)) return
    setActionError('')
    try {
      const res = await fetch(`${API_BASE}/system/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setActionError(data?.detail || `删除失败 (HTTP ${res.status})`)
        return
      }
      loadUsers()
    } catch (e) {
      console.error('[SystemManagement] 删除用户失败:', e)
      setActionError('网络异常，删除未完成，请检查网络连接')
    }
  }

  return (
    <div className="sys-page">
      {/* 顶部标题 */}
      <div className="sys-header">
        <svg
          className="sys-header-icon"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <h2 className="sys-title">系统管理</h2>
      </div>

      <div className="sys-panel">
        <div className="sys-tabs">
          <button className={`sys-tab${activeTab === 'users' ? ' active' : ''}`} onClick={() => setActiveTab('users')}>用户管理</button>
          <button className={`sys-tab${activeTab === 'logs' ? ' active' : ''}`} onClick={() => setActiveTab('logs')}>登录日志</button>
          <button className={`sys-tab${activeTab === 'llm' ? ' active' : ''}`} onClick={() => setActiveTab('llm')}>大模型</button>
          <button className={`sys-tab${activeTab === 'prompts' ? ' active' : ''}`} onClick={() => setActiveTab('prompts')}>提示词</button>
        </div>

        {/* 用户管理 */}
        {activeTab === 'users' && (
          <div className="sys-section">
            {userLoading ? (
              <div className="sys-loading">加载中...</div>
            ) : (
              <>
                {actionError && (
                  <div className="sys-action-error">
                    <span>{actionError}</span>
                    <button type="button" onClick={() => setActionError('')} aria-label="关闭提示">✕</button>
                  </div>
                )}
                <table className="sys-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>邮箱</th><th>管理员</th><th>状态</th><th>注册时间</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.email || '-'}</td>
                        <td>
                          {u.is_admin
                            ? <span className="sys-badge sys-badge-admin">管理员</span>
                            : '否'}
                        </td>
                        <td>
                          {u.is_active
                            ? <span className="sys-badge sys-badge-active">正常</span>
                            : <span className="sys-badge sys-badge-inactive">禁用</span>}
                        </td>
                        <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                        <td>
                          <button
                            className="sys-btn sys-btn-sm"
                            onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                            disabled={(u.is_admin && u.id === user?.id) || isDefaultAdmin(u.email)}
                            title={
                              u.is_admin && u.id === user?.id
                                ? '不能取消自己的管理员权限'
                                : isDefaultAdmin(u.email)
                                ? '默认管理员不能被取消权限'
                                : ''
                            }
                          >
                            {u.is_admin ? '取消管理员' : '设为管理员'}
                          </button>
                          <button
                            className="sys-btn sys-btn-sm"
                            onClick={() => handleToggleActive(u.id, u.is_active)}
                            disabled={isDefaultAdmin(u.email)}
                            title={isDefaultAdmin(u.email) ? '默认管理员不能被禁用' : ''}
                          >
                            {u.is_active ? '禁用' : '启用'}
                          </button>
                          {u.id !== user?.id && !u.is_admin && !isDefaultAdmin(u.email) && (
                            <button
                              className="sys-btn sys-btn-sm sys-btn-danger"
                              onClick={() => handleDeleteUser(u.id, u.email)}
                            >
                              删除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {userTotal > 20 && (
                  <div className="sys-pagination">
                    <button className="sys-btn sys-btn-sm" disabled={userPage <= 1} onClick={() => setUserPage(p => p - 1)}>上一页</button>
                    <span>{userPage} / {Math.ceil(userTotal / 20)}</span>
                    <button className="sys-btn sys-btn-sm" disabled={userPage >= Math.ceil(userTotal / 20)} onClick={() => setUserPage(p => p + 1)}>下一页</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 登录日志 */}
        {activeTab === 'logs' && (
          <div className="sys-section">
            <div className="sys-filter-bar">
              {(['all', 'success', 'failure', 'logout'] as const).map(s => (
                <button
                  key={s}
                  className={`sys-btn sys-btn-sm${logStatus === s ? ' sys-btn-primary' : ''}`}
                  onClick={() => { setLogStatus(s); setLogPage(1) }}
                >
                  {s === 'all' ? '全部' : s === 'success' ? '登录成功' : s === 'failure' ? '登录失败' : '登出'}
                </button>
              ))}
            </div>
            {logLoading ? (
              <div className="sys-loading">加载中...</div>
            ) : logs.length === 0 ? (
              <div className="sys-empty">暂无登录日志</div>
            ) : (
              <>
                <table className="sys-table">
                  <thead>
                    <tr>
                      <th>登录时间</th><th>用户名</th><th>登录IP</th><th>登录设备</th><th>登录状态</th><th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td>{l.created_at ? new Date(l.created_at).toLocaleString('zh-CN') : '-'}</td>
                        <td>{l.username || l.user_id || '-'}</td>
                        <td>{l.ip_address || '-'}</td>
                        <td>{l.device || '-'}</td>
                        <td>
                          {l.status === 'success' && <span className="sys-badge sys-badge-active">成功</span>}
                          {l.status === 'failure' && <span className="sys-badge sys-badge-inactive">失败</span>}
                          {l.status === 'logout' && <span className="sys-badge sys-badge-admin">登出</span>}
                        </td>
                        <td className="sys-log-details">{l.failure_reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logTotal > 30 && (
                  <div className="sys-pagination">
                    <button className="sys-btn sys-btn-sm" disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)}>上一页</button>
                    <span>{logPage} / {Math.ceil(logTotal / 30)}</span>
                    <button className="sys-btn sys-btn-sm" disabled={logPage >= Math.ceil(logTotal / 30)} onClick={() => setLogPage(p => p + 1)}>下一页</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 大模型配置管理 */}
        {activeTab === 'llm' && (
          <div className="sys-section">
            <LLMConfigTab />
          </div>
        )}

        {/* 系统提示词管理 */}
        {activeTab === 'prompts' && (
          <div className="sys-section">
            <PromptsTab />
          </div>
        )}
      </div>
    </div>
  )
}
