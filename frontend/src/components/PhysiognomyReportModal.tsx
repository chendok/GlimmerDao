/**
 * 麻衣神相解盘报告弹窗
 *
 * 复用报告生成 SSE 流式接口，chart_type 固定为"麻衣神相"，
 * 技能列表过滤 context_requires="physiognomy"。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { getErrorMessage } from '../utils/helpers'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import ModelModeSelector from './ModelModeSelector'
import type { ModelMode } from '../types'
import { convertMarkdownToHtml, downloadFile, getTemplateShortName, downloadPdf } from '../utils/markdown'
import { parseSSEStream } from '../utils/sse'
import DownloadFormatModal from './DownloadFormatModal'
import ReportOutlineEditor, {
  type OutlineNode,
  type TemplateInfo,
  ensureNodeIds,
  stripNodeIds,
} from './ReportOutlineEditor'
import type { PhysiognomyAnalysisType } from '../utils/serializePhysiognomyContext'

interface SkillInfo {
  name: string
  display_name: string
  description: string
  icon: string
  context_requires: string | null
}

type ReportFormat = 'html' | 'pdf'

interface PhysiognomyReportModalProps {
  analysisType: PhysiognomyAnalysisType
  chartName: string
  contextData: string
  onClose: () => void
}

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export default function PhysiognomyReportModal({
  analysisType,
  chartName,
  contextData,
  onClose,
}: PhysiognomyReportModalProps) {
  const { openLoginModal } = useAuth()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState<string>('')
  const [reportFormat, setReportFormat] = useState<ReportFormat>('html')
  const [modelMode, setModelMode] = useState<ModelMode>('fast')
  const [reportContent, setReportContent] = useState<string>('')
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [streamStatus, setStreamStatus] = useState<'idle' | 'thinking' | 'generating' | 'done'>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [outlineError, setOutlineError] = useState('')

  const contentAreaRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const userScrolledRef = useRef(false)
  const lastScrollTopRef = useRef(0)

  // ── 加载 Skill 列表 ──
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch(`${API_BASE}/reports/skills`)
        if (!res.ok) throw new Error('加载失败')
        const data: SkillInfo[] = await res.json()
        const filtered = data.filter((s) => s.context_requires === 'physiognomy')
        setSkills(filtered)
        if (filtered.length > 0) {
          setSelectedSkillId(filtered[0].name)
        }
      } catch {
        const fallback: SkillInfo[] = [{
          name: 'physiognomy_analysis',
          display_name: '微光问道麻衣神相分析',
          description: '麻衣神相面相手相命理分析',
          icon: '👤',
          context_requires: 'physiognomy',
        }]
        setSkills(fallback)
        setSelectedSkillId(fallback[0].name)
      }
    }
    fetchSkills()
  }, [])

  // ── 加载模板列表 ──
  // 按 category='mayi' 过滤，仅显示麻衣神相模板
  useEffect(() => {
    let cancelled = false
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API_BASE}/reports/templates`)
        if (!res.ok) throw new Error(`加载模板列表失败 (HTTP ${res.status})`)
        const data: TemplateInfo[] = await res.json()
        if (cancelled) return
        // 按 category 过滤，仅保留麻衣神相模板
        const filtered = data.filter((t) => t.category === 'mayi')
        setTemplates(filtered)
        // 默认选中第一个模板
        if (filtered.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(filtered[0].id)
        }
      } catch (e: unknown) {
        if (cancelled) return
        setOutlineError(getErrorMessage(e) || '加载模板列表失败')
      }
    }
    fetchTemplates()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisType])

  // ── 加载模板目录 ──
  useEffect(() => {
    if (!selectedTemplateId) {
      setOutline([])
      setOutlineError('')
      return
    }
    let cancelled = false
    const fetchTemplateOutline = async () => {
      setOutlineLoading(true)
      setOutlineError('')
      try {
        const res = await fetch(`${API_BASE}/reports/templates/${encodeURIComponent(selectedTemplateId)}`)
        if (!res.ok) throw new Error(`加载模板详情失败 (HTTP ${res.status})`)
        const data = await res.json()
        if (cancelled) return
        setOutline(ensureNodeIds(data.outline || []))
      } catch (e: unknown) {
        if (cancelled) return
        setOutline([])
        setOutlineError(getErrorMessage(e) || '加载模板目录失败')
      } finally {
        if (!cancelled) setOutlineLoading(false)
      }
    }
    fetchTemplateOutline()
    return () => { cancelled = true }
  }, [selectedTemplateId])

  const handleTemplateChange = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId)
  }, [])

  // ── ESC 关闭 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // ── 自动滚动 ──
  useEffect(() => {
    const el = contentAreaRef.current
    if (!el || !streamingContent) return
    if (userScrolledRef.current) return
    el.scrollTop = el.scrollHeight
  }, [streamingContent])

  // ── 计时器 ──
  useEffect(() => {
    if (generating) {
      setElapsedSeconds(0)
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
  }, [generating])

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
  }, [])

  const handleContentScroll = useCallback(() => {
    const el = contentAreaRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
    if (isNearBottom) {
      userScrolledRef.current = false
    } else {
      if (scrollTop < lastScrollTopRef.current) {
        userScrolledRef.current = true
      }
    }
    lastScrollTopRef.current = scrollTop
  }, [])

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setGenerating(false)
    setStreamStatus('done')
    setStatusMessage('')
    if (streamingContent) {
      setReportContent(streamingContent)
    }
  }, [streamingContent])

  // ── 解析 SSE 流（与 BaziReportModal 一致） ──
  // ── 生成报告 ──
  const handleGenerate = useCallback(async () => {
    if (!selectedSkillId || !contextData) {
      setError('请先选择解盘技能')
      return
    }

    setGenerating(true)
    setError('')
    setReportContent('')
    setStreamingContent('')
    setSaveSuccess(false)
    setFullPrompt(null)
    setStreamStatus('thinking')
    setStatusMessage('正在准备生成报告...')
    userScrolledRef.current = false

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch(`${API_BASE}/reports/generate/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          chart_type: '麻衣神相',
          chart_name: chartName,
          skill_id: selectedSkillId,
          context_data: contextData,
          model_mode: modelMode,
          template_id: selectedTemplateId || undefined,
          ...(outline.length > 0 ? { outline: stripNodeIds(outline) } : {}),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || errData.message || `生成失败 (HTTP ${res.status})`)
      }
      if (!res.body) throw new Error('浏览器不支持流式读取')

      const reader = res.body.getReader()
      let accumulatedContent = ''
      let hasSwitchedToGenerating = false

      await parseSSEStream(reader, controller.signal, (event, data) => {
        switch (event) {
          case 'session':
          case 'skill_activated':
            break
          case 'prompt':
            if (data.system_prompt && data.user_message) {
              setFullPrompt({
                system_prompt: data.system_prompt as string,
                user_message: data.user_message as string,
              })
            }
            break
          case 'status':
            if (typeof data.message === 'string') setStatusMessage(data.message)
            break
          case 'thinking':
            if (typeof data.content === 'string') setStatusMessage(data.content)
            break
          case 'content':
            if (typeof data.content === 'string') {
              accumulatedContent += data.content
              if (!hasSwitchedToGenerating) {
                hasSwitchedToGenerating = true
                setStreamStatus('generating')
              }
              setStreamingContent(accumulatedContent)
            }
            break
          case 'tool_call':
            if (!hasSwitchedToGenerating) {
              hasSwitchedToGenerating = true
              setStreamStatus('generating')
            }
            break
          case 'tool_end':
            break
          case 'response':
            if (typeof data.content === 'string' && !accumulatedContent) {
              accumulatedContent = data.content
              setStreamingContent(accumulatedContent)
            }
            break
          case 'done':
            setStreamStatus('done')
            setReportContent(accumulatedContent)
            setStreamingContent('')
            setGenerating(false)
            return
          case 'error':
            throw new Error(
              typeof data.message === 'string' ? data.message : '报告生成异常'
            )
        }
      })

      if (accumulatedContent && streamStatus !== 'done') {
        setReportContent(accumulatedContent)
        setStreamingContent('')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        if (streamingContent) setReportContent(streamingContent)
        setStreamingContent('')
        setStreamStatus('done')
      } else {
        setError(getErrorMessage(e) || '报告生成失败，请重试')
        setStreamStatus('idle')
      }
    } finally {
      setGenerating(false)
      abortControllerRef.current = null
    }
  }, [selectedSkillId, contextData, chartName, streamStatus, outline, selectedTemplateId])

  // ── 下载报告：打开格式选择弹窗（与八字报告一致）──
  const handleDownload = useCallback(() => {
    if (!reportContent) {
      setError('请先生成报告')
      return
    }
    setError('')
    setDownloadModalOpen(true)
  }, [reportContent])

  // ── 执行 HTML 下载 ──
  const handleDownloadHtml = useCallback(() => {
    setDownloading(true)
    setError('')
    const selectedSkill = skills.find((s) => s.name === selectedSkillId)
    const skillLabel = selectedSkill?.display_name || selectedSkillId || '麻衣神相'
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
    const dateStr = new Date().toLocaleDateString('en-CA')
    const safeName = chartName || '命主'
    const baseFileName = `${safeName}_麻衣神相_${templateShortName}_${dateStr}`

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeName} - 麻衣神相分析报告</title>
  <style>
    body { max-width: 900px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.8; color: #333; background: #fff; }
    h1 { font-size: 2em; border-bottom: 2px solid #8B7355; padding-bottom: 10px; color: #4a3728; }
    h2 { font-size: 1.5em; color: #8B7355; margin-top: 30px; border-left: 4px solid #8B7355; padding-left: 12px; }
    h3 { font-size: 1.2em; color: #A0522D; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f0e8; color: #4a3728; }
    tr:nth-child(even) { background: #faf8f5; }
    blockquote { border-left: 4px solid #8B7355; padding: 10px 20px; margin: 15px 0; color: #666; background: #f9f7f4; }
    code { background: #f0ece6; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #4a3728; color: #ecf0f1; padding: 15px 20px; border-radius: 8px; overflow-x: auto; }
    hr { border: none; border-top: 1px solid #eee; margin: 30px 0; }
    .report-header { text-align: center; margin-bottom: 40px; }
    .report-meta { color: #888; font-size: 0.9em; }
    .disclaimer { margin-top: 40px; padding: 20px; background: #fff8e1; border-radius: 8px; border: 1px solid #ffe082; }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>麻衣神相分析报告</h1>
    <p class="report-meta">命主：${safeName} | 生成日期：${dateStr} | 分析技能：${skillLabel}</p>
  </div>
  <div class="report-content">${convertMarkdownToHtml(reportContent)}</div>
  <div class="disclaimer">
    <strong>⚠️ 免责声明</strong><br/>
    本报告基于中国传统相学理论框架，仅供文化研究和娱乐参考。
    相学分析不构成任何科学结论，不应用于医疗、投资、法律、婚姻等重大决策。
    面相特征基于计算机视觉关键点检测，存在一定误差，仅供参考。
  </div>
</body>
</html>`
    downloadFile(htmlContent, `${baseFileName}.html`, 'text/html')
    setDownloading(false)
    setDownloadModalOpen(false)
  }, [reportContent, skills, selectedSkillId, chartName, templates, selectedTemplateId])

  // ── 执行 PDF 下载 ──
  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true)
    setError('')
    const selectedSkill = skills.find((s) => s.name === selectedSkillId)
    const skillLabel = selectedSkill?.display_name || selectedSkillId || '麻衣神相'
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
    const dateStr = new Date().toLocaleDateString('en-CA')
    const safeName = chartName || '命主'
    const baseFileName = `${safeName}_麻衣神相_${templateShortName}_${dateStr}`

    const pdfContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${safeName} - 麻衣神相分析报告</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 28px;
      font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif;
      font-size: 14px;
      line-height: 1.8;
      color: #333;
      background: #fff;
      -webkit-font-smoothing: antialiased;
    }
    /* ── 报告封面头 ── */
    .report-header {
      text-align: center;
      padding: 28px 0 20px;
      border-bottom: 2px solid #8B7355;
      margin-bottom: 28px;
    }
    .report-header h1 {
      font-size: 24px;
      font-weight: 700;
      color: #4a3728;
      margin: 0 0 10px;
      letter-spacing: 2px;
    }
    .report-meta {
      color: #999;
      font-size: 12px;
      margin: 0;
      line-height: 1.6;
    }
    /* ── 标题层级 ── */
    h2 {
      font-size: 16px;
      font-weight: 700;
      color: #4a3728;
      margin: 32px 0 12px;
      padding: 8px 14px;
      background: #f5f0e8;
      border-left: 4px solid #8B7355;
      border-radius: 0 3px 3px 0;
    }
    h3 {
      font-size: 14px;
      font-weight: 600;
      color: #555;
      margin: 22px 0 8px;
      padding-left: 10px;
      border-left: 3px solid #a0876a;
    }
    h4 {
      font-size: 14px;
      font-weight: 600;
      color: #555;
      margin: 18px 0 6px;
    }
    /* ── 正文段落 ── */
    p {
      margin: 8px 0;
      text-align: justify;
      line-height: 1.8;
    }
    strong { color: #4a3728; font-weight: 600; }
    em { color: #8B7355; font-style: normal; font-weight: 500; }
    /* ── 表格 ── */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 14px 0;
      font-size: 13px;
    }
    th {
      background: #ede3d5;
      color: #4a3728;
      font-weight: 600;
      font-size: 13px;
      padding: 8px 12px;
      text-align: left;
      border: 1px solid #d5c8b5;
    }
    td {
      padding: 8px 12px;
      border: 1px solid #e8ddd0;
      color: #333;
      font-size: 13px;
      line-height: 1.6;
    }
    tr:nth-child(even) td { background: #faf7f3; }
    /* ── 引用块 ── */
    blockquote {
      border-left: 3px solid #a0876a;
      padding: 10px 16px;
      margin: 14px 0;
      color: #555;
      background: #f8f4f0;
      border-radius: 0 3px 3px 0;
      font-size: 13px;
      line-height: 1.8;
    }
    blockquote p { margin: 4px 0; }
    /* ── 列表 ── */
    ul, ol {
      margin: 8px 0;
      padding-left: 24px;
    }
    li {
      margin: 4px 0;
      line-height: 1.8;
    }
    /* ── 行内代码 ── */
    code {
      background: #f2ede7;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
      font-family: "Consolas", "Monaco", "Courier New", monospace;
      color: #8B4513;
    }
    /* ── 代码块 ── */
    pre {
      background: #3e352e;
      color: #f5f0e8;
      padding: 12px 16px;
      border-radius: 6px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 13px;
      line-height: 1.6;
      margin: 14px 0;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    /* ── 分隔线 ── */
    hr {
      border: none;
      height: 1px;
      background: #ddd;
      margin: 24px 0;
    }
    /* ── 免责声明 ── */
    .disclaimer {
      margin-top: 32px;
      padding: 14px 18px;
      background: #fef9ef;
      border-radius: 4px;
      border-left: 3px solid #e6a817;
      font-size: 12px;
      color: #8a6d3b;
      line-height: 1.7;
    }
    .disclaimer strong { color: #8a6d3b; }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>麻衣神相分析报告</h1>
    <p class="report-meta">命主：${safeName} ｜ 生成日期：${dateStr} ｜ 分析技能：${skillLabel}</p>
  </div>
  <div class="report-content">${convertMarkdownToHtml(reportContent)}</div>
  <div class="disclaimer">
    <strong>⚠️ 免责声明</strong><br/>
    本报告基于中国传统相学理论框架，仅供文化研究和娱乐参考。相学分析不构成任何科学结论，不应用于医疗、投资、法律、婚姻等重大决策。面相特征基于计算机视觉关键点检测，存在一定误差，仅供参考。
  </div>
</body>
</html>`

    try {
      await downloadPdf(reportContent, baseFileName, '麻衣神相分析报告', dateStr, '麻衣神相', safeName, skillLabel)
      setDownloading(false)
      setDownloadModalOpen(false)
    } catch {
      setDownloading(false)
      setError('PDF 生成失败，请重试或改用 HTML 格式下载')
    }
  }, [reportContent, skills, selectedSkillId, chartName, templates, selectedTemplateId])

  // ── 保存报告 ──
  const handleSave = useCallback(async () => {
    if (!reportContent) {
      setError('请先生成报告')
      return
    }
    const token = getToken()
    if (!token) {
      openLoginModal()
      return
    }

    setSaving(true)
    setError('')
    setSaveSuccess(false)

    const selectedSkill = skills.find((s) => s.name === selectedSkillId)
    const skillLabel = selectedSkill?.display_name || selectedSkillId || '麻衣神相'
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
    const dateStr = new Date().toLocaleDateString('en-CA')
    const title = `${chartName || '命主'}_麻衣神相${templateShortName}_${dateStr}`

    try {
      const res = await fetch(`${API_BASE}/reports/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          chart_type: '麻衣神相',
          chart_name: chartName,
          skill_name: skillLabel,
          report_format: reportFormat,
          report_content: reportContent,
        }),
      })
      if (res.status === 401) {
        setError('登录已失效或账户不存在，请重新登录后再保存报告')
        openLoginModal()
        return
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail
        const errMsg = typeof detail === 'object' && detail !== null
          ? detail.message
          : (typeof detail === 'string' ? detail : (errData.message || `保存失败 (HTTP ${res.status})`))
        throw new Error(errMsg)
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [reportContent, skills, selectedSkillId, chartName, reportFormat, openLoginModal, templates, selectedTemplateId])

  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    if (!reportContent) return
    try {
      await navigator.clipboard.writeText(reportContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = reportContent
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── 复制提示词 ──
  const [fullPrompt, setFullPrompt] = useState<{ system_prompt: string; user_message: string } | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)
  const handleCopyPrompt = async () => {
    if (!fullPrompt) return
    const promptText = `【System Prompt】\n${fullPrompt.system_prompt}\n\n【User Message】\n${fullPrompt.user_message}`
    try {
      await navigator.clipboard.writeText(promptText)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = promptText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    }
  }

  const selectedSkill = skills.find((s) => s.name === selectedSkillId)
  const isStreaming = generating && streamStatus === 'generating'
  const showContent = reportContent || streamingContent

  return (
    <div className="report-modal-overlay">
      <div className="report-modal">
        {/* 工具栏 */}
        <div className="report-toolbar">
          <div className="report-toolbar-left">
            <h2 className="report-toolbar-title">麻衣神相报告</h2>
            {chartName && (
              <span className="report-toolbar-subtitle">
                {analysisType === 'face' ? '面相' : analysisType === 'hand' ? '手相' : '综合'} · {chartName}
              </span>
            )}
          </div>

          <button type="button" className="report-close-btn" onClick={onClose} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── 操作按钮区 ── */}
        <div className="report-control-group report-actions">
          <ModelModeSelector
            modelMode={modelMode}
            onModeChange={setModelMode}
            disabled={generating}
          />
          <div className="report-control-group">
            <label className="report-control-label">技能</label>
            <select
              className="report-select"
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              disabled={generating || outlineLoading}
            >
              {skills.length === 0 && <option value="">无可用技能</option>}
              {skills.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.icon} {s.display_name}
                </option>
              ))}
            </select>
          </div>

          {generating ? (
            <button type="button" className="report-btn danger" onClick={handleStop}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              停止生成
            </button>
          ) : (
            <button
              type="button"
              className="report-btn primary"
              onClick={handleGenerate}
              disabled={!selectedSkillId}
            >
              {reportContent ? '重新生成' : '生成报告'}
            </button>
          )}
          <button
            type="button"
            className="report-btn secondary"
            onClick={handleSave}
            disabled={saving || !reportContent || generating}
          >
            {saving ? (<><span className="report-spinner" />保存中...</>)
              : saveSuccess ? '✓ 已保存'
              : '保存报告'}
          </button>
          <button
            type="button"
            className="report-btn secondary"
            onClick={handleDownload}
            disabled={!reportContent || generating || downloading}
          >{downloading ? (<><span className="report-spinner" />生成中...</>) : '下载报告'}</button>
        </div>

        {/* 内容区 */}
        <div className="report-content-area" ref={contentAreaRef} onScroll={handleContentScroll}>
          {error && (
            <div className="report-error-banner">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="关闭错误提示">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* 流式生成中 */}
          {isStreaming && streamingContent && (
            <div className="report-streaming-area">
              <div className="report-streaming-header">
                <div className="report-streaming-indicator">
                  <span className="report-streaming-dot" />
                  <span className="report-streaming-dot" />
                  <span className="report-streaming-dot" />
                </div>
                <span className="report-streaming-text">
                  {statusMessage || 'AI 正在生成报告...'}
                </span>
                <span className="report-streaming-stats">
                  {streamingContent.length} 字符 · {elapsedSeconds}s
                </span>
              </div>
              <div className="report-streaming-body">
                <div className="assistant-text">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingContent}
                  </ReactMarkdown>
                </div>
                <span className="report-streaming-cursor" aria-hidden="true" />
              </div>
            </div>
          )}

          {/* 思考阶段 */}
          {generating && streamStatus === 'thinking' && !streamingContent && (
            <div className="report-thinking-phase">
              <div className="thinking-phase-header">
                <div className="thinking-phase-spinner">
                  <span className="thinking-spinner-ring" />
                  <span className="thinking-spinner-ring" />
                  <span className="thinking-spinner-ring" />
                </div>
                <div className="thinking-phase-info">
                  <p className="thinking-phase-message">
                    {statusMessage || 'AI 正在思考，准备生成报告...'}
                  </p>
                  <span className="thinking-phase-timer">已等待 {elapsedSeconds} 秒</span>
                </div>
              </div>
              <div className="thinking-phase-steps">
                <div className={`thinking-step ${elapsedSeconds >= 0 ? 'active' : ''} ${elapsedSeconds > 2 ? 'done' : ''}`}>
                  <span className="thinking-step-icon">{elapsedSeconds > 2 ? '✓' : '1'}</span>
                  <span className="thinking-step-label">分析相理特征</span>
                </div>
                <div className={`thinking-step-line ${elapsedSeconds > 2 ? 'active' : ''}`} />
                <div className={`thinking-step ${elapsedSeconds > 2 ? 'active' : ''} ${elapsedSeconds > 8 ? 'done' : ''}`}>
                  <span className="thinking-step-icon">{elapsedSeconds > 8 ? '✓' : '2'}</span>
                  <span className="thinking-step-label">调用相学技能</span>
                </div>
                <div className={`thinking-step-line ${elapsedSeconds > 8 ? 'active' : ''}`} />
                <div className={`thinking-step ${elapsedSeconds > 8 ? 'active' : ''}`}>
                  <span className="thinking-step-icon">3</span>
                  <span className="thinking-step-label">生成分析报告</span>
                </div>
              </div>
              <div className="thinking-phase-hint">
                <span className="thinking-hint-dot" />
                <span className="thinking-hint-dot" />
                <span className="thinking-hint-dot" />
                <p>AI 正在深度分析，这通常需要 1-3 分钟，请耐心等待</p>
              </div>
            </div>
          )}

          {/* 已完成内容 */}
          {reportContent && !isStreaming && (
            <>
              <div className="report-content-toolbar">
                <span className="report-content-info">
                  {selectedSkill?.display_name || selectedSkillId} · {reportContent.length} 字符
                </span>
                <div className="report-copy-actions">
                <button
                  type="button"
                  className={`report-copy-btn prompt ${promptCopied ? 'copied' : ''}`}
                  onClick={handleCopyPrompt}
                >
                  {promptCopied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                  复制提示词
                </button>
                <button
                  type="button"
                  className={`report-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      复制结果
                    </>
                  )}
                </button>
                </div>
              </div>
              <div className="report-markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {reportContent}
                </ReactMarkdown>
              </div>
            </>
          )}

          {!showContent && !generating && !error && (
            <>
              <div className="report-outline-section">
                <ReportOutlineEditor
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  onTemplateChange={handleTemplateChange}
                  outline={outline}
                  loading={outlineLoading}
                  error={outlineError}
                  disabled={generating}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 下载格式选择弹窗（与八字报告一致）── */}
      <DownloadFormatModal
        open={downloadModalOpen}
        title={`${chartName || '命主'} - 麻衣神相分析报告`}
        downloading={downloading}
        onClose={() => setDownloadModalOpen(false)}
        onDownloadHtml={handleDownloadHtml}
        onDownloadPdf={handleDownloadPdf}
      />
    </div>
  )
}
