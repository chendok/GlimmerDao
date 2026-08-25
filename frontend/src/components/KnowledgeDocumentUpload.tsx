import { useState, useRef } from 'react'
import { getErrorMessage } from '../utils/helpers'
import { API_BASE } from '../utils/constants'
import { useAuth } from '../context/AuthContext'

interface Props {
  isPersonal: boolean
  token: string | null
  onSuccess: () => void
  onClose: () => void
  selectedCategoryId: number | null
  selectedCategoryName: string | null
}

/** 从文本中提取简介（取前 100 字） */
function extractDescription(text: string): string {
  if (!text) return ''
  // 去除多余空白，合并换行
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 100) return cleaned
  // 截取前 100 字，尽量在句末截断
  const truncated = cleaned.substring(0, 100)
  const lastPeriod = Math.max(truncated.lastIndexOf('。'), truncated.lastIndexOf('.'), truncated.lastIndexOf('！'), truncated.lastIndexOf('？'))
  if (lastPeriod > 50) return truncated.substring(0, lastPeriod + 1)
  return truncated + '…'
}

/** 从文本中提取作者（优先匹配常见的作者标记模式） */
function extractAuthor(text: string): string {
  if (!text) return ''
  // 1. 匹配 Markdown 元数据: author: xxx
  const mdAuthor = text.match(/author:\s*(.+)/i)
  if (mdAuthor) return mdAuthor[1].trim()

  // 2. 匹配 "作者：xxx" / "作者: xxx" / "Author: xxx"
  const authorPattern = text.match(/(?:作者|Author|原著|编著|著)[：:]\s*(.+)/i)
  if (authorPattern) return authorPattern[1].trim().substring(0, 50)

  // 3. 匹配 "（作者：xxx）" 或 "（著）"
  const parenAuthor = text.match(/[（(]作者[：:](.+?)[）)]/)
  if (parenAuthor) return parenAuthor[1].trim().substring(0, 50)

  return ''
}

export default function KnowledgeDocumentUpload({ isPersonal, token, onSuccess, onClose, selectedCategoryId, selectedCategoryName }: Props) {
  const { openLoginModal } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [error, setError] = useState('')
  const [contentText, setContentText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setTitle(f.name.replace(/\.[^.]+$/, ''))

    // 预解析文件，提取简介和作者
    setPreviewing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', f)

      const res = await fetch(`${API_BASE}/knowledge/documents/preview`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        if (data.content_text) {
          setContentText(data.content_text)
          const desc = extractDescription(data.content_text)
          const auth = extractAuthor(data.content_text)
          setDescription(desc)
          setAuthor(auth)
        }
      }
    } catch (e) {
      // 预解析失败不影响上传流程
      console.warn('[Upload] 预解析失败:', e)
    } finally {
      setPreviewing(false)
    }
  }

  const handleAiParse = async () => {
    if (!file) {
      setError('请先选择文件')
      return
    }
    setAiParsing(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_BASE}/knowledge/documents/preview/ai-summary`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        if (data.description) setDescription(data.description)
        if (data.author) setAuthor(data.author)
      } else {
        setError(data.message || 'AI 解析失败')
      }
    } catch (e) {
      console.error('[Upload] AI 解析失败:', e)
      setError('AI 解析请求失败，请重试')
    } finally {
      setAiParsing(false)
    }
  }

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError('请选择文件并填写标题')
      return
    }
    if (!token) {
      openLoginModal()
      return
    }

    setUploading(true)
    setError('')

    try {
      const endpoint = isPersonal
        ? `${API_BASE}/knowledge/personal/documents`
        : `${API_BASE}/knowledge/admin/documents`

      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title.trim())
      if (selectedCategoryId) formData.append('category_id', String(selectedCategoryId))
      if (description) formData.append('description', description)
      if (author) formData.append('author', author)
      formData.append('depth_level', '2')

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json().catch(() => ({ detail: '上传失败' }))
        setError(data.detail || data.message || '上传失败')
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kb-modal-header">
          <h3>上传文档</h3>
          <button className="kb-btn kb-btn-sm" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="kb-modal-body">
          {error && <div className="kb-error">{error}</div>}

          {/* 文件选择 */}
          <div className="kb-form-group">
            <label className="kb-label">选择文件</label>
            <div className="kb-file-upload-area" onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
                fileInputRef.current.click()
              }
            }}>
              {file ? (
                <span className="kb-file-name">
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  {previewing && <span className="kb-spinner" style={{ marginLeft: 8 }} />}
                </span>
              ) : (
                <span className="kb-file-placeholder">点击选择文件（支持 PDF/Word/Markdown/TXT/Excel/PPT/ePub/图片）</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.md,.txt,.xls,.xlsx,.ppt,.pptx,.epub,.mobi,.html,.htm,.jpg,.jpeg,.png,.gif,.bmp,.webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* 标题 */}
          <div className="kb-form-group">
            <label className="kb-label">文档标题</label>
            <input
              type="text"
              className="kb-input"
              placeholder="输入文档标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* 分类信息（自动关联，不可编辑） */}
          <div className="kb-form-group">
            <label className="kb-label">所属分类</label>
            {selectedCategoryId ? (
              <div className="kb-input" style={{ background: 'var(--accent-bg, rgba(79,195,247,0.1))', borderColor: 'var(--accent-color, #4fc3f7)', cursor: 'default' }}>
                {selectedCategoryName || `分类 #${selectedCategoryId}`}
              </div>
            ) : (
              <div className="kb-error" style={{ marginBottom: 0 }}>
                请先在左侧分类树中选择一个分类，再上传文档
              </div>
            )}
          </div>

          {/* 简介（自动提取，可编辑） */}
          <div className="kb-form-group">
            <label className="kb-label">
              简介
              {previewing && <span className="kb-spinner" style={{ marginLeft: 6 }} />}
              {file && (
                <button
                  type="button"
                  className="kb-btn kb-btn-sm kb-ai-parse-btn"
                  onClick={handleAiParse}
                  disabled={aiParsing}
                  title="使用 AI 智能提取简介和作者"
                >
                  {aiParsing ? (
                    <>AI 解析中…</>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a4 4 0 0 1 4 4v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z" />
                        <circle cx="12" cy="14" r="1.5" />
                      </svg>
                      AI 解析
                    </>
                  )}
                </button>
              )}
            </label>
            <textarea
              className="kb-input kb-textarea"
              placeholder={previewing ? '正在自动提取…' : '文档简介（80字以内）'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* 作者（自动提取，可编辑） */}
          <div className="kb-form-group">
            <label className="kb-label">
              作者
              {previewing && <span className="kb-spinner" style={{ marginLeft: 6 }} />}
            </label>
            <input
              type="text"
              className="kb-input"
              placeholder={previewing ? '正在自动提取…' : '作者'}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

        </div>

        <div className="kb-modal-footer">
          <button className="kb-btn" onClick={onClose}>取消</button>
          <button className="kb-btn kb-btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  )
}
