import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { getErrorMessage } from '../utils/helpers'
import type { FormEvent, KeyboardEvent, ChangeEvent, DragEvent } from 'react'
import { useChatContext } from '../hooks/useChatContext'
import { API_BASE } from '../utils/constants'
import { cleanRecognizedText, detectStopCommand } from '../utils/voice'
import VoiceWave from './VoiceWave'
import ContextMenu from './ContextMenu'

export interface InputBarHandle {
  sendMessage: (content: string) => void
  setInput: (text: string) => void
}

interface InputBarProps {
  getContextData?: () => string | undefined
  /** 自动指定的技能ID，发送消息时自动附带，无需用户手动选择 */
  skillId?: string
  /** 是否显示技能选择菜单（主界面显示，八字/紫微排盘结果界面隐藏） */
  showSkillSelection?: boolean
}

interface SkillInfo {
  name: string
  display_name: string
  description: string
  icon: string
  keywords: string[]
  auto_detect: boolean
  context_requires: string | null
}

/** 技能 → 专属 emoji 图标映射（按技能 name 稳定匹配） */
const SKILL_EMOJI: Record<string, string> = {
  bazi_analysis: '🔮',
  ziwei_analysis: '✨',
  meihua_analysis: '🌸',
  huangli_analysis: '📅',
  mayi_analysis: '👤',
  liuyao_analysis: '🪙',
}

/** 技能 → 图标主题色（用于 emoji 背景） */
const SKILL_ICON_THEME: Record<string, string> = {
  bazi_analysis: 'gold',
  ziwei_analysis: 'violet',
  meihua_analysis: 'pink',
  huangli_analysis: 'green',
  mayi_analysis: 'blue',
  liuyao_analysis: 'amber',
}

function getSkillEmoji(skill: SkillInfo): string {
  return SKILL_EMOJI[skill.name] || skill.icon || '💬'
}

function getSkillIconTheme(skill: SkillInfo): string {
  return SKILL_ICON_THEME[skill.name] || 'default'
}

interface SelectedFileInfo {
  name: string
  /** 原始文件名 */
  originalName: string
  /** 文件类型 */
  kind: 'image' | 'file'
  /** 服务端返回的 URL（图片上传） */
  url: string
  /** 文件大小（字节） */
  size: number
  /** 上传进度 (0-100)，100 表示完成 */
  progress: number
  /** 上传/读取错误信息，空字符串表示无错误 */
  error: string
  /** 文本文件内容（仅 kind=file） */
  content?: string
}

