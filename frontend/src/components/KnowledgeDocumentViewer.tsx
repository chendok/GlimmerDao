import { useState, useEffect, useRef } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API_BASE } from '../utils/constants'

interface DocumentContent {
  id: number
  title: string
  content_text: string | null
  content_markdown: string | null
  pages: { page_number: number; content_text: string; image_url?: string | null }[]
  depth_level: number
  page_count: number
  file_type: string
  file_url: string
  is_public?: boolean
}

interface Props {
  documentId: number
  onClose: () => void
  token: string | null
}

export default function KnowledgeDocumentViewer({ documentId, onClose, token }: Props) {
  const [content, setContent] = useState<DocumentContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [depth, setDepth] = useState(2)
  const [currentPage, setCurrentPage] = useState(1)
  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  // 私有文档原始文件通过 fetch+Authorization 头获取后转为 blob URL（img/iframe 无法发送自定义请求头）
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null)
  const [fileLoadError, setFileLoadError] = useState<string | null>(null)
  const [slideBlobUrls, setSlideBlobUrls] = useState<Record<number, string>>({})
  const [slideLoadError, setSlideLoadError] = useState<string | null>(null)
  const [maximized, setMaximized] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // ref 同步跟踪当前 blob URL，用于卸载时清理（避免 StrictMode 双重执行 [fileBlobUrl] 依赖 effect 导致提前 revoke）
  const fileBlobUrlRef = useRef<string | null>(null)

  // 加载文档内容 + 保存学习进度（合并为一个 effect，避免重复请求）
  // useRef 防护：防止 React.StrictMode 开发模式下挂载时双重执行导致重复请求
  const loadingRef = useRef(false)
  useEffect(() => {
    if (loadingRef.current) return
    loadingRef.current = true

    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(
          `${API_BASE}/knowledge/documents/${documentId}/content?page=${currentPage}&depth=${depth}`
        )
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`服务器返回错误 (${res.status}): ${text || res.statusText}`)
        }
        const data = await res.json()
        setContent(data)
        // 内容加载成功后保存学习进度（只保存一次，避免 content 依赖导致的重复触发）
        if (token) {
          const progress = data.page_count > 0
            ? Math.round((currentPage / data.page_count) * 100)
            : 100
          fetch(`${API_BASE}/knowledge/learning/progress`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              document_id: documentId,
              current_page: currentPage,
              progress_percentage: progress,
              depth_level: depth,
            }),
          }).catch(() => {})
        }
      } catch (e: unknown) {
        console.error('[DocumentViewer] 加载内容失败:', e)
        setLoadError(getErrorMessage(e) || '加载失败')
      } finally {
        setLoading(false)
        loadingRef.current = false
      }
    }
    load()
  }, [documentId, currentPage, depth, token])

  // 私有文档：通过 Authorization 头获取原始文件并转为 blob URL
  // （<img>/<iframe> 无法携带自定义请求头，公开文档可直接用 file_url）
  useEffect(() => {
    setFileLoadError(null)

    if (!content) return

    const isNativeType = ['image', 'pdf', 'html'].includes(content.file_type)
    if (!isNativeType) return

    // 公开文档：直接使用 file_url，浏览器可无鉴权加载
    if (content.is_public !== false) return

    // 私有文档：必须携带 token 才能访问
    if (!token) {
      setFileLoadError('该文档为私有，请先登录后查看')
      return
    }

    let revoked = false
    const fullUrl = content.file_url.startsWith('http')
      ? content.file_url
      : `${API_BASE}/knowledge/documents/${content.id}/file`

    fetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const msg = res.status === 403 ? '无权访问该私有文档' : `文件加载失败 (${res.status})`
          throw new Error(msg)
        }
        return res.blob()
      })
      .then((blob) => {
        if (revoked) return
        // 先创建新 URL 并更新 state，再释放旧 URL
        // 避免提前 revoke 导致正在加载的 iframe 触发 ERR_ABORTED / ERR_FILE_NOT_FOUND
        const newUrl = URL.createObjectURL(blob)
        const oldUrl = fileBlobUrlRef.current
        fileBlobUrlRef.current = newUrl
        setFileBlobUrl(newUrl)
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl)
        }
      })
      .catch((e) => {
        if (!revoked) setFileLoadError(getErrorMessage(e) || '文件加载失败')
      })

    return () => {
      revoked = true
    }
  }, [content, token])

  // 私有 PPT 文档：加载幻灯片图片 blob URLs
  useEffect(() => {
    setSlideLoadError(null)
    setSlideBlobUrls({})

    if (!content || content.file_type !== 'pptx' || content.is_public !== false) return
    if (!token) {
      setSlideLoadError('该文档为私有，请先登录后查看')
      return
    }

    let revoked = false
    const slidePages = content.pages.filter(p => p.image_url)
    const urls: Record<number, string> = {}

    Promise.all(
      slidePages.map(async (p) => {
        const fullUrl = p.image_url!.startsWith('http')
          ? p.image_url!
          : `${API_BASE}/knowledge/documents/${content.id}/slides/${p.page_number}/image`
        try {
          const res = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) throw new Error(`Slide ${p.page_number} load failed`)
          const blob = await res.blob()
          if (!revoked) {
            urls[p.page_number] = URL.createObjectURL(blob)
          }
        } catch (e) {
          console.error(`[DocumentViewer] 幻灯片 ${p.page_number} 加载失败:`, e)
        }
      })
    ).then(() => {
      if (!revoked) setSlideBlobUrls({ ...urls })
    })

    return () => {
      revoked = true
    }
  }, [content, token])

  // 组件卸载时释放所有 blob URL
  const slideBlobUrlsRef = useRef<Record<number, string>>({})
  useEffect(() => {
    slideBlobUrlsRef.current = slideBlobUrls
  }, [slideBlobUrls])

  useEffect(() => {
    return () => {
      if (fileBlobUrlRef.current) {
        URL.revokeObjectURL(fileBlobUrlRef.current)
        fileBlobUrlRef.current = null
      }
      Object.values(slideBlobUrlsRef.current).forEach(url => {
        URL.revokeObjectURL(url)
      })
    }
  }, [])

  // 问答
  const handleSendChat = async () => {
    if (!chatMessage.trim()) return
    const msg = chatMessage.trim()
    setChatMessage('')
    setChatHistory(prev => [...prev, { role: 'user', content: msg }])

    try {
      const res = await fetch(`${API_BASE}/knowledge/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, document_id: documentId, depth }),
      })
      const data = await res.json()
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: data.message || '抱歉，暂时无法回答您的问题',
      }])
    } catch (e) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: '请求失败，请稍后重试',
      }])
    }
  }

  // 按 file_type 分流渲染内容
  const renderContent = () => {
    if (!content) return null
    const ft = content.file_type
    const md = content.content_markdown || content.content_text || ''

    // 原生渲染格式（image/pdf/html）：私有文档使用 blob URL，公开文档使用 file_url
    const isPrivate = content.is_public === false
    const nativeSrc = isPrivate ? fileBlobUrl : content.file_url

    // 私有文档加载中或失败的提示
    if (isPrivate && ['image', 'pdf', 'html'].includes(ft)) {
      if (fileLoadError) {
        return <div className="kb-empty">{fileLoadError}</div>
      }
      if (!nativeSrc) {
        return <div className="kb-loading">正在加载文件...</div>
      }
    }

    // 图片：直接显示原图
    if (ft === 'image') {
      return (
        <div className="kb-image-view">
          <img
            src={nativeSrc || undefined}
            alt={content.title}
            style={{ maxWidth: '100%', borderRadius: '4px', display: 'block', margin: '0 auto' }}
          />
          {content.content_text && (
            <div className="kb-image-caption">{content.content_text}</div>
          )}
        </div>
      )
    }

    // PDF：浏览器原生预览（隐藏工具栏的下载/打印等按钮）
    if (ft === 'pdf') {
      // #toolbar=0 隐藏工具栏，#navpanes=0 隐藏侧边导航栏（Chrome/Edge/Firefox 内置 PDF 查看器支持）
      const pdfSrc = nativeSrc ? `${nativeSrc}#toolbar=0&navpanes=0` : undefined
      return (
        <div className="kb-pdf-view">
          <iframe
            src={pdfSrc}
            style={{ width: '100%', height: '70vh', border: '0', borderRadius: '4px' }}
            title={content.title}
          />
        </div>
      )
    }

    // HTML：iframe 沙箱渲染原页面
    if (ft === 'html') {
      return (
        <div className="kb-html-view">
          <iframe
            src={nativeSrc || undefined}
            sandbox="allow-same-origin"
            style={{ width: '100%', height: '70vh', border: '0', borderRadius: '4px', background: '#fff' }}
            title={content.title}
          />
          {!isPrivate && (
            <div className="kb-native-actions">
              <a
                href={content.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="kb-btn kb-btn-sm"
              >
                在新窗口打开
              </a>
            </div>
          )}
        </div>
      )
    }

    // PPT：幻灯片图片查看器
    if (ft === 'pptx') {
      const currentSlide = content.pages.find(p => p.page_number === currentPage)
      const slideSrc = isPrivate
        ? slideBlobUrls[currentPage]
        : currentSlide?.image_url

      // 私有文档加载中
      if (isPrivate) {
        if (slideLoadError) {
          return <div className="kb-empty">{slideLoadError}</div>
        }
        if (Object.keys(slideBlobUrls).length === 0 && content.pages.some(p => p.image_url)) {
          return <div className="kb-loading">正在加载幻灯片...</div>
        }
      }

      return (
        <div className="kb-pptx-view">
          <div className="kb-pptx-slide-container">
            {slideSrc ? (
              <img
                src={slideSrc}
                alt={`幻灯片 ${currentPage}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  display: 'block',
                  margin: '0 auto',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              />
            ) : (
              <div className="kb-empty">该幻灯片无可预览图片</div>
            )}
          </div>
          {/* 幻灯片文本内容 */}
          {currentSlide?.content_text && currentSlide.content_text !== '（空白页）' && (
            <div className="kb-pptx-notes">
              <div className="kb-pptx-notes-label">幻灯片文本内容：</div>
              <div className="kb-pptx-notes-text">{currentSlide.content_text}</div>
            </div>
          )}
          {!isPrivate && (
            <div className="kb-native-actions">
              <a
                href={content.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="kb-btn kb-btn-sm"
              >
                下载原始PPT文件
              </a>
            </div>
          )}
        </div>
      )
    }

    // 其余格式：react-markdown + GFM 渲染（支持表格/列表/代码块/链接等）
    if (!md) {
      return <div className="kb-empty">文档内容为空</div>
    }
    return (
      <div className="kb-content-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </div>
    )
  }

  // 是否为原生渲染格式（无需"内容深度"控件）
  const isNativeView = content
    ? ['image', 'pdf', 'html', 'pptx'].includes(content.file_type)
    : false

  return (
    <div className={`kb-viewer-container${maximized ? ' maximized' : ''}`}>
      {/* 头部 */}
      <div className="kb-viewer-header">
        <h3>{content?.title || '加载中...'}</h3>
        <div className="kb-viewer-actions">
          <button
            className="kb-btn kb-btn-sm kb-btn-icon"
            onClick={() => setMaximized(prev => !prev)}
            title={maximized ? '还原' : '最大化'}
          >
            {maximized ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
          </button>
          <button className="kb-btn kb-btn-sm kb-btn-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 深度控制（原生渲染格式不适用） */}
      {!isNativeView && (
        <div className="kb-depth-control">
          <span className="kb-depth-label">内容深度：</span>
          {[1, 2, 3].map(d => (
            <button
              key={d}
              className={`kb-depth-btn${depth === d ? ' active' : ''}`}
              onClick={() => setDepth(d)}
            >
              {d === 1 ? '摘要' : d === 2 ? '详细' : '完整'}
            </button>
          ))}
        </div>
      )}

      {/* 内容区 */}
      <div className="kb-viewer-content">
        {loading ? (
          <div className="kb-loading">加载中...</div>
        ) : loadError ? (
          <div className="kb-error">{loadError}</div>
        ) : content ? (
          renderContent()
        ) : (
          <div className="kb-empty">文档内容为空</div>
        )}
      </div>

      {/* 分页控制 */}
      {content && content.page_count > 1 && (
        <div className="kb-page-control">
          <button
            className="kb-btn kb-btn-sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            上一页
          </button>
          <span className="kb-page-info">{currentPage} / {content.page_count}</span>
          <button
            className="kb-btn kb-btn-sm"
            disabled={currentPage >= content.page_count}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            下一页
          </button>
        </div>
      )}

      {/* AI 问答 */}
      <div className="kb-chat">
        <div className="kb-chat-header">AI 问答</div>
        <div className="kb-chat-messages">
          {chatHistory.map((msg, i) => (
            <div key={i} className={`kb-chat-msg kb-chat-msg-${msg.role}`}>
              <span className="kb-chat-role">{msg.role === 'user' ? '你' : 'AI'}</span>
              <span className="kb-chat-text">{msg.content}</span>
            </div>
          ))}
          {chatHistory.length === 0 && (
            <div className="kb-chat-hint">基于当前文档内容提问</div>
          )}
        </div>
        <div className="kb-chat-input">
          <input
            type="text"
            className="kb-input"
            placeholder="输入问题..."
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
          />
          <button className="kb-btn kb-btn-sm kb-btn-primary" onClick={handleSendChat}>发送</button>
        </div>
      </div>
    </div>
  )
}
