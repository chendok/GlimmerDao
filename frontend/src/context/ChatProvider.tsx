import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { ChatContext } from './ChatContext'
import type { ChatContextValue } from './ChatContext'
import type { FeatureKey } from './ChatContext'
import type { Message, SessionInfo, SessionMessageInfo, Theme, ModelMode } from '../types'
import { useAuth } from './AuthContext'
import { uuid, getErrorMessage } from '../utils/helpers'
import { API_BASE } from '../utils/constants'

const SESSIONS_PAGE_SIZE = 20

export function ChatProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('wendao-theme') as Theme) ?? 'dark'
  )
  const [sessionId, setSessionId] = useState(() => uuid())
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsHasMore, setSessionsHasMore] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsPage, setSessionsPage] = useState(1)
  const [sessionsSearch, setSessionsSearch] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modelMode, setModelMode] = useState<ModelMode>('fast')
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey | null>(null)

  const chatWindowRef = useRef<HTMLDivElement>(null!)
  const abortControllerRef = useRef<AbortController | null>(null)
  // 用于防抖搜索
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 请求代数：每次 token 变化时递增，fetch 完成后校验代数，防止旧请求覆盖新结果
  const fetchGenRef = useRef(0)
  // 会话列表请求的 AbortController，用于取消过期请求
  const sessionsAbortRef = useRef<AbortController | null>(null)
  // 最近一次专题对话的上下文 + skillId，供推荐问题点击追问时自动复用，
  // 确保追问仍携带当前排盘结果与对应 skill，回答保持一致。
  const lastContextRef = useRef<{ contextData?: string; skillId?: string }>({})

  // ── 加载会话列表（分页 + 搜索，同时支持匿名和已登录用户）──
  const fetchSessions = useCallback(async (page: number, q: string, append: boolean, signal?: AbortSignal) => {
    const gen = fetchGenRef.current
    setSessionsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(SESSIONS_PAGE_SIZE),
      })
      if (q) params.set('q', q)
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_BASE}/sessions/?${params.toString()}`, { headers, signal })
      if (fetchGenRef.current !== gen) return // 请求已过期，丢弃结果
      if (!res.ok) throw new Error('加载会话失败')
      const data = await res.json()
      const newSessions: SessionInfo[] = data.sessions || []
      setSessions((prev) => (append ? [...prev, ...newSessions] : newSessions))
      setSessionsHasMore(!!data.has_more)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (fetchGenRef.current !== gen) return
      if (!append) {
        setSessions([])
        setSessionsHasMore(false)
      }
    } finally {
      if (fetchGenRef.current === gen) {
        setSessionsLoading(false)
      }
    }
  }, [token])

  const refreshSessions = useCallback(async () => {
    // 递增代数，使旧请求结果被丢弃，而非 abort 导致浏览器 net::ERR_ABORTED 噪音
    fetchGenRef.current += 1
    // 刷新时重置为第一页（用于发送消息后获取最新列表）
    setSessionsPage(1)
    await fetchSessions(1, sessionsSearch, false)
  }, [fetchSessions, sessionsSearch])

  // ── 登录后认领匿名会话 ──
  // 用户登录前以匿名身份产生的会话在 DB 中 user_id=NULL，
  // 登录后需将其绑定到当前用户，否则在历史列表中不可见。
  const claimAnonymousSessions = useCallback(async (signal?: AbortSignal) => {
    if (!token) return
    try {
      await fetch(`${API_BASE}/sessions/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // 认领失败不影响主流程
    }
  }, [token])

  // 主题持久化
  useEffect(() => {
    localStorage.setItem('wendao-theme', theme)
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  // token 变化时：先认领匿名会话，再刷新会话列表
  // 使用代数计数器而非 AbortController，避免 StrictMode 双调用 effect
  // 时 abort 引发的 net::ERR_ABORTED 浏览器日志噪音。
  // 旧请求自然完成但结果被丢弃。
  useEffect(() => {
    fetchGenRef.current += 1
    const myGen = fetchGenRef.current

    if (!token) {
      void refreshSessions()
      return
    }
    // 已登录：先认领，再刷新
    void (async () => {
      await claimAnonymousSessions()
      if (fetchGenRef.current !== myGen) return
      await refreshSessions()
    })()
  }, [token, claimAnonymousSessions, refreshSessions])

  // 发送消息
  const sendMessage = useCallback(async (content: string, contextData?: string, skillId?: string) => {
    if (!content.trim() || loading) return

    // 追问场景：未显式传入上下文时，自动复用最近一次专题对话的上下文与 skill，
    // 确保推荐问题点击后仍携带排盘结果，回答与计算结果保持一致。
    if (!contextData && lastContextRef.current.contextData) {
      contextData = lastContextRef.current.contextData
    }
    if (!skillId && lastContextRef.current.skillId) {
      skillId = lastContextRef.current.skillId
    }

    // 更新最近上下文（仅在显式携带上下文时记录，避免追问时覆盖）
    if (contextData || skillId) {
      lastContextRef.current = { contextData, skillId }
    }

    const userMsg: Message = {
      id: uuid(),
      role: 'user',
      content: content.trim(),
    }

    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    setError('')

    const assistantMsg: Message = {
      id: uuid(),
      role: 'assistant',
      content: '',
      thinking: '',
    }
    setMessages((prev) => [...prev, assistantMsg])

    const controller = new AbortController()
    abortControllerRef.current = controller

    // SSE 事件处理（局部变量，避免闭包问题）
    let currentEventType = ''
    // 标记流是否收到 done 事件（正常完成），用于优雅退出读取循环
    let streamDone = false

    const handleSSEEvent = (type: string, data: Record<string, unknown>) => {
      const msgId = assistantMsg.id
      switch (type) {
        case 'session':
          if (data.session_id) setSessionId(data.session_id as string)
          break
        case 'content':
        case 'thinking':
          // content 事件：LLM 流式输出的内容片段（新版本后端）
          // thinking 事件：兼容旧版本后端
          // 在聊天场景中，两者都作为"思考过程"显示在 ThinkingBlock 中
          // 最终回复通过 response 事件设置到 msg.content
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, thinking: (m.thinking || '') + (data.content as string || '') }
                : m
            )
          )
          break
        case 'tool_call':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls || []),
                      { name: data.name as string, args: data.args as Record<string, unknown> },
                    ],
                  }
                : m
            )
          )
          break
        case 'tool_end':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    toolResults: [
                      ...(m.toolResults || []),
                      { name: data.name as string, output: data.output as string },
                    ],
                  }
                : m
            )
          )
          break
        case 'response':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: data.content as string }
                : m
            )
          )
          break
        case 'suggestions':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, suggestions: data.questions as string[] }
                : m
            )
          )
          break
        case 'error':
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: `错误：${data.message}` }
                : m
            )
          )
          break
        case 'done':
          // 后端通知流式传输正常结束，标记以优雅退出读取循环
          streamDone = true
          break
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: content.trim(),
          session_id: sessionId,
          model_mode: modelMode,
          ...(contextData ? { context_data: contextData } : {}),
          ...(skillId ? { skill_id: skillId } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done || streamDone) break

        buffer += decoder.decode(value, { stream: true })

        // 兼容 \r\n 和 \r 行分隔符：统一替换为 \n 再分割
        const normalizedBuffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const lines = normalizedBuffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim()
            continue
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            try {
              const parsed = JSON.parse(data)
              handleSSEEvent(currentEventType || '', parsed)
            } catch {
              // 非 JSON 数据，直接作为内容追加
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + data }
                    : m
                )
              )
            }
          }
          // done 事件处理完毕后立即退出内层循环，避免处理后续无关数据
          if (streamDone) break
        }

        // 收到 done 事件后优雅关闭流，避免浏览器报告 net::ERR_ABORTED
        if (streamDone) {
          reader.cancel().catch(() => {})
          break
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 用户主动停止，或 done 事件后 reader.cancel() 触发的 AbortError
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMsg.id) return m
            // 已有内容（response 事件已到达），保持不变
            if (m.content) return m
            // 有思考内容但未收到 response 事件，使用思考内容作为回复
            if (m.thinking) return { ...m, content: m.thinking }
            return { ...m, content: '已停止生成。' }
          })
        )
      } else {
        const msg = err instanceof Error ? err.message : '未知错误'
        setError(msg)
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMsg.id) return m
            // 网络错误时，若有思考内容也作为兜底回复
            if (m.thinking) return { ...m, content: m.thinking }
            return { ...m, content: `抱歉，请求失败：${msg}` }
          })
        )
      }
    } finally {
      // 兜底：如果 response 事件未到达但有思考内容，使用思考内容作为回复
      // 覆盖流正常结束但 response 事件丢失的边缘场景
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id && !m.content && m.thinking
            ? { ...m, content: m.thinking }
            : m
        )
      )
      setLoading(false)
      abortControllerRef.current = null
      void refreshSessions()
    }
  }, [loading, modelMode, refreshSessions, sessionId, token])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const resetSession = useCallback(() => {
    setMessages([])
    setSessionId(uuid())
    setError('')
  }, [])

  // ── 切换会话：从后端加载历史消息 ──
  const switchSession = useCallback(async (s: SessionInfo) => {
    setSessionId(s.id)
    setError('')
    setLoading(true)
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API_BASE}/sessions/${s.id}/messages`, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const msgs: SessionMessageInfo[] = data.messages || []
      // 将后端消息转换为前端 Message 格式
      const mapped: Message[] = msgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: `db-${m.id}`,
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
          thinking: m.thinking || undefined,
          toolCalls: m.tool_calls || undefined,
          toolResults: m.tool_results || undefined,
        }))
      setMessages(mapped)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载历史消息失败'
      setError(msg)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [token])

  // ── 搜索会话（防抖 300ms）──
  const searchSessions = useCallback((q: string) => {
    setSessionsSearch(q)
    setSessionsPage(1)
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = setTimeout(() => {
      sessionsAbortRef.current?.abort()
      const controller = new AbortController()
      sessionsAbortRef.current = controller
      void fetchSessions(1, q, false, controller.signal)
    }, 300)
  }, [fetchSessions])

  // ── 加载更多会话（分页）──
  const loadMoreSessions = useCallback(() => {
    if (sessionsLoading || !sessionsHasMore) return
    const nextPage = sessionsPage + 1
    setSessionsPage(nextPage)
    const controller = sessionsAbortRef.current
    void fetchSessions(nextPage, sessionsSearch, true, controller?.signal)
  }, [fetchSessions, sessionsHasMore, sessionsLoading, sessionsPage, sessionsSearch])

  const deleteSession = useCallback((sid: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sid))
    if (sid === sessionId) {
      resetSession()
    }
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined
    fetch(`${API_BASE}/sessions/${sid}`, { method: 'DELETE', headers }).catch(() => {})
  }, [resetSession, sessionId, token])

  // ── 清除全部会话 ──
  const [clearingAll, setClearingAll] = useState(false)
  const clearAllSessions = useCallback(async () => {
    setClearingAll(true)
    // 递增代数，使所有正在进行的 fetchSessions 请求失效，防止竞态条件
    // 旧请求返回后覆盖清空后的状态
    fetchGenRef.current += 1
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const res = await fetch(`${API_BASE}/sessions/clear-all`, { method: 'DELETE', headers })
      if (res.ok) {
        setSessions([])
        setSessionsHasMore(false)
        return true
      }
      return false
    } catch {
      return false
    } finally {
      setClearingAll(false)
    }
  }, [token])

  const copyToClipboard = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      // fallback：旧浏览器 / 非安全上下文
      const ta = document.createElement('textarea')
      ta.value = content
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) {
        throw new Error('复制失败')
      }
    }
  }, [])

  const value: ChatContextValue = {
    theme, setTheme,
    sessionId, sessions, sessionsHasMore, sessionsLoading,
    messages, loading, error, setError,
    sendMessage, stopGeneration, resetSession,
    switchSession, deleteSession, clearAllSessions, clearingAll, copyToClipboard,
    searchSessions, loadMoreSessions,
    modelMode, setModelMode,
    selectedFeature, setSelectedFeature,
    chatWindowRef, abortControllerRef,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