const InputBar = forwardRef<InputBarHandle, InputBarProps>(function InputBar({ getContextData, skillId, showSkillSelection = false }, ref) {
  const { sessionId, sendMessage, loading, stopGeneration, modelMode, setModelMode } = useChatContext()

  const [input, setInput] = useState('')
  const [prevSessionId, setPrevSessionId] = useState(sessionId)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showSkillMenu, setShowSkillMenu] = useState(false)
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const [skillsHovered, setSkillsHovered] = useState(false)
  const [skillsSubmenuHovered, setSkillsSubmenuHovered] = useState(false)
  const [submenuDirection, setSubmenuDirection] = useState<'down-right' | 'up-right' | 'down-left' | 'up-left'>('down-right')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillsError, setSkillsError] = useState('')
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle')
  const [voiceError, setVoiceError] = useState('')
  const [voiceVolume, setVoiceVolume] = useState(0)
  const [voiceActive, setVoiceActive] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileInfo[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const previewOverlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const skillMenuRef = useRef<HTMLDivElement>(null)
  const skillsSubmenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const skillsLoadedRef = useRef(false)
  /** 技能菜单 hover 延迟关闭计时器：鼠标在 wrapper 与二级菜单之间的间隙移动时，
   *  延迟清除 hover 状态，避免二级菜单反复消失/出现导致的闪烁 */
  const skillsHoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skillsSubmenuLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const partialTextRef = useRef('')
  /** 录音开始时 input 的长度，用于 final 消息时截断 partial 内容，避免重复 */
  const recordingInputPrefixRef = useRef(0)
  const volumeRafRef = useRef(0)
  const voiceActiveRef = useRef(false)
  const voiceActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 会话切换时清除输入与已选文件，避免跨会话残留
  useEffect(() => {
    if (prevSessionId !== sessionId) {
      setPrevSessionId(sessionId)
      setInput('')
      setSelectedFiles([])
    }
  }, [prevSessionId, sessionId])

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false)
      }
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) {
        setShowSkillMenu(false)
      }
    }
    if (showModelMenu || showSkillMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelMenu, showSkillMenu])

  // 预览浮层打开时自动聚焦以接收键盘事件
  useEffect(() => {
    if (previewIndex !== null) {
      previewOverlayRef.current?.focus()
    } else {
      setPreviewError(false)
    }
  }, [previewIndex])

  // 组件卸载时清理音频资源
  useEffect(() => {
    return () => {
      cleanupVoice()
    }
  }, [])

  // 加载技能列表（从后台 /api/v1/chat/skills 接口，数据源自 .skill 目录）
  // force=true 时绕过前端缓存并向后端传递 refresh=true，强制重新扫描 .skill 目录
  const fetchSkills = useCallback(async (force: boolean = false) => {
    if (!force && skillsLoadedRef.current) return
    setSkillsLoading(true)
    setSkillsError('')
    try {
      const url = force
        ? `${API_BASE}/chat/skills?refresh=true`
        : `${API_BASE}/chat/skills`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSkills(Array.isArray(data.skills) ? data.skills : [])
      skillsLoadedRef.current = true
    } catch (err) {
      setSkillsError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  // hover 技能一级菜单时预加载技能列表（使用缓存，避免频繁请求）
  useEffect(() => {
    if (skillsHovered && !skillsLoadedRef.current && showSkillSelection) {
      void fetchSkills()
    }
  }, [skillsHovered, fetchSkills, showSkillSelection])

  // 菜单关闭时重置 hover 状态，避免下次打开时残留
  useEffect(() => {
    if (!showSkillMenu) {
      if (skillsHoverLeaveTimerRef.current) {
        clearTimeout(skillsHoverLeaveTimerRef.current)
        skillsHoverLeaveTimerRef.current = null
      }
      if (skillsSubmenuLeaveTimerRef.current) {
        clearTimeout(skillsSubmenuLeaveTimerRef.current)
        skillsSubmenuLeaveTimerRef.current = null
      }
      setSkillsHovered(false)
      setSkillsSubmenuHovered(false)
    }
  }, [showSkillMenu])

  // 二级技能菜单展开时检测视口边界，自动调整弹出方向，保证全部技能可见
  useEffect(() => {
    const visible = (skillsExpanded || skillsHovered || skillsSubmenuHovered) && showSkillMenu
    if (!visible) return

    const el = skillsSubmenuRef.current
    if (!el) return

    const measure = () => {
      const vw = window.innerWidth
      // iOS Safari：innerHeight 不随地址栏伸缩/键盘弹出变化，
      // 优先用 visualViewport.height 获取真实可视高度。
      const vv = window.visualViewport
      const vh = vv ? vv.height : window.innerHeight
      // 使用一级菜单整体作为定位参考（.skill-menu-items 是 .skill-plus-menu 的直接子元素）
      const wrapperEl = el.parentElement as HTMLElement | null
      const wrapperRect = wrapperEl ? wrapperEl.getBoundingClientRect() : el.getBoundingClientRect()

      // 始终向下展开（紧贴一级菜单，符合自然视觉），但动态限制菜单最大高度，
      // 使菜单不超出视口底部，避免触发 .main-content 的页面级滚动条。
      // 一级菜单顶部到视口底部的可用空间（预留 8px 安全边距）
      const availableDown = vh - wrapperRect.top - 8
      // 菜单最大高度 = min(默认 320px, 可用向下空间)
      const maxH = Math.max(120, Math.min(320, availableDown))
      el.style.maxHeight = `${maxH}px`

      const menuWidth = el.offsetWidth || 240
      const needLeft = wrapperRect.right + menuWidth + 4 > vw - 8
      const horizontal: 'left' | 'right' = needLeft ? 'left' : 'right'
      const next = `down-${horizontal}` as typeof submenuDirection
      setSubmenuDirection((prev) => (prev === next ? prev : next))
    }

    measure()
    // 技能列表异步加载后再次测量，确保拿到真实高度
    const timer = setTimeout(measure, 80)
    window.addEventListener('resize', measure)
    // iOS 键盘弹出/收起时 visualViewport 会 resize，重新测量
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [skillsExpanded, skillsHovered, skillsSubmenuHovered, showSkillMenu, skillsLoading])

  const cleanupVoice = useCallback(() => {
    // 立即更新状态显示（响应时间 <500ms）
    setVoiceState('idle')
    setVoiceVolume(0)
    setVoiceActive(false)
    voiceActiveRef.current = false

    // 停止音量动画
    if (volumeRafRef.current) {
      cancelAnimationFrame(volumeRafRef.current)
      volumeRafRef.current = 0
    }

    // 断开音频工作节点（停止发送音频数据）
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current.port.onmessage = null
      workletNodeRef.current = null
    }

    // 关闭 AudioContext
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }

    // 停止媒体流（释放麦克风资源）
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    // 发送停止控制消息给后端，触发最终结果处理（含标点恢复）
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'stop' }))
        // 设置安全超时：5秒后如果还没收到 final 消息，强制关闭 WebSocket
        finalMessageTimeoutRef.current = setTimeout(() => {
          if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
          }
          // 兜底：final 没到达时，保留 input 中的 partial 内容（无标点）
          // 重置 prefix ref，避免影响后续录音
          recordingInputPrefixRef.current = 0
          partialTextRef.current = ''
        }, 5000)
      } catch {
        // 发送失败，直接关闭
        wsRef.current.close()
        wsRef.current = null
      }
    }

    if (voiceActiveTimerRef.current) {
      clearTimeout(voiceActiveTimerRef.current)
      voiceActiveTimerRef.current = null
    }
    // 注意：不清理 partialTextRef.current 和 recordingInputPrefixRef.current
    // final 消息到达时需要 partialTextRef 来正确替换 partial 内容，避免重复
    // 如果在此处清理，final 消息会走"追加"分支导致内容重复
  }, [])

  // Textarea 自动调整高度（最小 48px，最大 200px）
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '48px'
      const next = Math.min(inputRef.current.scrollHeight, 200)
      inputRef.current.style.height = `${Math.max(next, 48)}px`
    }
  }, [input])

  const handleSend = useCallback((content: string) => {
    if (!content.trim() || loading) return
    setInput('')
    // 构建上下文：图片 URL + 文件文本内容
    const successFiles = selectedFiles.filter((f) => f.progress === 100 && !f.error)
    const parts: string[] = []
    successFiles.forEach((f) => {
      if (f.kind === 'image') {
        parts.push(`[图片: ${f.originalName}](${f.url})`)
      } else if (f.content) {
        parts.push(`[文件: ${f.originalName}]\n${f.content}`)
      }
    })
    const fileContext = parts.join('\n\n')
    // 发送时清空所有已选择的文件（成功与失败条目一并清理，避免失败条目残留）
    if (selectedFiles.length > 0) {
      setSelectedFiles([])
    }
    const ctx = getContextData?.()
    const combinedCtx = [fileContext, ctx].filter(Boolean).join('\n\n')
    sendMessage(content, combinedCtx || undefined, skillId)
  }, [loading, sendMessage, getContextData, selectedFiles, skillId])

  useImperativeHandle(ref, () => ({
    sendMessage: handleSend,
    setInput: (text: string) => { setInput(text); inputRef.current?.focus() },
  }), [handleSend])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    handleSend(input)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  // 粘贴文本到光标位置（用于右键菜单粘贴）
  const handlePasteText = useCallback((text: string) => {
    const el = inputRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd
    const before = input.slice(0, start)
    const after = input.slice(end)
    const newValue = before + text + after

    setInput(newValue)

    // 恢复光标位置（在 React 状态更新后）
    requestAnimationFrame(() => {
      const cursorPos = start + text.length
      el.setSelectionRange(cursorPos, cursorPos)
      el.focus()
    })
  }, [input])

  const handlePlusClick = () => {
    setShowSkillMenu((p) => !p)
    // 每次打开菜单时强制刷新技能列表，确保 .skill 目录变化能实时反映
    if (!showSkillMenu && showSkillSelection) {
      void fetchSkills(true)
    }
  }

  const handleSkillHeaderClick = () => {
    setSkillsExpanded((p) => {
      const next = !p
      if (next) {
        void fetchSkills(true)
      }
      return next
    })
  }

  const handleSkillSelect = (skill: SkillInfo) => {
    const el = inputRef.current
    const skillText = `/${skill.display_name}`

    if (el && document.activeElement === el) {
      const start = el.selectionStart
      const end = el.selectionEnd
      const before = input.slice(0, start)
      const after = input.slice(end)
      const newValue = before + skillText + after

      setInput(newValue)

      requestAnimationFrame(() => {
        const cursorPos = start + skillText.length
        el.setSelectionRange(cursorPos, cursorPos)
        el.focus()
      })
    } else {
      setInput((prev) => prev + skillText)
      requestAnimationFrame(() => {
        el?.focus()
      })
    }

    setShowSkillMenu(false)
  }

  const handleRetryFetchSkills = () => {
    void fetchSkills(true)
  }

  // ── 技能菜单 hover 状态管理（延迟关闭，避免闪烁）──
  const handleSkillsWrapperEnter = () => {
    if (skillsHoverLeaveTimerRef.current) {
      clearTimeout(skillsHoverLeaveTimerRef.current)
      skillsHoverLeaveTimerRef.current = null
    }
    setSkillsHovered(true)
  }

  const handleSkillsWrapperLeave = () => {
    // 延迟清除，给鼠标穿过 wrapper 与二级菜单之间间隙留出时间
    skillsHoverLeaveTimerRef.current = setTimeout(() => {
      setSkillsHovered(false)
      skillsHoverLeaveTimerRef.current = null
    }, 120)
  }

  const handleSkillsSubmenuEnter = () => {
    if (skillsSubmenuLeaveTimerRef.current) {
      clearTimeout(skillsSubmenuLeaveTimerRef.current)
      skillsSubmenuLeaveTimerRef.current = null
    }
    setSkillsSubmenuHovered(true)
  }

  const handleSkillsSubmenuLeave = () => {
    skillsSubmenuLeaveTimerRef.current = setTimeout(() => {
      setSkillsSubmenuHovered(false)
      skillsSubmenuLeaveTimerRef.current = null
    }, 120)
  }

  // 组件卸载时清理 hover 计时器
  useEffect(() => {
    return () => {
      if (skillsHoverLeaveTimerRef.current) clearTimeout(skillsHoverLeaveTimerRef.current)
      if (skillsSubmenuLeaveTimerRef.current) clearTimeout(skillsSubmenuLeaveTimerRef.current)
    }
  }, [])

  // ── 图片上传 ──

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

  /** 验证单个图片文件 */
  const validateImageFile = (file: File): string | null => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return `不支持的格式 .${ext || '?'}，仅支持 JPG、PNG、WEBP`
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return `图片过大 (${(file.size / 1024 / 1024).toFixed(1)}MB > 5MB)`
    }
    return null
  }

  /** 上传单个图片到服务器（XHR 带进度） */
  const uploadSingleImage = useCallback((file: File, tempId: string) => {
    return new Promise<void>((resolve) => {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/upload/image`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setSelectedFiles((prev) =>
            prev.map((f) => (f.name === tempId ? { ...f, progress: pct } : f))
          )
        }
      }

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.success) {
              setSelectedFiles((prev) =>
                prev.map((f) =>
                  f.name === tempId
                    ? { ...f, url: data.url, size: data.size, progress: 100 }
                    : f
                )
              )
            } else {
              setSelectedFiles((prev) =>
                prev.map((f) =>
                  f.name === tempId
                    ? { ...f, error: data.message || '上传失败', progress: 0 }
                    : f
                )
              )
            }
          } catch {
            setSelectedFiles((prev) =>
              prev.map((f) =>
                f.name === tempId ? { ...f, error: '解析响应失败', progress: 0 } : f
              )
            )
          }
        } else {
          let errMsg = '上传失败'
          try {
            const data = JSON.parse(xhr.responseText)
            errMsg = data.detail || errMsg
          } catch { /* ignore */ }
          setSelectedFiles((prev) =>
            prev.map((f) =>
              f.name === tempId ? { ...f, error: errMsg, progress: 0 } : f
            )
          )
        }
        resolve()
      }

      xhr.onerror = () => {
        setSelectedFiles((prev) =>
          prev.map((f) =>
            f.name === tempId ? { ...f, error: '网络错误，请重试', progress: 0 } : f
          )
        )
        resolve()
      }

      xhr.send(formData)
    })
  }, [])

  /** 处理一批图片文件 */
  const processImageFiles = useCallback(async (fileList: File[]) => {
    // 先做客户端验证
    const validFiles: File[] = []
    const errorEntries: SelectedFileInfo[] = []

    for (const file of fileList) {
      const error = validateImageFile(file)
      if (error) {
        errorEntries.push({
          name: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          originalName: file.name,
          kind: 'image',
          url: '',
          size: file.size,
          progress: 0,
          error,
        })
      } else {
        validFiles.push(file)
      }
    }

    // 添加错误条目（立即展示）
    if (errorEntries.length > 0) {
      setSelectedFiles((prev) => [...prev, ...errorEntries])
    }

    if (validFiles.length === 0) return

    // 为每个有效文件创建占位条目并开始上传
    const tempEntries: SelectedFileInfo[] = validFiles.map((f) => ({
      name: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      originalName: f.name,
      kind: 'image' as const,
      url: '',
      size: f.size,
      progress: 0,
      error: '',
    }))

    setSelectedFiles((prev) => [...prev, ...tempEntries])

    // 逐个上传
    for (let i = 0; i < validFiles.length; i++) {
      await uploadSingleImage(validFiles[i], tempEntries[i].name)
    }
  }, [uploadSingleImage])

  // ── 通用文件选择（文本/代码文件）──

  const FILE_MAX_SIZE = 5 * 1024 * 1024 // 5MB

  const processFileList = useCallback(async (fileList: File[]) => {
    const entries: SelectedFileInfo[] = []
    const reader = new FileReader()

    for (const file of fileList) {
      if (file.size > FILE_MAX_SIZE) {
        entries.push({
          name: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          originalName: file.name,
          kind: 'file',
          url: '',
          size: file.size,
          progress: 0,
          error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB > 5MB)`,
        })
        continue
      }
      try {
        const content = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsText(file)
        })
        entries.push({
          name: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          originalName: file.name,
          kind: 'file',
          url: '',
          size: file.size,
          progress: 100,
          error: '',
          content,
        })
      } catch {
        entries.push({
          name: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          originalName: file.name,
          kind: 'file',
          url: '',
          size: file.size,
          progress: 0,
          error: '文件读取失败',
        })
      }
    }
    if (entries.length > 0) {
      setSelectedFiles((prev) => [...prev, ...entries])
    }
  }, [])

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFileList(Array.from(files))
    }
    e.target.value = ''
  }, [processFileList])

  // ── 点击选择 ──

  const handleSelectImage = useCallback(() => {
    setShowSkillMenu(false)
    imageInputRef.current?.click()
  }, [])

  const handleSelectFile = useCallback(() => {
    setShowSkillMenu(false)
    fileInputRef.current?.click()
  }, [])

  const handleImageInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processImageFiles(Array.from(files))
    }
    e.target.value = ''
  }, [processImageFiles])

  // ── 拖拽上传 ──
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    // 按类型分流：图片走图片上传，其余按文本文件处理，避免拖入 txt 被当作图片报错
    const imageFiles: File[] = []
    const textFiles: File[] = []
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        imageFiles.push(f)
      } else {
        textFiles.push(f)
      }
    }
    if (imageFiles.length > 0) {
      void processImageFiles(imageFiles)
    }
    if (textFiles.length > 0) {
      void processFileList(textFiles)
    }
  }, [processImageFiles, processFileList])

  // ── 删除文件/图片 ──

  const handleRemoveItem = useCallback((index: number) => {
    setSelectedFiles((prev) => {
      const item = prev[index]
      // 如果是已上传成功的图片，从服务器删除
      if (item.kind === 'image' && item.url && item.progress === 100) {
        const filename = item.url.split('/').pop()
        if (filename) {
          fetch(`${API_BASE}/upload/image/${filename}`, { method: 'DELETE' }).catch(() => {})
        }
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleVoiceToggle = async () => {
    if (voiceState === 'connecting') return

    if (voiceState === 'listening') {
      // 停止录音
      cleanupVoice()
      return
    }

    // 开始录音
    setVoiceError('')
    setVoiceState('connecting')
    // 记录录音开始时 input 的长度，final 消息到达时用于截断 partial 内容
    recordingInputPrefixRef.current = input.length

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx

      // 确保 AudioContext 处于运行状态（浏览器自动播放策略可能暂停它）
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }

      const source = audioCtx.createMediaStreamSource(stream)

      // 音量分析器 (平滑处理，60fps 更新)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)

      // 创建一个静音 GainNode 连接到 destination，保持音频图活跃
      // 没有到 destination 的路径，浏览器可能不会处理 AudioWorklet
      const silentGain = audioCtx.createGain()
      silentGain.gain.value = 0
      source.connect(silentGain)
      silentGain.connect(audioCtx.destination)

      const volumeData = new Uint8Array(analyser.frequencyBinCount)
      const updateVolume = () => {
        analyser.getByteTimeDomainData(volumeData)
        let sum = 0
        for (let i = 0; i < volumeData.length; i++) {
          const v = (volumeData[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / volumeData.length)
        const volume = Math.min(1, Math.max(0, rms * 3))
        setVoiceVolume(volume)

        // 声音检测：音量超过阈值 → 绿色激活态；低于阈值 300ms → 恢复红色
        const SOUND_THRESHOLD = 0.06
        if (volume > SOUND_THRESHOLD) {
          if (voiceActiveTimerRef.current) {
            clearTimeout(voiceActiveTimerRef.current)
            voiceActiveTimerRef.current = null
          }
          if (!voiceActiveRef.current) {
            voiceActiveRef.current = true
            setVoiceActive(true)
          }
        } else if (!voiceActiveTimerRef.current && voiceActiveRef.current) {
          voiceActiveTimerRef.current = setTimeout(() => {
            voiceActiveRef.current = false
            setVoiceActive(false)
            voiceActiveTimerRef.current = null
          }, 300)
        }

        volumeRafRef.current = requestAnimationFrame(updateVolume)
      }
      volumeRafRef.current = requestAnimationFrame(updateVolume)

      // 建立 WebSocket 连接（通过 Vite 代理，避免跨域问题）
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}${API_BASE}/speech/stream`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      // WebSocket 连接超时（5秒）
      let connectTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('[Voice] WebSocket 连接超时')
          ws.close()
          setVoiceError('语音服务连接超时，请检查后端是否启动')
          setVoiceState('error')
          setTimeout(() => {
            setVoiceState((s) => (s === 'error' ? 'idle' : s))
            setVoiceError('')
          }, 3000)
          cleanupVoice()
        }
      }, 5000)

      ws.onopen = () => {
        setVoiceState('listening')
        if (connectTimeout) {
          clearTimeout(connectTimeout)
          connectTimeout = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'partial') {
            const cleanedText = cleanRecognizedText(msg.text)
            if (!cleanedText) return

            // 前端快速检测停止指令（<500ms 响应时间）
            const { isStop, cleanedText: stopCleaned } = detectStopCommand(cleanedText)
            if (isStop) {
              // 立即更新状态显示
              const oldPartial = partialTextRef.current
              partialTextRef.current = ''

              setInput((prev) => {
                let cleaned = prev
                if (oldPartial && cleaned.endsWith(oldPartial)) {
                  cleaned = cleaned.slice(0, -oldPartial.length).trimEnd()
                }
                if (stopCleaned) {
                  return cleaned ? cleaned + ' ' + stopCleaned : stopCleaned
                }
                return cleaned
              })
              cleanupVoice()
              return
            }

            // 先保存旧的部分文本，再更新 ref
            const oldPartial = partialTextRef.current
            partialTextRef.current = cleanedText

            setInput((prev) => {
              // 后端每次发送完整的当前部分结果，此处用新的部分文本替换旧的部分文本
              // 使用 endsWith 精确匹配，避免误删用户手动输入中的相同文本
              if (oldPartial && prev.endsWith(oldPartial)) {
                return prev.slice(0, -oldPartial.length) + cleanedText
              }
              // 旧部分文本不在末尾（用户可能编辑了），直接追加
              const trimmed = prev.trimEnd()
              return trimmed ? trimmed + ' ' + cleanedText : cleanedText
            })
          } else if (msg.type === 'stop_detected') {
            // 后端检测到停止指令，立即停止录音
            // 后端会继续发送 final 消息（带标点的完整结果），final 到达时会基于
            // recordingInputPrefixRef 截断并替换，所以这里不需要修改 input
            // 仅触发 cleanupVoice 停止音频采集，等待 final 消息
            cleanupVoice()
          } else if (msg.type === 'final') {
            const cleanedText = cleanRecognizedText(msg.text)
            partialTextRef.current = ''

            setInput((prev) => {
              if (!cleanedText) return prev
              // final 是后端发送的完整最终结果（带标点）
              // 录音过程中 input 只包含 partial 内容（可能加上录音前用户手动输入的前缀）
              // 直接截断到录音开始时的 input 长度，然后用 final 替换语音部分
              // 这样可以彻底避免 partial 与 final 的内容重复
              const prefixLen = recordingInputPrefixRef.current
              const prefix = prefixLen > 0 ? prev.slice(0, prefixLen).trimEnd() : ''
              recordingInputPrefixRef.current = 0
              return prefix ? prefix + ' ' + cleanedText : cleanedText
            })

            // 清除安全超时
            if (finalMessageTimeoutRef.current) {
              clearTimeout(finalMessageTimeoutRef.current)
              finalMessageTimeoutRef.current = null
            }

            // 收到最终结果后关闭 WebSocket（延迟一小段时间确保消息处理完成）
            setTimeout(() => {
              if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
              }
            }, 100)
          } else if (msg.type === 'error') {
            setVoiceError(msg.message || '识别失败')
          }
        } catch {
          // 忽略解析错误
        }
      }

      ws.onerror = () => {
        console.error('[Voice] WebSocket 连接错误')
        setVoiceError('WebSocket 连接失败，请检查后端服务')
        setVoiceState('error')
        // 3秒后自动清除错误状态
        setTimeout(() => {
          setVoiceState((s) => (s === 'error' ? 'idle' : s))
          setVoiceError('')
        }, 3000)
        cleanupVoice()
      }

      ws.onclose = (event) => {
        const currentState = voiceState as 'idle' | 'connecting' | 'listening' | 'error'
        // 非正常关闭（code !== 1000）时，可能表示连接异常
        if (event.code !== 1000 && event.code !== 1001) {
          if (currentState === 'listening' || currentState === 'connecting') {
            setVoiceError('语音服务连接中断')
            setVoiceState('error')
            setTimeout(() => {
              setVoiceState((s) => (s === 'error' ? 'idle' : s))
              setVoiceError('')
            }, 3000)
          }
        }
        // 无论正常还是异常关闭，都要清理资源
        if (currentState === 'listening' || currentState === 'connecting') {
          cleanupVoice()
        }
        // 重置录音前缀长度，避免影响下次录音
        recordingInputPrefixRef.current = 0
      }

      // 音频处理：AudioWorkletNode 将 PCM 数据通过 WebSocket 发送
      // 加载 AudioWorklet 处理器模块
      try {
        await audioCtx.audioWorklet.addModule('/audio-processor.js')
      } catch (err) {
        console.error('[Voice] AudioWorklet 加载失败:', err)
        setVoiceError('音频处理器加载失败，请刷新页面重试')
        setVoiceState('error')
        setTimeout(() => {
          setVoiceState((s) => (s === 'error' ? 'idle' : s))
          setVoiceError('')
        }, 3000)
        cleanupVoice()
        return
      }

      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor')
      workletNodeRef.current = workletNode

      // 接收 worklet 传来的 PCM 数据，通过 WebSocket 发送
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      }

      source.connect(workletNode)
      // AudioWorkletNode 不需要连接到 destination —— 只捕获音频，不播放

    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风'
        : '无法访问麦克风，请检查设备连接'
      setVoiceError(msg)
      setVoiceState('error')
      // 3秒后自动清除错误状态
      setTimeout(() => {
        setVoiceState((s) => (s === 'error' ? 'idle' : s))
        setVoiceError('')
      }, 3000)
    }
  }

  return (
    <div className="input-area">
      {/* 隐藏的文件选择器 */}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleImageInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* 拖拽上传覆盖层 */}
      {isDragOver && (
        <div
          className="image-drop-overlay"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="image-drop-hint">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>释放以上传图片</span>
            <span className="image-drop-sub">支持 JPG / PNG / WEBP，单张不超过 5MB</span>
          </div>
        </div>
      )}

      <form className="input-bar" onSubmit={handleSubmit}>
        {/* Textarea - 放在 form 内部正上方，占用整行 */}
        <div
          className={`input-textarea-wrapper-full${isDragOver ? ' drag-over' : ''}`}
          ref={dropZoneRef}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 已选择文件和图片 - 显示在 textarea 左上方 */}
          {selectedFiles.length > 0 && (
            <div className="image-thumbnails-bar">
              {selectedFiles.map((f, idx) => (
                <div key={f.name} className={`image-thumb-wrapper${f.error ? ' has-error' : ''}`}>
                  {/* 缩略图 / 上传中 / 错误状态 */}
                  {f.error ? (
                    <div className="image-thumb-error" title={f.error}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span className="image-thumb-filename">{f.originalName}</span>
                    </div>
                  ) : f.kind === 'file' ? (
                    /* 文本文件：显示文件图标 */
                    <div className="image-thumb-file">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                  ) : f.progress === 100 ? (
                    /* 图片：显示缩略图 */
                    <img
                      className="image-thumb-preview"
                      src={f.url}
                      alt={f.originalName}
                      onDoubleClick={() => {
                        const idx = selectedFiles.findIndex((x) => x.name === f.name)
                        setPreviewError(false)
                        setPreviewIndex(idx >= 0 ? idx : null)
                      }}
                    />
                  ) : (
                    /* 图片上传中：spinner */
                    <div className="image-thumb-uploading">
                      <div className="image-thumb-spinner" />
                      <span className="image-thumb-progress">{f.progress}%</span>
                    </div>
                  )}
                  {/* 文件名提示 */}
                  <span className="image-thumb-name" title={f.originalName}>{f.originalName}</span>
                  {/* 删除按钮 */}
                  <button
                    type="button"
                    className="image-thumb-remove"
                    onClick={() => handleRemoveItem(idx)}
                    aria-label={`移除 ${f.originalName}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY })
            }}
            placeholder="输入您的问题，探索命理奥秘..."
            disabled={loading}
            rows={1}
          />
        </div>

        <div className="input-controls-row">
          {/* 加号图标按钮 - 位于对话框前方，点击弹出菜单 */}
          <div className="skill-plus-wrapper" ref={skillMenuRef}>
            <button
              type="button"
              className="skill-plus-btn"
              onClick={handlePlusClick}
              disabled={loading}
              title="菜单"
              aria-label="菜单"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {showSkillMenu && (
              <div className="skill-plus-menu" role="menu">
                {showSkillSelection && (
                  <>
                    {/* 技能 菜单项 - hover 展开二级菜单（点击亦可展开） */}
                    <div
                      className="skill-menu-category-wrapper"
                      onMouseEnter={handleSkillsWrapperEnter}
                      onMouseLeave={handleSkillsWrapperLeave}
                    >
                      <button
                        type="button"
                        className={`skill-menu-category${(skillsExpanded || skillsHovered || skillsSubmenuHovered) ? ' expanded' : ''}`}
                        onClick={handleSkillHeaderClick}
                        aria-expanded={skillsExpanded || skillsHovered || skillsSubmenuHovered}
                      >
                        <span className="skill-category-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                        </span>
                        <span className="skill-category-label">技能</span>
                        <svg className={`skill-category-arrow${(skillsExpanded || skillsHovered || skillsSubmenuHovered) ? ' expanded' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7 10l5 5 5-5z" />
                        </svg>
                      </button>
                    </div>

                    {/* 技能列表 - 作为 .skill-plus-menu 的直接子元素，定位基于一级菜单整体
                        使 up-right 展开时底部 = 一级菜单外边框顶部，紧密对齐 */}
                    {(skillsExpanded || skillsHovered || skillsSubmenuHovered) && (
                      <div
                        className={`skill-menu-items ${submenuDirection}`}
                        ref={skillsSubmenuRef}
                        onMouseEnter={handleSkillsSubmenuEnter}
                        onMouseLeave={handleSkillsSubmenuLeave}
                      >
                        {skillsLoading && (
                          <div className="skill-menu-loading">
                            <span className="skill-spinner" />
                            <span>加载中...</span>
                          </div>
                        )}
                        {!skillsLoading && skillsError && (
                          <div className="skill-menu-error">
                            <span>加载失败：{skillsError}</span>
                            <button type="button" className="skill-retry-btn" onClick={handleRetryFetchSkills}>
                              重试
                            </button>
                          </div>
                        )}
                        {!skillsLoading && !skillsError && skills.length === 0 && (
                          <div className="skill-menu-empty">暂无可用技能</div>
                        )}
                        {!skillsLoading && !skillsError && skills.map((skill) => (
                          <button
                            key={skill.name}
                            type="button"
                            className="skill-menu-item"
                            onClick={() => handleSkillSelect(skill)}
                          >
                            <span className={`skill-item-emoji theme-${getSkillIconTheme(skill)}`}>
                              {getSkillEmoji(skill)}
                            </span>
                            <span className="skill-item-text">
                              <span className="skill-item-name">{skill.display_name}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 分隔线 */}
                    <div className="skill-menu-divider" />
                  </>
                )}

                {/* 上传图片 */}
                <button
                  type="button"
                  className="skill-menu-item image-menu-item"
                  onClick={handleSelectImage}
                >
                  <span className="skill-item-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </span>
                  <span className="skill-item-text">
                    <span className="skill-item-name">上传图片</span>
                    <span className="skill-item-desc">点击或拖拽上传</span>
                  </span>
                </button>

                {/* 选择文件 */}
                <button
                  type="button"
                  className="skill-menu-item image-menu-item"
                  onClick={handleSelectFile}
                >
                  <span className="skill-item-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </span>
                  <span className="skill-item-text">
                    <span className="skill-item-name">选择文件</span>
                    <span className="skill-item-desc">选取文本/代码文件</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 按钮组 - 放在 div 最后边区域 */}
          <div className="input-controls-buttons">
            {/* Model mode switcher */}
            <div className="model-mode-wrapper" ref={modelMenuRef}>
              <button
                type="button"
                className={`model-mode-btn ${modelMode}`}
                onClick={() => setShowModelMenu((p) => !p)}
                disabled={loading}
                title={modelMode === 'fast' ? '快速模式' : '深度思考模式'}
              >
                <span className="model-mode-label">{modelMode === 'fast' ? '⚡ 快速' : '🧠 深度思考'}</span>
                <svg className={`model-mode-arrow${showModelMenu ? ' expanded' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>

              {showModelMenu && (
                <div className="model-mode-menu">
                  <button
                    type="button"
                    className={`model-mode-option${modelMode === 'fast' ? ' active' : ''}`}
                    onClick={() => { setModelMode('fast'); setShowModelMenu(false) }}
                  >
                    <span>⚡ 快速模式</span>
                    <span className="model-mode-desc">响应更快</span>
                  </button>
                  <button
                    type="button"
                    className={`model-mode-option${modelMode === 'think' ? ' active' : ''}`}
                    onClick={() => { setModelMode('think'); setShowModelMenu(false) }}
                  >
                    <span>🧠 深度思考</span>
                    <span className="model-mode-desc">推理更深入</span>
                  </button>
                </div>
              )}
            </div>

            {/* 语音录入按钮 - 流式识别 + 音量可视化 */}
            <button
              type="button"
              className={`voice-mic-btn${voiceState === 'listening' ? ' recording' : ''}${voiceState === 'connecting' ? ' connecting' : ''}${voiceState === 'error' ? ' error' : ''}${voiceState === 'listening' && voiceActive ? ' sound-active' : ''}`}
              onClick={handleVoiceToggle}
              disabled={loading || voiceState === 'connecting'}
              title={voiceError || (voiceState === 'connecting' ? '连接中...' : voiceState === 'listening' ? (voiceActive ? '正在录音 ● 检测到声音' : '正在录音，点击停止') : '语音录入')}
              aria-label={voiceState === 'listening' ? '停止录音' : '开始录音'}
            >
              {voiceState === 'listening' ? (
                <VoiceWave
                  volume={voiceVolume}
                  waveStyle="smooth"
                  waveCount={3}
                  speed={1}
                  opacity={0.7}
                  width={80}
                  height={20}
                />
              ) : voiceState === 'connecting' ? (
                <span className="voice-spinner" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>

            {/* Send / Stop button */}
            {loading ? (
              <button type="button" className="send-btn stop-active" onClick={stopGeneration} aria-label="停止生成">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            ) : (
              <button type="submit" className="send-btn" disabled={!input.trim()} aria-label="发送">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          textareaEl={inputRef.current}
          onPasteText={handlePasteText}
        />
      )}

      {/* 图片预览浮层（双击缩略图打开，支持上一张/下一张、键盘导航、错误提示） */}
      {previewIndex !== null && selectedFiles[previewIndex] && (
        <div
          className="image-preview-overlay"
          ref={previewOverlayRef}
          onClick={() => setPreviewIndex(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPreviewIndex(null)
            else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              setPreviewError(false)
              setPreviewIndex((i) => (i === null ? null : (i - 1 + selectedFiles.length) % selectedFiles.length))
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              setPreviewError(false)
              setPreviewIndex((i) => (i === null ? null : (i + 1) % selectedFiles.length))
            }
          }}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
        >
          <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
            {/* 顶部工具栏：文件名 + 计数 + 关闭 */}
            <div className="image-preview-toolbar">
              <span className="image-preview-name" title={selectedFiles[previewIndex].originalName}>
                {selectedFiles[previewIndex].originalName}
              </span>
              <span className="image-preview-counter">
                {previewIndex + 1} / {selectedFiles.length}
              </span>
              <button
                className="image-preview-close"
                onClick={() => setPreviewIndex(null)}
                aria-label="关闭预览"
                type="button"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 主图区域：上一张按钮 + 图片 + 下一张按钮 */}
            <div className="image-preview-main">
              {selectedFiles.length > 1 && (
                <button
                  className="image-preview-nav image-preview-prev"
                  onClick={() => {
                    setPreviewError(false)
                    setPreviewIndex((i) => (i === null ? null : (i - 1 + selectedFiles.length) % selectedFiles.length))
                  }}
                  aria-label="上一张"
                  type="button"
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}

              <div className="image-preview-stage">
                {previewError ? (
                  <div className="image-preview-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>图片加载失败</span>
                    <span className="image-preview-error-hint">该文件可能已被删除或路径无效</span>
                  </div>
                ) : (
                  <img
                    key={selectedFiles[previewIndex].name}
                    className="image-preview-full"
                    src={selectedFiles[previewIndex].url}
                    alt={selectedFiles[previewIndex].originalName}
                    onError={() => setPreviewError(true)}
                  />
                )}
              </div>

              {selectedFiles.length > 1 && (
                <button
                  className="image-preview-nav image-preview-next"
                  onClick={() => {
                    setPreviewError(false)
                    setPreviewIndex((i) => (i === null ? null : (i + 1) % selectedFiles.length))
                  }}
                  aria-label="下一张"
                  type="button"
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* 底部操作提示 */}
            <div className="image-preview-hint">
              <span>点击空白处或 Esc 关闭</span>
              {selectedFiles.length > 1 && <span>← / → 切换</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default InputBar
