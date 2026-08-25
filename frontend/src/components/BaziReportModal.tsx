import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import ConfirmDialog from './ConfirmDialog'
import ReportOutlineEditor, {
  type OutlineNode,
  type TemplateInfo,
  ensureNodeIds,
  stripNodeIds,
} from './ReportOutlineEditor'

// ── Skill 类型定义 ──
interface SkillInfo {
  name: string
  display_name: string
  description: string
  icon: string
  context_requires: string | null
}

// ── 排盘类型 DB 值 → 显示标签（与档案库类型标签保持一致）──
const CHART_TYPE_DISPLAY_LABEL: Record<string, string> = {
  '八字': '四柱八字',
  '紫微': '紫微斗数',
  '六爻': '六爻占卜',
  '梅花易数': '梅花易数',
  '黄历择吉': '黄历择吉',
}

// ── Props ──
interface BaziReportModalProps {
  /** 排盘类型：八字/紫微/六爻/梅花易数/黄历择吉 */
  chartType: '八字' | '紫微' | '六爻' | '梅花易数' | '黄历择吉'
  /** 排盘对象姓名 */
  chartName: string
  /** 排盘上下文数据（序列化后的文本） */
  contextData: string
  /** 用于自动保存档案的排盘信息（档案库不存在时使用） */
  archiveData: {
    name: string
    gender: string
    birth_datetime: string
    birthplace?: string | null
    calendar_type: string
    bazi_result?: Record<string, unknown> | null
    supplemental_info?: string | null
  }
  /** 关闭弹窗回调 */
  onClose: () => void
}

