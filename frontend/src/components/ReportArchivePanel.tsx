import { useState, useEffect, useCallback } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactDOM from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import LoginPrompt from './LoginPrompt'
import ConfirmDialog from './ConfirmDialog'
import { convertMarkdownToHtml, downloadFile } from '../utils/markdown'

// ── 下载格式选项 ──
type DownloadFormat = 'html' | 'pdf'

// ── 类型定义 ──
interface ReportItem {
  id: number
  user_id: number
  title: string
  chart_type: string
  chart_name: string | null
  skill_name: string | null
  report_format: string
  report_content: string
  created_at: string
  updated_at: string
}

interface ReportListResponse {
  total: number
  page: number
  page_size: number
  items: ReportItem[]
}

// ── 获取 Token ──
function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

interface ReportArchivePanelProps {
  /** 指定档案ID时，仅展示该档案的报告；不传则展示当前用户全部报告 */
  archiveId?: number
  /** 档案名称，用于在标题中展示筛选来源 */
  archiveName?: string
  /** 嵌入模式：隐藏 header/搜索/筛选器，仅展示列表和详情 */
  embedded?: boolean
}

export default function ReportArchivePanel({ archiveId, archiveName, embedded }: ReportArchivePanelProps) {
  // ── 排盘类型显示标签 → 数据库 chart_type 值映射 ──
  // 注：六爻占卜和梅花易数不在档案库中保存报告，故不列入
  const CHART_TYPE_LABELS: Record<string, string> = {
    '四柱八字': '八字',
    '紫微斗数': '紫微',
    '麻衣神相': '麻衣神相',
    '黄历择吉': '黄历择吉',
  }
  // 反向映射：chart_type 值 → 显示标签
  const CHART_TYPE_REVERSE: Record<string, string> = Object.fromEntries(
    Object.entries(CHART_TYPE_LABELS).map(([k, v]) => [v, k])
  )
  const CHART_TYPE_DISPLAY_LABELS = Object.keys(CHART_TYPE_LABELS)

  const { isLoggedIn } = useAuth()
  const [reports, setReports] = useState<ReportItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [chartTypeFilter, setChartTypeFilter] = useState<string>('')
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null)
  const [editingReport, setEditingReport] = useState<ReportItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    reportId: number | null
    title: string
    message: string
  }>({ open: false, reportId: null, title: '', message: '' })
  const [deleting, setDeleting] = useState(false)
  // ── 下载格式选择弹窗状态 ──
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [downloadTarget, setDownloadTarget] = useState<ReportItem | null>(null)
  const [downloading, setDownloading] = useState(false)
  const PAGE_SIZE = 20

  // ── 加载报告列表 ──
  const fetchReports = useCallback(async (kw?: string, ct?: string, p?: number) => {
    const token = getToken()
    if (!token) {
      setReports([])
      setTotal(0)
      return
    }

    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.append('page', String(p || page))
      params.append('page_size', String(PAGE_SIZE))
      if (kw) params.append('keyword', kw)
      if (ct) params.append('chart_type', CHART_TYPE_LABELS[ct] || ct)
      // 按档案ID筛选
      if (archiveId) {
        params.append('archive_id', String(archiveId))
      }

      const res = await fetch(`${API_BASE}/reports/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        throw new Error('登录已过期，请重新登录后查看')
      }
      if (!res.ok) throw new Error(`加载失败 (HTTP ${res.status})`)
      const data: ReportListResponse = await res.json()
      setReports(data.items)
      setTotal(data.total)
    } catch (e: unknown) {
      setReports([])
      setTotal(0)
      setError(getErrorMessage(e) || '加载报告失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }, [page, archiveId])

  useEffect(() => {
    if (isLoggedIn) {
      // 当 archiveId 变化时，重置到第1页
      setPage(1)
      fetchReports(searchKeyword, chartTypeFilter, 1)
    }
  }, [isLoggedIn, page, chartTypeFilter, fetchReports, archiveId])

  // ── 搜索 ──
  const handleSearch = () => {
    setSearchKeyword(searchInput)
    setPage(1)
    fetchReports(searchInput, chartTypeFilter, 1)
  }

  // ── 删除报告：打开确认弹窗 ──
  const handleDelete = (id: number) => {
    const target = reports.find((r) => r.id === id)
    const reportTitle = target?.title || '该报告'
    setConfirmDialog({
      open: true,
      reportId: id,
      title: '删除解盘报告',
      message: `确定要删除「${reportTitle}」吗？此报告将被永久移除，无法恢复。`,
    })
  }

  // ── 确认删除：实际执行 ──
  const confirmDelete = async () => {
    const id = confirmDialog.reportId
    if (id === null) return
    const token = getToken()
    if (!token) {
      setError('登录状态已失效，请重新登录后再操作')
      setConfirmDialog((prev) => ({ ...prev, open: false }))
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`${API_BASE}/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        throw new Error('登录已过期，请重新登录后再操作')
      }
      if (res.status === 404) {
        throw new Error('报告不存在或已被删除')
      }
      if (!res.ok) throw new Error(`删除失败 (HTTP ${res.status})`)

      // 删除成功：更新本地状态并重新加载列表
      setReports((prev) => prev.filter((r) => r.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      if (selectedReport?.id === id) setSelectedReport(null)
      setConfirmDialog((prev) => ({ ...prev, open: false }))
      // 重新加载以确保与后端同步
      fetchReports(searchKeyword, chartTypeFilter, page)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '删除失败，请检查网络连接')
      setConfirmDialog((prev) => ({ ...prev, open: false }))
    } finally {
      setDeleting(false)
    }
  }

  // ── 更新报告 ──
  const handleUpdate = async () => {
    if (!editingReport) return
    const token = getToken()
    if (!token) return

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/reports/${editingReport.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle,
          report_content: editContent,
        }),
      })
      if (!res.ok) throw new Error('更新失败')
      const updated: ReportItem = await res.json()
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setEditingReport(null)
      setSelectedReport(updated)
    } catch {
      setError('更新失败')
    } finally {
      setSaving(false)
    }
  }

  // ── 下载报告：打开格式选择弹窗 ──
  const handleDownload = (report: ReportItem) => {
    setDownloadTarget(report)
    setDownloadModalOpen(true)
  }

  // ── 执行 HTML 下载 ──
  const handleDownloadHtml = () => {
    const report = downloadTarget
    if (!report) return
    const dateStr = new Date(report.created_at).toLocaleDateString('en-CA')
    const safeName = report.chart_name || '命主'
    const fileName = `${safeName}_${CHART_TYPE_REVERSE[report.chart_type] || report.chart_type}_${report.skill_name || '解盘'}_${dateStr}`
    const reportHtml = convertMarkdownToHtml(report.report_content)

    const content = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${report.title}</title>
<style>body{max-width:900px;margin:0 auto;padding:40px 20px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.8;color:#333;}h1{border-bottom:2px solid #5B8CC0;padding-bottom:10px;}h2{color:#5B8CC0;margin-top:30px;border-left:4px solid #5B8CC0;padding-left:12px;}h3{color:#7B9B6A;}h4{color:#555;}table{border-collapse:collapse;width:100%;margin:15px 0;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;}th{background:#f0f4f8;color:#2c3e50;}tr:nth-child(even){background:#fafbfc;}pre{background:#2c3e50;color:#ecf0f1;padding:15px;border-radius:8px;overflow-x:auto;}code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:0.9em;}blockquote{border-left:4px solid #ddd;padding:10px 20px;margin:15px 0;color:#666;background:#f9f9f9;}ul,ol{padding-left:30px;margin:10px 0;}hr{border:none;border-top:1px solid #eee;margin:30px 0;}.disclaimer{margin-top:40px;padding:20px;background:#fff8e1;border-radius:8px;border:1px solid #ffe082;}</style></head>
<body><h1>${report.title}</h1><p style="color:#888;text-align:center">${CHART_TYPE_REVERSE[report.chart_type] || report.chart_type} · ${safeName} · ${dateStr}</p>
<div class="report-content">
${reportHtml}
</div>
<div class="disclaimer"><strong>⚠️ 免责声明</strong><br/>本报告基于中国传统命理学理论框架，仅供文化研究和娱乐参考。</div></body></html>`

    downloadFile(content, fileName + '.html', 'text/html')
    setDownloadModalOpen(false)
    setDownloadTarget(null)
  }

  // ── 执行 PDF 下载 ──
  const handleDownloadPdf = async () => {
    const report = downloadTarget
    if (!report) return
    setDownloading(true)
    try {
      const token = getToken()
      if (!token) {
        throw new Error('登录状态已失效')
      }
      const response = await fetch(`${API_BASE}/reports/${report.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `PDF 生成失败 (HTTP ${response.status})`)
      }
      const blob = await response.blob()
      const dateStr = new Date(report.created_at).toLocaleDateString('en-CA')
      const safeName = report.chart_name || '命主'
      const fileName = `${safeName}_${CHART_TYPE_REVERSE[report.chart_type] || report.chart_type}_${report.skill_name || '解盘'}_${dateStr}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setDownloadModalOpen(false)
      setDownloadTarget(null)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || 'PDF 下载失败，请重试')
    } finally {
      setDownloading(false)
    }
  }

  // ── 下载格式选择弹窗（通过 Portal 渲染到 body，确保在所有视图下都能显示）──
  const downloadModalElement = (downloadModalOpen && downloadTarget) ? ReactDOM.createPortal(
    <div className="download-format-overlay" onClick={() => !downloading && setDownloadModalOpen(false)}>
      <div
        className="download-format-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="download-format-header">
          <h3>选择下载格式</h3>
          {!downloading && (
            <button
              type="button"
              className="download-format-close"
              onClick={() => setDownloadModalOpen(false)}
              aria-label="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="download-format-body">
          <p className="download-format-title">{downloadTarget.title}</p>
          <div className="download-format-options">
            <button
              type="button"
              className="download-format-option"
              onClick={handleDownloadHtml}
              disabled={downloading}
            >
              <div className="download-format-icon html">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="download-format-info">
                <span className="download-format-name">HTML 网页</span>
                <span className="download-format-desc">可在浏览器中直接查看，保留排版样式</span>
              </div>
            </button>
            <button
              type="button"
              className="download-format-option"
              onClick={handleDownloadPdf}
              disabled={downloading}
            >
              <div className="download-format-icon pdf">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div className="download-format-info">
                <span className="download-format-name">PDF 文档</span>
                <span className="download-format-desc">排版固定，适合打印和存档，文字可搜索</span>
              </div>
              {downloading && <span className="download-format-loading">生成中...</span>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null

  // ── 未登录 ──
  if (!isLoggedIn) {
    return (
      <div className="report-archive-panel">
        <LoginPrompt />
      </div>
    )
  }

  // ── 报告详情视图 ──
  if (selectedReport && !editingReport) {
    return (
      <div className="report-archive-panel">
        <div className="report-detail-header">
          <button type="button" className="report-back-btn" onClick={() => setSelectedReport(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回列表
          </button>
          <div className="report-detail-actions">
            <button type="button" className="report-action-btn" onClick={() => handleDownload(selectedReport)}>
              下载
            </button>
            <button
              type="button"
              className="report-action-btn"
              onClick={() => {
                setEditingReport(selectedReport)
                setEditTitle(selectedReport.title)
                setEditContent(selectedReport.report_content)
              }}
            >
              编辑
            </button>
          </div>
        </div>
        <div className="report-detail-content">
          <h2 className="report-detail-title">{selectedReport.title}</h2>
          <div className="report-detail-meta">
            <span>{CHART_TYPE_REVERSE[selectedReport.chart_type] || selectedReport.chart_type}</span>
            <span>· {new Date(selectedReport.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            <span>· {selectedReport.report_content.length} 字</span>
          </div>
          <div className="report-markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {selectedReport.report_content}
            </ReactMarkdown>
          </div>
        </div>
        {downloadModalElement}
      </div>
    )
  }

  // ── 编辑视图 ──
  if (editingReport) {
    return (
      <div className="report-archive-panel">
        <div className="report-detail-header">
          <button type="button" className="report-back-btn" onClick={() => setEditingReport(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            取消编辑
          </button>
          <button
            type="button"
            className="report-action-btn primary"
            onClick={handleUpdate}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
        <div className="report-edit-form">
          <label className="report-edit-label">报告标题</label>
          <input
            type="text"
            className="report-edit-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <label className="report-edit-label">报告内容</label>
          <textarea
            className="report-edit-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
          />
        </div>
        {downloadModalElement}
      </div>
    )
  }

  // ── 列表视图 ──
  return (
    <div className="report-archive-panel">
      {!embedded && (
        <div className="report-archive-header">
          <h3>
            解盘报告
            {archiveName && <span className="report-archive-filter-source">· {archiveName}</span>}
          </h3>
          <span className="report-archive-count">{total} 份报告</span>
        </div>
      )}

      {error && (
        <div className="report-error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {!embedded && (
        <div className="report-archive-search">
          <div className="report-archive-search-input">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜索报告标题或姓名"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button type="button" className="report-archive-search-btn" onClick={handleSearch}>
            查询
          </button>
        </div>
      )}

      {!embedded && (
        <div className="report-archive-filters">
          {['', ...CHART_TYPE_DISPLAY_LABELS].map((ct) => (
            <button
              key={ct || 'all'}
              type="button"
              className={`report-filter-tag${chartTypeFilter === ct ? ' active' : ''}`}
              onClick={() => {
                setChartTypeFilter(ct)
                setPage(1)
                fetchReports(searchKeyword, ct, 1)
              }}
            >
              {ct || '全部'}
            </button>
          ))}
        </div>
      )}

      {/* 嵌入模式：按排盘类型分类切换 */}
      {embedded && (
        <div className="ak-sub-tabs">
          <button
            type="button"
            className={`ak-sub-tab${chartTypeFilter === '' ? ' active' : ''}`}
            onClick={() => {
              setChartTypeFilter('')
              setPage(1)
              fetchReports(searchKeyword, '', 1)
            }}
          >
            全部
          </button>
          {CHART_TYPE_DISPLAY_LABELS.map((ct) => (
            <button
              key={ct}
              type="button"
              className={`ak-sub-tab${chartTypeFilter === ct ? ' active' : ''}`}
              onClick={() => {
                setChartTypeFilter(ct)
                setPage(1)
                fetchReports(searchKeyword, ct, 1)
              }}
            >
              {ct}
            </button>
          ))}
        </div>
      )}

      <div className="report-archive-list">
        {loading ? (
          <div className="report-archive-loading">加载中...</div>
        ) : reports.length === 0 ? (
          <div className="report-archive-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p>{archiveId ? `该档案暂无${chartTypeFilter || ''}解盘报告` : '暂无解盘报告'}</p>
            <span>{archiveId ? '在排盘页面为该档案生成并保存报告后，即可在此查看' : '在排盘页面生成并保存报告后，即可在此查看'}</span>
          </div>
        ) : (
          reports.map((item) => (
            <div
              key={item.id}
              className="report-archive-item"
              onClick={() => setSelectedReport(item)}
            >
              <div className="report-archive-item-header">
                <span className={`report-chart-type-tag ${item.chart_type === '八字' ? 'bazi' : item.chart_type === '紫微' ? 'ziwei' : item.chart_type === '六爻' ? 'liuyao' : item.chart_type === '梅花易数' ? 'meihua' : item.chart_type === '黄历择吉' ? 'huangli' : 'physiognomy'}`}>
                  {CHART_TYPE_REVERSE[item.chart_type] || item.chart_type}
                </span>
                <span className="report-archive-item-title">{item.title}</span>
              </div>
              <div className="report-archive-item-meta">
                <span>{new Date(item.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                <span>· {item.report_content.length} 字</span>
              </div>
              <div className="report-archive-item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="report-item-action-btn"
                  onClick={() => handleDownload(item)}
                  title="下载"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="report-item-action-btn danger"
                  onClick={() => handleDelete(item.id)}
                  title="删除"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {total > reports.length && (
        <div className="report-archive-pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span>{page} / {Math.ceil(total / PAGE_SIZE)}</span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / PAGE_SIZE)}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />

      {downloadModalElement}
    </div>
  )
}