import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../utils/constants'
import LoginPrompt from './LoginPrompt'

interface Progress {
  id: number
  document_id: number
  document_title: string | null
  current_page: number
  progress_percentage: number
  depth_level: number
  notes: string | null
  last_read_at: string | null
}

export default function KnowledgeLearningPanel() {
  const { token, isLoggedIn } = useAuth()
  const [progresses, setProgresses] = useState<Progress[]>([])
  const [loading, setLoading] = useState(false)

  const loadProgress = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/knowledge/learning/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setProgresses(data.items || [])
    } catch (e) {
      console.error('[LearningPanel] 加载进度失败:', e)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadProgress()
  }, [loadProgress])

  if (!isLoggedIn) {
    return (
      <div className="kb-learning-panel">
        <LoginPrompt />
      </div>
    )
  }

  return (
    <div className="kb-learning-panel">
      <h3 className="kb-section-title">学习记录</h3>

      {loading ? (
        <div className="kb-loading">加载中...</div>
      ) : progresses.length === 0 ? (
        <div className="kb-empty">
          <p>暂无学习记录</p>
          <p className="kb-hint">在知识库中阅读文档即可自动记录学习进度</p>
        </div>
      ) : (
        <div className="kb-learning-list">
          {progresses.map((p) => (
            <div key={p.id} className="kb-learning-item">
              <div className="kb-learning-info">
                <span className="kb-learning-title">{p.document_title || `文档 #${p.document_id}`}</span>
                <div className="kb-learning-meta">
                  <span>深度: {p.depth_level === 1 ? '摘要' : p.depth_level === 2 ? '详细' : '完整'}</span>
                  <span>页码: {p.current_page}</span>
                  <span>进度: {p.progress_percentage}%</span>
                  {p.last_read_at && (
                    <span className="kb-learning-time">
                      {new Date(p.last_read_at).toLocaleString('zh-CN')}
                    </span>
                  )}
                </div>
              </div>
              <div className="kb-progress-bar">
                <div className="kb-progress-fill" style={{ width: `${p.progress_percentage}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}