// ── 获取 Token ──
function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export default function BaziReportModal({
  chartType,
  chartName,
  contextData,
  archiveData,
  onClose,
}: BaziReportModalProps) {
  // ── 状态 ──
  const { user, openLoginModal, token } = useAuth()
  const isAdmin = user?.is_admin === true
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState<string>('')
  const [downloadModalOpen, setDownloadModalOpen] = useState(false)
  const [modelMode, setModelMode] = useState<ModelMode>('fast')
  const [reportContent, setReportContent] = useState<string>('')
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [confirmAutoArchive, setConfirmAutoArchive] = useState(false)
  const [streamStatus, setStreamStatus] = useState<'idle' | 'thinking' | 'generating' | 'done'>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [thinkingContent, setThinkingContent] = useState<string>('')  // 累积的 LLM 思考过程
  const [thinkingExpanded, setThinkingExpanded] = useState(false)      // 思考过程折叠/展开
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true)     // 整个思考区域折叠/展开
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false)    // 章节验证面板折叠
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 章节级验证状态 ──
  interface SectionProgress {
    title: string
    status: 'pending' | 'generating' | 'passed' | 'failed' | 'regenerating'
    retries: number
    wordCount?: number
  }
  const [sections, setSections] = useState<SectionProgress[]>([])
  const [currentSectionIndex, setCurrentSectionIndex] = useState(-1)
  const [validationSummary, setValidationSummary] = useState<any>(null)

  // ── 报告模板状态 ──
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [outlineLoading, setOutlineLoading] = useState(false)
  const [outlineError, setOutlineError] = useState('')

  const contentAreaRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // 代数计数器：避免 React.StrictMode 开发模式下双重挂载导致 fetch 被误中止
  const generationIdRef = useRef(0)
  const userScrolledRef = useRef(false)
  const lastScrollTopRef = useRef(0)

  // ── 加载 Skill 列表 ──
  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch(`${API_BASE}/reports/skills`)
        if (!res.ok) throw new Error('加载失败')
        const data: SkillInfo[] = await res.json()
        // 严格按排盘类型过滤
        const contextKey = chartType === '八字' ? 'bazi' : chartType === '紫微' ? 'ziwei' : chartType === '六爻' ? 'liuyao' : chartType === '梅花易数' ? 'meihua' : 'huangli'
        const filtered = data.filter((s) => s.context_requires === contextKey)
        setSkills(filtered)
        if (filtered.length > 0) {
          setSelectedSkillId(filtered[0].name)
        }
      } catch {
        // API 不可用时回退：仅保留与当前排盘类型严格匹配的"微光问道"技能
        const fallbackSkills: SkillInfo[] =
          chartType === '八字'
            ? [
                {
                  name: '微光问道八字分析',
                  display_name: '微光问道八字分析',
                  description: '八字命理解盘分析',
                  icon: '🔮',
                  context_requires: 'bazi',
                },
              ]
            : chartType === '紫微'
            ? [
                {
                  name: '微光问道紫微分析',
                  display_name: '微光问道紫微分析',
                  description: '紫微斗数命理解盘分析',
                  icon: '🌟',
                  context_requires: 'ziwei',
                },
              ]
            : chartType === '六爻'
            ? [
                {
                  name: '微光问道六爻解卦',
                  display_name: '微光问道六爻解卦',
                  description: '六爻纳甲筮法解卦分析',
                  icon: '🪙',
                  context_requires: 'liuyao',
                },
              ]
            : chartType === '梅花易数'
            ? [
                {
                  name: '微光问道梅花易数解卦',
                  display_name: '微光问道梅花易数解卦',
                  description: '梅花易数占卜解卦分析',
                  icon: '🌸',
                  context_requires: 'meihua',
                },
              ]
            : [
                {
                  name: '微光问道黄道择吉分析',
                  display_name: '微光问道黄道择吉分析',
                  description: '黄道择吉吉日分析',
                  icon: '📅',
                  context_requires: 'huangli',
                },
              ]
        setSkills(fallbackSkills)
        if (fallbackSkills.length > 0) {
          setSelectedSkillId(fallbackSkills[0].name)
        }
      }
    }
    fetchSkills()
  }, [chartType])

  // ── 加载模板列表 ──
  // 按 chartType 过滤，仅显示当前功能模块对应的模板
  useEffect(() => {
    let cancelled = false
    const templateCategory =
      chartType === '八字' ? 'bazi' :
      chartType === '紫微' ? 'ziwei' :
      chartType === '六爻' ? 'liuyao' :
      chartType === '梅花易数' ? 'meihua' :
      'huangli'
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API_BASE}/reports/templates`)
        if (!res.ok) throw new Error(`加载模板列表失败 (HTTP ${res.status})`)
        const data: TemplateInfo[] = await res.json()
        if (cancelled) return
        // 按 category 过滤，仅保留当前功能模块的模板
        const filtered = data.filter((t) => t.category === templateCategory)
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
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 加载选中模板的目录结构 ──
  // 选中模板变更时拉取该模板的目录详情，实现选择联动
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
        const res = await fetch(
          `${API_BASE}/reports/templates/${encodeURIComponent(selectedTemplateId)}`,
        )
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
    return () => {
      cancelled = true
    }
  }, [selectedTemplateId])

  // ── 模板选择回调 ──
  const handleTemplateChange = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId)
  }, [])

  // ── 自动滚动 ──
  useEffect(() => {
    const el = contentAreaRef.current
    if (!el || !streamingContent) return

    // 如果用户手动滚动了，不自动滚动
    if (userScrolledRef.current) return

    el.scrollTop = el.scrollHeight
  }, [streamingContent])

  // ── 计时器：generating 时每秒递增 ──
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

  // ── 组件卸载时清理计时器 ──
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
  }, [])

  // ── 组件卸载时中止请求（StrictMode 安全：仅当确实有活跃生成时才中止）──
  useEffect(() => {
    return () => {
      if (abortControllerRef.current && generationIdRef.current > 0) {
        generationIdRef.current = 0
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  // ── 监听用户滚动 ──
  const handleContentScroll = useCallback(() => {
    const el = contentAreaRef.current
    if (!el) return

    const { scrollTop, scrollHeight, clientHeight } = el
    // 用户是否在底部附近（50px 容差）
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50

    if (isNearBottom) {
      userScrolledRef.current = false
    } else {
      // 只在上滚时标记为手动滚动
      if (scrollTop < lastScrollTopRef.current) {
        userScrolledRef.current = true
      }
    }
    lastScrollTopRef.current = scrollTop
  }, [])

  // ── 滚动到底部 ──
  const scrollToBottom = useCallback(() => {
    const el = contentAreaRef.current
    if (el) {
      userScrolledRef.current = false
      el.scrollTop = el.scrollHeight
    }
  }, [])

  // ── 安全关闭：先中止请求再关闭 ──
  const handleSafeClose = useCallback(() => {
    if (abortControllerRef.current) {
      generationIdRef.current = 0
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (generating) {
      setGenerating(false)
      setStreamStatus('done')
      // 保留已生成的内容
      if (streamingContent) {
        setReportContent(streamingContent)
      }
    }
    onClose()
  }, [generating, streamingContent, onClose])

  // ── 停止生成 ──
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      generationIdRef.current = 0
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setGenerating(false)
    setStreamStatus('done')
    setStatusMessage('')
    // 保留已生成的内容
    if (streamingContent) {
      setReportContent(streamingContent)
    }
  }, [streamingContent])

  // ── ESC 关闭 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSafeClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSafeClose])

  // ── 解析 SSE 流 ──

  // ── 生成报告（流式） ──
  const handleGenerate = useCallback(async () => {
    if (!selectedSkillId || !contextData) {
      setError('请先选择解盘技能')
      return
    }

    // 重置状态
    setGenerating(true)
    setError('')
    setReportContent('')
    setStreamingContent('')
    setSaveSuccess(false)
    setFullPrompt(null)
    setStreamStatus('thinking')
    setStatusMessage('正在准备生成报告...')
    setThinkingContent('')
    setThinkingExpanded(false)
    setThinkingCollapsed(true)
    setSections([])
    setCurrentSectionIndex(-1)
    setValidationSummary(null)
    userScrolledRef.current = false

    // 中止已有的请求（防止重复点击导致并发请求）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      generationIdRef.current = 0
    }
    const controller = new AbortController()
    abortControllerRef.current = controller
    generationIdRef.current += 1

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      const res = await fetch(`${API_BASE}/reports/generate/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chart_type: chartType,
          chart_name: chartName,
          skill_id: selectedSkillId,
          context_data: contextData,
          model_mode: modelMode,
          // 传入模板ID，后端加载模板正文作为格式参考注入生成指令
          template_id: selectedTemplateId || undefined,
          // 仅当 outline 非空时传递（去除 id 字段，仅保留 title/children 结构）
          ...(outline.length > 0 ? { outline: stripNodeIds(outline) } : {}),
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || errData.message || `生成失败 (HTTP ${res.status})`)
      }

      if (!res.body) {
        throw new Error('浏览器不支持流式读取')
      }

      const reader = res.body.getReader()
      let accumulatedContent = ''
      let hasSwitchedToGenerating = false
      let sectionStartLen = 0

      await parseSSEStream(reader, controller.signal, (event, data) => {
        switch (event) {
          case 'session':
            break

          case 'skill_activated':
            break

          case 'prompt':
            // 接收完整提示词（供"复制提示词"功能使用）
            if (data.system_prompt && data.user_message) {
              setFullPrompt({
                system_prompt: data.system_prompt as string,
                user_message: data.user_message as string,
              })
            }
            break

          case 'status':
            // status 事件：阶段状态提示（不作为报告内容）
            if (typeof data.message === 'string') {
              setStatusMessage(data.message)
            }
            break

          case 'thinking':
            // thinking 事件：LLM 推理过程（deepseek 等模型的 reasoning_content）
            // 累积全部思考内容，同时更新状态消息为最新一行
            if (typeof data.content === 'string') {
              setThinkingContent(prev => {
                const updated = prev + data.content
                // 提取最后一行作为状态消息简洁显示
                const lines = updated.split('\n').filter(l => l.trim())
                if (lines.length > 0) {
                  setStatusMessage(lines[lines.length - 1].trim())
                }
                return updated
              })
            }
            break

          case 'content':
            // content 事件：LLM 输出的内容片段（真正的报告内容）
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

          // ── 章节级验证事件 ──
          case 'section_start': {
            const sIdx = Number(data.index) || 0
            const sTotal = Number(data.total) || 0
            const sTitle = String(data.title || '')
            setCurrentSectionIndex(sIdx)
            sectionStartLen = accumulatedContent.length
            setSections(prev => {
              const next = [...prev]
              if (!next[sIdx]) {
                next[sIdx] = { title: sTitle, status: 'generating', retries: 0 }
              } else {
                next[sIdx] = { ...next[sIdx], status: 'generating' }
              }
              return next
            })
            setStatusMessage(`正在生成第 ${sIdx + 1}/${sTotal} 章：${sTitle}`)
            break
          }

          case 'section_validated': {
            const vIdx = Number(data.index) || 0
            const vTotal = Number(data.total) || 0
            const vPassed = Boolean(data.passed)
            const vRetries = Number(data.retries) || 0
            const vWordCount = Number(data.word_count) || 0
            setSections(prev => {
              const next = [...prev]
              if (next[vIdx]) {
                next[vIdx] = {
                  ...next[vIdx],
                  status: vPassed ? 'passed' : 'failed',
                  retries: vRetries,
                  wordCount: vWordCount,
                }
              }
              return next
            })
            // 用后端规范后的章节内容替换流式累积的原始输出，
            // 确保 LLM 输出中粘连/残缺的章节标题不进入最终报告与导出 PDF
            if (typeof data.content === 'string' && data.content) {
              const prefix = accumulatedContent.slice(0, sectionStartLen)
              accumulatedContent = prefix + (prefix && !prefix.endsWith('\n\n') ? '\n\n' : '') + data.content
              setStreamingContent(accumulatedContent)
            }
            if (vPassed) {
              setStatusMessage(`第 ${vIdx + 1}/${vTotal} 章验证通过`)
            } else {
              setStatusMessage(`第 ${vIdx + 1}/${vTotal} 章验证未通过（重试 ${vRetries} 次）`)
            }
            break
          }

          case 'section_regenerate': {
            const rIdx = Number(data.index) || 0
            const rRetry = Number(data.retry) || 0
            const rTitle = String(data.title || '')
            setSections(prev => {
              const next = [...prev]
              if (next[rIdx]) {
                next[rIdx] = { ...next[rIdx], status: 'regenerating', retries: rRetry }
              }
              return next
            })
            setStatusMessage(`正在修正第 ${rIdx + 1} 章：${rTitle}（第 ${rRetry} 次）`)
            // 截断到当前章节开始位置，保留前序章节内容
            accumulatedContent = accumulatedContent.slice(0, sectionStartLen)
            setStreamingContent(accumulatedContent)
            setStreamStatus('thinking')
            hasSwitchedToGenerating = false
            break
          }

          case 'validation_summary':
            setValidationSummary(data)
            setStatusMessage(
              data.all_passed
                ? `全部 ${data.total_sections} 章验证通过`
                : `${data.passed_sections}/${data.total_sections} 章通过，${data.failed_sections} 章未通过`
            )
            break

          case 'done':
            setStreamStatus('done')
            setReportContent((data.content as string) || accumulatedContent)
            setStreamingContent('')
            setGenerating(false)
            return

          case 'error':
            throw new Error(
              typeof data.message === 'string' ? data.message : '报告生成异常'
            )
        }
      })

      // 如果流结束但未收到 done 事件
      if (accumulatedContent && streamStatus !== 'done') {
        setReportContent(accumulatedContent)
        setStreamingContent('')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 用户主动停止 — 保留已生成内容
        if (streamingContent) {
          setReportContent(streamingContent)
        }
        setStreamingContent('')
        setStreamStatus('done')
      } else {
        setError(getErrorMessage(e) || '报告生成失败，请重试')
        setStreamStatus('idle')
      }
    } finally {
      setGenerating(false)
      generationIdRef.current = 0
      abortControllerRef.current = null
    }
  }, [selectedSkillId, contextData, chartType, chartName, modelMode, token, outline, selectedTemplateId])

  // ── 执行 HTML 下载 ──
  const handleDownloadHtml = useCallback(() => {
    const selectedSkill = skills.find((s) => s.name === selectedSkillId)
    const skillLabel = selectedSkill?.display_name || selectedSkillId || '解盘'
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
    const dateStr = new Date().toLocaleDateString('en-CA')
    const safeName = chartName || '命主'
    const baseFileName = `${safeName}_${CHART_TYPE_DISPLAY_LABEL[chartType] || chartType}_${templateShortName}_${dateStr}`

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeName} - ${CHART_TYPE_DISPLAY_LABEL[chartType] || chartType}解盘报告</title>
  <style>
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.8;
      color: #333;
      background: #fff;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #5B8CC0; padding-bottom: 10px; color: #2c3e50; }
    h2 { font-size: 1.5em; color: #5B8CC0; margin-top: 30px; border-left: 4px solid #5B8CC0; padding-left: 12px; }
    h3 { font-size: 1.2em; color: #7B9B6A; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f0f4f8; color: #2c3e50; }
    tr:nth-child(even) { background: #fafbfc; }
    blockquote { border-left: 4px solid #ddd; padding: 10px 20px; margin: 15px 0; color: #666; background: #f9f9f9; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #2c3e50; color: #ecf0f1; padding: 15px 20px; border-radius: 8px; overflow-x: auto; }
    hr { border: none; border-top: 1px solid #eee; margin: 30px 0; }
    .report-header { text-align: center; margin-bottom: 40px; }
    .report-meta { color: #888; font-size: 0.9em; }
    .disclaimer { margin-top: 40px; padding: 20px; background: #fff8e1; border-radius: 8px; border: 1px solid #ffe082; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${chartType}解盘报告</h1>
    <p class="report-meta">命主：${safeName} | 生成日期：${dateStr} | 解盘技能：${skillLabel}</p>
  </div>
  <div class="report-content">
    ${convertMarkdownToHtml(reportContent)}
  </div>
  <div class="disclaimer">
    <strong>⚠️ 免责声明</strong><br/>
    本报告基于中国传统命理学理论框架，仅供文化研究和娱乐参考。
    命理分析不构成任何科学结论，不应用于医疗、投资、法律、婚姻等重大决策。
    人生在于自身的努力和选择，命理分析仅为参考工具。
  </div>
</body>
</html>`

    downloadFile(htmlContent, `${baseFileName}.html`, 'text/html')
    setDownloadModalOpen(false)
  }, [reportContent, skills, selectedSkillId, chartType, chartName, templates, selectedTemplateId])

  // ── 执行 PDF 下载 ──
  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true)
    setError('')

    const selectedSkill = skills.find((s) => s.name === selectedSkillId)
    const skillLabel = selectedSkill?.display_name || selectedSkillId || '解盘'
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
    const dateStr = new Date().toLocaleDateString('en-CA')
    const safeName = chartName || '命主'
    const baseFileName = `${safeName}_${CHART_TYPE_DISPLAY_LABEL[chartType] || chartType}_${templateShortName}_${dateStr}`

    try {
      await downloadPdf(reportContent, baseFileName, `${chartType}解盘报告`, dateStr, chartType, safeName, skillLabel)
      setDownloadModalOpen(false)
    } catch {
      setError('PDF 生成失败，请重试或改用 HTML 格式下载')
    } finally {
      setDownloading(false)
    }
  }, [reportContent, skills, selectedSkillId, chartType, chartName, templates, selectedTemplateId])

  // ── 下载报告：打开格式选择弹窗 ──
  const handleDownload = useCallback(() => {
    if (!reportContent) {
      setError('请先生成报告')
      return
    }
    setError('')
    setDownloadModalOpen(true)
  }, [reportContent])

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
    const skillLabel = selectedSkill?.display_name || selectedSkillId || '解盘'
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
    const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
    const dateStr = new Date().toLocaleDateString('en-CA')
    const title = `${chartName || '命主'}_${CHART_TYPE_DISPLAY_LABEL[chartType] || chartType}${templateShortName}_${dateStr}`

    // 内部辅助：调用保存报告接口
    const callSaveReport = async (extra: { archive_id?: number } = {}): Promise<Response> => {
      return fetch(`${API_BASE}/reports/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          chart_type: chartType,
          chart_name: chartName,
          skill_name: skillLabel,
          report_content: reportContent,
          // 传入出生时间，后端按 name + birth_datetime 精确匹配档案，避免同名档案匹配错误
          birth_datetime: archiveData?.birth_datetime || undefined,
          ...extra,
        }),
      })
    }

    try {
      const res = await callSaveReport()

      if (res.status === 401) {
        // 登录已失效或档案库没有该用户：友好提示并引导重新登录
        setError('登录已失效或账户不存在，请重新登录后再保存报告')
        openLoginModal()
        return
      } else if (res.status === 404) {
        // 可能是档案不存在，解析错误码
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail || {}
        // 兼容 detail 可能是字符串或对象
        const errCode = typeof detail === 'object' && detail !== null ? detail.code : ''
        const errMsg = typeof detail === 'object' && detail !== null
          ? detail.message
          : (typeof detail === 'string' ? detail : '保存失败')

        if (errCode === 'ARCHIVE_NOT_FOUND') {
          // 档案不存在：弹出确认框，用户确认后自动创建档案并重新保存
          setConfirmAutoArchive(true)
          return
        } else {
          throw new Error(errMsg || '保存失败')
        }
      } else if (!res.ok) {
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
  }, [reportContent, skills, selectedSkillId, chartType, chartName, archiveData, openLoginModal, templates, selectedTemplateId])

  // ── 自动创建档案并重新保存报告（确认弹窗确认后调用）──
  const saveWithAutoArchive = useCallback(async () => {
    setConfirmAutoArchive(false)
    setSaving(true)
    setError('')

    const token = getToken()
    if (!token) {
      openLoginModal()
      setSaving(false)
      return
    }

    try {
      // 1. 自动创建档案（分类为"其他"）
      const archiveRes = await fetch(`${API_BASE}/archives/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...archiveData,
          supplemental_info: archiveData.supplemental_info,
          group_name: '其他',
        }),
      })
      if (!archiveRes.ok) {
        const archiveErr = await archiveRes.json().catch(() => ({}))
        // 登录失效 / 档案库没有该用户：友好提示并引导重新登录，而非直接报错
        if (archiveRes.status === 401) {
          setError('登录已失效或账户不存在，请重新登录后再保存报告')
          openLoginModal()
          return
        }
        throw new Error(
          (typeof archiveErr.detail === 'object' ? archiveErr.detail?.message : archiveErr.detail) ||
          '自动保存档案失败'
        )
      }
      const archive = await archiveRes.json()

      // 2. 携带 archive_id 重新保存报告
      const selectedSkill = skills.find((s) => s.name === selectedSkillId)
      const skillLabel = selectedSkill?.display_name || selectedSkillId || '解盘'
      const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
      const templateShortName = getTemplateShortName(selectedTemplate?.name || '')
      const dateStr = new Date().toLocaleDateString('en-CA')
      const title = `${chartName || '命主'}_${CHART_TYPE_DISPLAY_LABEL[chartType] || chartType}${templateShortName}_${dateStr}`

      const retryRes = await fetch(`${API_BASE}/reports/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          chart_type: chartType,
          chart_name: chartName,
          skill_name: skillLabel,
          report_content: reportContent,
          archive_id: archive.id,
        }),
      })
      if (!retryRes.ok) {
        const retryErr = await retryRes.json().catch(() => ({}))
        if (retryRes.status === 401) {
          setError('登录已失效或账户不存在，请重新登录后再保存报告')
          openLoginModal()
          return
        }
        throw new Error(
          (typeof retryErr.detail === 'object' ? retryErr.detail?.message : retryErr.detail) ||
          `报告保存失败 (HTTP ${retryRes.status})`
        )
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [reportContent, skills, selectedSkillId, chartType, chartName, archiveData, openLoginModal, templates, selectedTemplateId])

  // ── 复制报告内容 ──
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

  // 进度百分比 — 基于章节进度
  const progressPercent = useMemo(() => {
    if (streamStatus === 'idle') return 0
    if (streamStatus === 'done') return 100

    // 有章节列表时，按章节进度计算
    if (sections.length > 0) {
      const totalSections = sections.length
      const completedSections = sections.filter(s => s.status === 'passed').length
      const perSection = 100 / totalSections
      const baseProgress = completedSections * perSection

      // 当前章节部分进度
      if (currentSectionIndex >= 0 && currentSectionIndex < totalSections) {
        const currentSection = sections[currentSectionIndex]
        if (currentSection && currentSection.status === 'generating') {
          const expected = 2000 // 单章节预期字符数
          const ratio = Math.min(1, streamingContent.length / expected)
          return baseProgress + ratio * perSection * 0.8
        }
        if (currentSection && currentSection.status === 'regenerating') {
          return baseProgress + perSection * 0.15
        }
      }
      return baseProgress
    }

    // 无章节列表时（旧逻辑回退）
    if (streamStatus === 'thinking') {
      return Math.min(15, (elapsedSeconds / 10) * 15)
    }
    if (streamStatus === 'generating') {
      const expected = 6000
      const ratio = Math.min(1, streamingContent.length / expected)
      return 15 + ratio * 60
    }
    return 0
  }, [streamStatus, elapsedSeconds, streamingContent, sections, currentSectionIndex])

  // 预计剩余时间（秒）
  const estimatedRemaining = useMemo(() => {
    if (progressPercent <= 0 || progressPercent >= 100) return 0
    if (elapsedSeconds < 1) return 0
    const totalEstimated = (elapsedSeconds / progressPercent) * 100
    return Math.max(0, Math.round(totalEstimated - elapsedSeconds))
  }, [progressPercent, elapsedSeconds])
  const showContent = reportContent || streamingContent

  return (
    <div className="report-modal-overlay">
      <div className="report-modal-v2">
        {/* ── 头部（固定） ── */}
        <div className="report-v2-header">
          <div className="report-v2-header-left">
            <h2 className="report-v2-title">解盘报告</h2>
            {chartName && (
              <span className="report-v2-subtitle">
                {chartType} · {chartName}
              </span>
            )}
          </div>
          <button type="button" className="report-v2-close" onClick={handleSafeClose} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── 双栏主体 ── */}
        <div className="report-v2-body">
          {/* 左侧配置栏 */}
          <aside className="report-v2-sidebar">
            {/* 模板选择 */}
            <div className="sidebar-section">
              <label className="sidebar-label">报告模板</label>
              <select
                className="sidebar-select"
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={generating || outlineLoading || templates.length === 0}
              >
                {templates.length === 0 && <option value="">无可用模板</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* 大纲预览 */}
            {outline.length > 0 && (
              <div className="sidebar-section sidebar-outline">
                <div className="sidebar-outline-body">
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
              </div>
            )}

            {/* 技能选择（隐藏，保留逻辑） */}
            <div className="sidebar-section" style={{ display: 'none' }}>
              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                disabled={generating || outlineLoading}
              >
                {skills.length === 0 && <option value="">无可用技能</option>}
                {skills.map((s) => (
                  <option key={s.name} value={s.name}>{s.icon} {s.display_name}</option>
                ))}
              </select>
            </div>
          </aside>

          {/* 右侧内容区 */}
          <main className="report-v2-main">
            {error && (
              <div className="report-v2-error">
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} aria-label="关闭错误提示">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            {/* 进度条（固定高度，生成中显示） */}
            {generating && progressPercent > 0 && (
              <div className="report-v2-progress">
                <div className="report-v2-progress-info">
                  <span className="report-v2-progress-stage">
                    {sections.length > 0 && currentSectionIndex >= 0
                      ? `第 ${currentSectionIndex + 1}/${sections.length} 章${sections[currentSectionIndex]?.status === 'regenerating' ? '（修正中）' : ''}`
                      : streamStatus === 'thinking' ? '正在思考分析'
                      : streamStatus === 'generating' ? '正在生成报告' : '处理中'}
                  </span>
                  <span className="report-v2-progress-stats">
                    {elapsedSeconds}s{estimatedRemaining > 0 && ` · 预计剩余 ${estimatedRemaining}s`}
                  </span>
                </div>
                <div className="report-v2-progress-track">
                  <div className="report-v2-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="report-v2-progress-percent">{Math.round(progressPercent)}%</span>
              </div>
            )}

            {/* 章节验证面板（可折叠，固定高度） */}
            {generating && sections.length > 0 && (
              <div className={`report-v2-sections ${sectionsCollapsed ? 'collapsed' : ''}`}>
                <div className="report-v2-sections-header" onClick={() => setSectionsCollapsed(!sectionsCollapsed)}>
                  <div className="report-v2-sections-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    <span>章节验证 {sections.filter(s => s.status === 'passed').length}/{sections.length}</span>
                  </div>
                  <svg
                    className="report-v2-sections-toggle"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: sectionsCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {!sectionsCollapsed && (
                  <div className="report-v2-sections-list">
                    {sections.map((sec, i) => (
                      <div key={i} className={`report-v2-section-item ${i === currentSectionIndex ? 'current' : ''} ${sec.status}`}>
                        {sec.status === 'passed' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : sec.status === 'failed' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        ) : (
                          <span className={`report-v2-section-spinner ${i === currentSectionIndex ? 'active' : ''}`} />
                        )}
                        <span className="report-v2-section-name">{sec.title}</span>
                        {sec.retries > 0 && <span className="report-v2-section-retries">重试{sec.retries}次</span>}
                        {sec.wordCount != null && sec.status === 'passed' && (
                          <span className="report-v2-section-words">{sec.wordCount}字</span>
                        )}
                      </div>
                    ))}
                    {validationSummary && !validationSummary.all_passed && (
                      <div className="report-v2-sections-hint">
                        共 {validationSummary.total_sections} 章，{validationSummary.passed_sections} 章通过，{validationSummary.failed_sections} 章未通过
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 内容区域（滚动） */}
            <div className="report-v2-content" ref={contentAreaRef} onScroll={handleContentScroll}>
              {/* 思考阶段（可折叠） */}
              {generating && (streamStatus === 'thinking' || (sections.length > 0 && !isStreaming)) && (
                <div className={`report-v2-thinking ${thinkingCollapsed ? 'collapsed' : 'expanded'}`}>
                  <div className="report-v2-thinking-header">
                    <div className="report-v2-thinking-spinner">
                      <span className="thinking-ring" />
                      <span className="thinking-ring" />
                      <span className="thinking-ring" />
                    </div>
                    <span className="report-v2-thinking-msg">{statusMessage || 'AI 正在思考...'}</span>
                    <button
                      className="report-v2-thinking-toggle"
                      onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
                      title={thinkingCollapsed ? '展开详情' : '收起详情'}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ transform: thinkingCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                  {!thinkingCollapsed && thinkingContent && (
                    <div className="report-v2-thinking-body">
                      <pre>{thinkingContent}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* 流式生成内容 */}
              {isStreaming && streamingContent && (
                <div className="report-v2-streaming">
                  <div className="report-v2-streaming-header">
                    <span className="report-v2-streaming-dot" />
                    <span className="report-v2-streaming-dot" />
                    <span className="report-v2-streaming-dot" />
                    <span className="report-v2-streaming-text">{statusMessage || '生成中...'}</span>
                    <span className="report-v2-streaming-stats">{streamingContent.length} 字符 · {elapsedSeconds}s</span>
                  </div>
                  <div className="report-v2-streaming-body">
                    <div className="assistant-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                    <span className="report-v2-cursor" aria-hidden="true" />
                  </div>
                </div>
              )}

              {/* 已完成报告 */}
              {reportContent && !isStreaming && !generating && (
                <>
                  <div className="report-v2-report-toolbar">
                    <span className="report-v2-report-info">
                      {selectedSkill?.display_name || selectedSkillId} · {reportContent.length} 字符
                    </span>
                    <div className="report-v2-report-actions">
                      <button
                        type="button"
                        className={`report-v2-action-btn ${promptCopied ? 'copied' : ''}`}
                        onClick={handleCopyPrompt}
                      >
                        {promptCopied ? '已复制提示词' : '复制提示词'}
                      </button>
                      <button
                        type="button"
                        className={`report-v2-action-btn ${copied ? 'copied' : ''}`}
                        onClick={handleCopy}
                      >
                        {copied ? '已复制' : '复制结果'}
                      </button>
                    </div>
                  </div>
                  <div className="report-v2-report-body">
                    <div className="assistant-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {reportContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                </>
              )}

              {/* 空态 */}
              {!showContent && !generating && !error && (
                <div className="report-v2-empty">
                  <div className="report-v2-empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p className="report-v2-empty-text">选择模板后点击「生成报告」开始</p>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* ── 固定底部操作栏 ── */}
        <div className="report-v2-footer">
          <div className="report-v2-footer-actions">
            <ModelModeSelector
              modelMode={isAdmin ? modelMode : 'fast'}
              onModeChange={isAdmin ? setModelMode : () => {}}
              disabled={generating || !isAdmin}
            />
            {generating ? (
              <button type="button" className="report-v2-btn danger" onClick={handleStop}>
                停止生成
              </button>
            ) : (
              <button
                type="button"
                className="report-v2-btn primary"
                onClick={handleGenerate}
                disabled={!selectedSkillId}
              >
                {reportContent ? '重新生成' : '生成报告'}
              </button>
            )}
            {chartType !== '六爻' && chartType !== '梅花易数' && (
              <button
                type="button"
                className="report-v2-btn secondary"
                onClick={handleSave}
                disabled={saving || !reportContent || generating}
              >
                {saving ? '保存中...' : saveSuccess ? '已保存' : '保存报告'}
              </button>
            )}
            <button
              type="button"
              className="report-v2-btn secondary"
              onClick={handleDownload}
              disabled={!reportContent || generating || downloading}
            >
              {downloading ? '生成中...' : '下载报告'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 下载格式选择弹窗 ── */}
      <DownloadFormatModal
        open={downloadModalOpen}
        title={`${chartName || '命主'} - ${chartType}解盘报告`}
        downloading={downloading}
        onClose={() => setDownloadModalOpen(false)}
        onDownloadHtml={handleDownloadHtml}
        onDownloadPdf={handleDownloadPdf}
      />

      {/* ── 自动创建档案确认弹窗 ── */}
      <ConfirmDialog
        open={confirmAutoArchive}
        title="保存报告"
        message={`未找到命主「${chartName || '命主'}」的排盘档案，请先保存档案。\n\n是否自动保存到档案库（分类为"其他"）？`}
        confirmText="自动保存"
        onConfirm={saveWithAutoArchive}
        onCancel={() => setConfirmAutoArchive(false)}
      />
    </div>
  )
}
