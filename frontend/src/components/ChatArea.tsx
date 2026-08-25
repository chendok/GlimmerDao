import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatContext } from '../hooks/useChatContext'
import type { FeatureKey } from '../context/ChatContext'
import Icon from './Icon'

interface ChatAreaProps {
  onSelectFeature: (feature: FeatureKey) => void
}

// 思考过程块（含工具调用）
function ThinkingBlock({
  content,
  isStreaming,
  toolCalls,
  toolResults,
}: {
  content: string
  isStreaming: boolean
  toolCalls?: { name: string; args: Record<string, unknown> }[]
  toolResults?: { name: string; output: string }[]
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const wasStreamingRef = useRef(isStreaming)

  useEffect(() => {
    if (!collapsed) {
      const el = contentRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [content, collapsed])

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setCollapsed(true)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  const handleCopy = async () => {
    const text = content || ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const hasTools = toolCalls && toolCalls.length > 0
  const hasContent = content && content.trim() !== ''

  return (
    <div className="thinking-block">
      <div
        className="thinking-header"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsed((c) => !c) }}
      >
        <span className="thinking-icon">✦</span>
        <span className="thinking-title">思考过程</span>
        {hasTools && <span className="thinking-tools-badge">{toolCalls!.length} 次工具调用</span>}
        {hasContent && !collapsed && (
          <button
            type="button"
            className={`thinking-copy-btn ${copied ? 'copied' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            aria-label={copied ? '已复制' : '复制思考过程'}
            title={copied ? '已复制' : '复制思考过程'}
          >
            {copied ? (
              <Icon name="check" size={14} />
            ) : (
              <Icon name="copy" size={14} />
            )}
          </button>
        )}
        <span className={`thinking-chevron ${collapsed ? '' : 'open'}`}>▶</span>
      </div>
      {!collapsed && (
        <div className="thinking-content" ref={contentRef}>
          {content && <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>}
          {hasTools && toolCalls!.map((tc, i) => (
            <ToolCallBlock
              key={i}
              name={tc.name}
              args={tc.args}
              output={toolResults?.[i]?.output}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 工具调用展示
function ToolCallBlock({ name, args, output }: { name: string; args: Record<string, unknown>; output?: string }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="tool-call-block">
      <div
        className="tool-call-header"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
      >
        <span className="tool-call-icon">🔧</span>
        <span className="tool-call-name">调用工具：{name}</span>
        <span className={`tool-call-chevron ${expanded ? 'open' : ''}`}>▶</span>
      </div>
      {expanded && (
        <div className="tool-call-body">
          <div className="tool-call-section">
            <span className="tool-call-label">参数：</span>
            <code className="tool-call-code">{JSON.stringify(args, null, 2)}</code>
          </div>
          {output && (
            <div className="tool-call-section">
              <span className="tool-call-label">结果：</span>
              <code className="tool-call-code">{output}</code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChatArea({ onSelectFeature: _onSelectFeature }: ChatAreaProps) {
  const {
    messages, loading, chatWindowRef,
    copyToClipboard, sendMessage,
  } = useChatContext()

  const isWelcome = messages.length === 0
  // 用户是否停留在底部附近：仅当靠近底部时才自动跟随滚动，避免翻阅历史时被强拉回底部
  const isNearBottomRef = useRef(true)

  // 监听滚动，更新"是否在底部"状态
  useEffect(() => {
    const el = chatWindowRef.current
    if (!el) return
    const onScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [chatWindowRef])

  // 自动滚动（仅当用户在底部附近时跟随）
  useEffect(() => {
    if (chatWindowRef.current && isNearBottomRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight
    }
  }, [messages, chatWindowRef])

  return (
    <div className="chat-area" ref={chatWindowRef}>
      {isWelcome ? (
        <div className="welcome-screen">
          <div className="welcome-greeting">
            {/* Breathing shimmer sparkle */}
            <div className="gemini-sparkle-wrap">
              <span className="gemini-sparkle-aura" />
              <span className="gemini-sparkle-aura gemini-sparkle-aura--inner" />
              <svg className="gemini-sparkle" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="sparkleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="45%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#f472b6" />
                  </linearGradient>
                  <radialGradient id="sparkleCore" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="60%" stopColor="#ffffff" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <g className="gemini-sparkle-star">
                  <path
                    d="M20 3C20 3 22.2 14.8 22.2 18.8C22.2 22.2 24.2 24 28 24C32 24 37 26.2 37 26.2C37 26.2 33 28.4 29.6 28.4C25.8 28.4 22.2 30.2 22.2 33.8C22.2 37.4 20 37 20 37C20 37 17.8 37.4 17.8 33.8C17.8 30.2 14.2 28.4 10.4 28.4C7 28.4 3 26.2 3 26.2C3 26.2 8 24 12 24C15.8 24 17.8 22.2 17.8 18.8C17.8 14.8 20 3 20 3Z"
                    fill="url(#sparkleGrad)"
                  />
                  <circle cx="20" cy="26" r="7" fill="url(#sparkleCore)" className="gemini-sparkle-core" />
                </g>
                <g className="gemini-sparkle-twinkle" opacity="0">
                  <path d="M30 10L30.8 13.2L34 14L30.8 14.8L30 18L29.2 14.8L26 14L29.2 13.2L30 10Z" fill="#ffffff" />
                </g>
                <g className="gemini-sparkle-twinkle gemini-sparkle-twinkle--alt" opacity="0">
                  <path d="M11 7L11.5 9L13.5 9.5L11.5 10L11 12L10.5 10L8.5 9.5L10.5 9L11 7Z" fill="#ffffff" />
                </g>
              </svg>
            </div>
            <h1 className="welcome-title">
              问道
            </h1>
          </div>
          <p className="welcome-subtitle">你的 AI 命理助手，探索传统文化奥秘</p>
        </div>
      ) : (
        <div className="messages-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="avatar avatar-ai">
                  <span className="ai-star-icon">✦</span>
                </div>
              )}

              <div className={`message-content ${msg.role}`}>
                {msg.role === 'user' ? (
                  <p className="user-text">{msg.content}</p>
                ) : (
                  <>
                    {(msg.thinking || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                      <ThinkingBlock
                        content={msg.thinking || ''}
                        isStreaming={loading && msg === messages[messages.length - 1]}
                        toolCalls={msg.toolCalls}
                        toolResults={msg.toolResults}
                      />
                    )}

                    {msg.content ? (
                      <div className="assistant-text">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : loading && msg === messages[messages.length - 1] ? (
                      <div className="thinking-dots">
                        <span className="dot" /><span className="dot" /><span className="dot" />
                      </div>
                    ) : null}

                    {msg.content && msg.role === 'assistant' && (
                      <div className="assistant-actions">
                        <button
                          type="button"
                          className="assistant-action-btn"
                          onClick={() => copyToClipboard(msg.content)}
                          aria-label="复制回答"
                          title="复制回答"
                        >
                          <Icon name="copy" size={16} />
                        </button>
                      </div>
                    )}

                    {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && !loading && (
                      <div className="suggestion-chips">
                        {msg.suggestions.map((q, i) => (
                          <button
                            key={i}
                            type="button"
                            className="suggestion-chip"
                            onClick={() => sendMessage(q)}
                            title={`点击追问：${q}`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {loading && (() => {
            const last = messages[messages.length - 1]
            return !last || last.role !== 'assistant'
          })() && (
            <div className="message-row assistant">
              <div className="avatar avatar-ai">
                <span className="ai-star-icon">✦</span>
              </div>
              <div className="thinking-dots">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}