/**
 * 麻衣神相 - 面相手相分析主组件（单页面分区布局）
 *
 * 功能流程：
 * 1. 信息配置：分析类型、姓名、性别、采集方式
 * 2. 图像采集：摄像头实时采集 / 图片上传 + MediaPipe 特征提取
 * 3. 分析结果：特征摘要 + 详情 + 保存/报告
 *
 * 隐私方案：仅上传可量化特征数据，原始图像不上传至 LLM。
 * 掌纹线通过 Hessian 脊线检测自动识别，或由 LLM 根据可量化特征推断。
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { getErrorMessage } from '../utils/helpers'
import { useFaceLandmarker, useHandLandmarker } from '../hooks/useLandmarkers'
import { usePhysiognomyState } from '../hooks/usePhysiognomyState'
import { extractFaceFeatures, type FaceFeatures } from '../utils/physiognomyFeatures'
import { extractHandFeatures, type HandFeatures } from '../utils/handFeatures'
import { detectPalmLines } from '../utils/palmLineDetector'
import {
  serializePhysiognomyContext,
  generateFeatureSummary,
  type PhysiognomyContextData,
} from '../utils/serializePhysiognomyContext'
import type { ArchiveItem } from '../context/ArchiveContext'
import ArchivePickerModal from './ArchivePickerModal'
import PhysiognomyReportModal from './PhysiognomyReportModal'
import PhysiognomyInfoModal from './PhysiognomyInfoModal'
import BackButton from './BackButton'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { useAuth } from '../context/AuthContext'
import './PhysiognomyForm.css'

// ── 组件 Props ──
export interface PhysiognomyFormProps {
  /** 容器宽度（用于自适应） */
  containerWidth?: number
  /** 上下文数据变化回调（供 FeatureContent 注入到命理问答） */
  onContextChange?: (contextData: string | null) => void
  /** 切换排盘结果收缩状态 */
  onToggleCollapse?: () => void
  /** 排盘结果收缩状态（由父组件控制，用户提交问题后自动收缩） */
  chartCollapsed?: boolean
  /** 收缩信号量：每次发送新问题时递增，强制触发收缩（解决 chartCollapsed 已为 true 时再次发问不触发 useEffect 的问题） */
  collapseNonce?: number
}

// ── 获取 Token ──
function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export default function PhysiognomyForm({
  onContextChange,
  onToggleCollapse: _onToggleCollapse,
  chartCollapsed,
  collapseNonce,
}: PhysiognomyFormProps) {
  // ── 持久化状态（跨组件实例共享，切换功能/刷新不丢失） ──
  const {
    phase, setPhase,
    analysisType, setAnalysisType,
    captureMethod, setCaptureMethod,
    name, setName,
    gender, setGender,
    images, setImages,
    faceFeatures, setFaceFeatures,
    handFeatures, setHandFeatures,
    selectedArchiveId, setSelectedArchiveId,
    resetToCapture,
    fullReset,
  } = usePhysiognomyState()

  const { openLoginModal } = useAuth()

  // ── 非持久化的临时状态 ──
  const [showArchivePicker, setShowArchivePicker] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState('')
  const [detectProgress, setDetectProgress] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [cardExpanded, setCardExpanded] = useState(true)

  // 同步父组件收缩状态：用户提交问题后自动收缩排盘详情，让位对话
  useEffect(() => {
    if (chartCollapsed !== undefined) {
      setCardExpanded(!chartCollapsed)
    }
  }, [chartCollapsed])

  // 监听收缩信号量：每次发送新问题时强制收缩排盘详情
  // （解决用户手动展开后再次发问时 chartCollapsed 已为 true 不触发上面 useEffect 的问题）
  useEffect(() => {
    if (collapseNonce !== undefined && collapseNonce > 0) {
      setCardExpanded(false)
    }
  }, [collapseNonce])

  // 选择档案（由共享 ArchivePickerModal 回调）
  const handleSelectArchive = useCallback((archive: ArchiveItem) => {
    setName(archive.name || '')
    setGender((archive.gender as '男' | '女') || '男')
    setSelectedArchiveId(archive.id)
  }, [setName, setGender, setSelectedArchiveId])

  // ── 摄像头 ──
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)

  // ── MediaPipe Hooks ──
  const faceLM = useFaceLandmarker()
  const handLM = useHandLandmarker()

  // ── 上下文数据变化通知（根据检测到的特征自动推导分析类型） ──
  const contextData: PhysiognomyContextData | null = (() => {
    if (phase !== 'result') return null
    if (faceFeatures && handFeatures) {
      return { analysisType: 'combined', name, gender, captureMethod, faceFeatures, handFeatures }
    }
    if (faceFeatures) {
      return { analysisType: 'face', name, gender, captureMethod, faceFeatures }
    }
    if (handFeatures) {
      return { analysisType: 'hand', name, gender, captureMethod, handFeatures }
    }
    return null
  })()

  useEffect(() => {
    if (onContextChange) {
      onContextChange(contextData ? serializePhysiognomyContext(contextData) : null)
    }
  }, [contextData, onContextChange])

  // ── 启动摄像头 ──
  const startCamera = useCallback(async () => {
    // 先清理任何遗留的 stream，避免摄像头被自身占用导致 NotReadableError
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 1280, height: 720 },
      })
      streamRef.current = stream
      setCameraActive(true)
      setDetectError('')
      // video 元素始终在 DOM 中（用 display 控制可见性），可直接绑定 srcObject
      if (videoRef.current) {
        videoRef.current.muted = true
        videoRef.current.srcObject = stream
        videoRef.current.play().catch((err) => {
          console.warn('[Physiognomy] video play failed:', (getErrorMessage(err, "")) || err)
        })
      }
    } catch (e: unknown) {
      const errName = (getErrorMessage(e, "")) || ''
      let msg = '摄像头启动失败，请检查权限'
      if (errName === 'NotAllowedError' || errName === 'SecurityError') {
        msg = '摄像头权限被拒绝。请在浏览器地址栏点击锁图标，允许本站使用摄像头；或改用"图片上传"方式。'
      } else if (errName === 'NotFoundError' || errName === 'OverconstrainedError') {
        msg = '未检测到摄像头设备。请检查设备连接，或改用"图片上传"方式。'
      } else if (errName === 'NotReadableError') {
        msg = '摄像头被其他应用占用（可能是上次未正常释放，或其他程序正在使用）。请关闭占用摄像头的程序后点击"重试"，或改用"图片上传"方式。'
      } else if (errName === 'PermissionDeniedError') {
        msg = '摄像头权限被拒绝，请在浏览器设置中允许访问。'
      }
      setDetectError(msg)
    }
  }, [])

  // ── 摄像头激活后将 stream 绑定到 video 元素（备用，处理 HMR 重新挂载） ──
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      const v = videoRef.current
      v.muted = true
      v.srcObject = streamRef.current
      v.play().catch((err) => {
        console.warn('[Physiognomy] video play failed:', (getErrorMessage(err, "")) || err)
      })
    }
  }, [cameraActive])

  // ── 停止摄像头 ──
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }, [])

  // ── 拍照（添加到图片列表，不停止摄像头以支持多拍） ──
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // 镜像翻转（前置摄像头）
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setImages((prev) => [...prev, {
      id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: dataUrl,
      source: 'camera',
      type: null,
      width: canvas.width,
      height: canvas.height,
    }])
  }, [])

  // ── 处理上传图片（支持批量多选） ──
  const handleUpload = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        const img = new Image()
        img.onload = () => {
          setImages((prev) => [...prev, {
            id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            data: dataUrl,
            source: 'upload',
            type: null,
            width: img.width,
            height: img.height,
          }])
        }
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    }
    setDetectError('')
  }, [])

  // ── 删除单张图片 ──
  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  // ── 清空所有图片（完全重置） ──
  const clearAllImages = useCallback(() => {
    fullReset()
    setDetectError('')
    setDetectProgress('')
  }, [fullReset])

  // ── 执行特征提取（全自动检测：面相/手相/正面/侧面） ──
  const handleDetect = useCallback(async () => {
    if (images.length === 0) return
    setDetecting(true)
    setDetectError('')
    setDetectProgress('正在加载 AI 检测模型...')

    try {
      await faceLM.load()
      await handLM.load()

      console.log('[Physiognomy] faceLM status:', faceLM.status, 'handLM status:', handLM.status, '| analysisType:', analysisType, '| images:', images.length)

      let bestFace: FaceFeatures | null = null
      let bestFaceConfidence = 0
      let bestHand: HandFeatures | null = null
      let bestHandConfidence = 0
      let faceCount = 0
      let handCount = 0
      const updatedTypes: Record<string, 'face' | 'hand' | null> = {}

      for (let i = 0; i < images.length; i++) {
        const captured = images[i]
        setDetectProgress(`正在识别第 ${i + 1}/${images.length} 张图片...`)

        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('图片加载失败'))
          img.src = captured.data
        })
        if (img.decode) {
          await img.decode()
        }

        const [faceResult, handResult] = await Promise.all([
          faceLM.detect(img),
          handLM.detect(img),
        ])
        const hasFace = faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0
        const hasHand = handResult && handResult.landmarks && handResult.landmarks.length > 0
        const faceStatus = !faceResult ? 'detect-failed' : hasFace ? `${faceResult.faceLandmarks.length} landmarks` : 'no-landmarks'
        const handStatus = !handResult ? 'detect-failed' : hasHand ? `${handResult.landmarks.length} landmarks` : 'no-landmarks'
        console.log(`[Physiognomy] img ${i + 1}: face=[${faceStatus}], hand=[${handStatus}]`)

        if (hasFace) {
          const landmarks = faceResult.faceLandmarks[0]
          const blendshapes = faceResult.faceBlendshapes?.[0]?.categories
          const transformMatrix = faceResult.facialTransformationMatrixes?.[0] as unknown as { data: number[] } | undefined
          setDetectProgress(`正在分析第 ${i + 1} 张图片的面部特征...`)
          const features = extractFaceFeatures(landmarks, blendshapes, transformMatrix)
          if (features.confidence > bestFaceConfidence) { bestFaceConfidence = features.confidence; bestFace = features }
          faceCount++
          updatedTypes[captured.id] = 'face'
        }
        if (hasHand) {
          const landmarks = handResult.landmarks[0]
          const handedness = handResult.handednesses?.[0]?.[0]?.categoryName as 'Left' | 'Right' || 'Unknown'
          setDetectProgress(`正在检测第 ${i + 1} 张图片的掌纹线...`)
          let palmLines = undefined
          try {
            palmLines = detectPalmLines(img, landmarks as { x: number; y: number }[], handedness)
          } catch {
          }
          const features = extractHandFeatures(landmarks, handedness, palmLines)
          if (features.confidence > bestHandConfidence) { bestHandConfidence = features.confidence; bestHand = features }
          handCount++
          updatedTypes[captured.id] = 'hand'
        }
        if (!hasFace && !hasHand) {
          updatedTypes[captured.id] = null
        }
      }

      setImages((prev) => prev.map((img) => ({
        ...img,
        type: updatedTypes[img.id] ?? img.type,
      })))

      setDetectProgress('')

      if (faceCount === 0 && handCount === 0) {
        throw new Error('所有图片均未检测到面部或手部，请确保图片清晰且包含面部或手掌')
      }

      setFaceFeatures(bestFace)
      setHandFeatures(bestHand)

      // 自动设置分析类型
      if (faceCount > 0 && handCount > 0) {
        setAnalysisType('combined')
      } else if (faceCount > 0) {
        setAnalysisType('face')
      } else if (handCount > 0) {
        setAnalysisType('hand')
      }

      setPhase('result')
    } catch (e: unknown) {
      setDetectError(getErrorMessage(e) || '特征提取失败，请重试')
    } finally {
      setDetecting(false)
      setDetectProgress('')
    }
  }, [images, faceLM, handLM, setAnalysisType, setFaceFeatures, setHandFeatures, setImages, setPhase])

  // ── 重新分析（回到采集阶段，保留已上传的图片和特征） ──
  const handleReset = useCallback(() => {
    stopCamera()
    resetToCapture()
    setShowArchivePicker(false)
    setDetectError('')
    setDetectProgress('')
  }, [stopCamera, resetToCapture])

  // ── 卸载时关闭摄像头 ──
  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ════════════════════════════════════════
  // 渲染 — 单页面分区布局
  // ════════════════════════════════════════

  const summary = contextData ? generateFeatureSummary(contextData) : ''
  const analysisTypeLabel = faceFeatures && handFeatures ? '综合' : handFeatures ? '手相' : '面相'
  const captureMethodLabel = captureMethod === 'camera' ? '摄像头采集' : '图片上传'

  return (
    <div className="feature-bazi">
      {phase === 'result' ? (
        /* ════ 结果阶段：bazi-combined-card（与八字/紫微统一） ════ */
        <div className="bazi-result physio-result">
          {detectError && (
            <div className="report-error-banner">
              <span>{detectError}</span>
              <button type="button" onClick={() => setDetectError('')}>✕</button>
            </div>
          )}
          <div className="bazi-combined-card">
            {/* ── 卡片头：三栏（左:返回采集 / 中:命主信息 / 右:收缩+解盘报告） ── */}
            <div className="bazi-card-header" onClick={() => setCardExpanded((v) => !v)}>
              <div className="bazi-left-actions" onClick={(e) => e.stopPropagation()}>
                <BackButton onClick={() => handleReset()} />
                <button
                  type="button"
                  className="bazi-toolbar-btn"
                  onClick={() => setShowInfoModal(true)}
                  title="排盘信息"
                >
                  排盘信息
                </button>
              </div>
              <div className="bazi-card-title">
                <div className="bazi-info-card">
                  <h2 className="bazi-name">
                    {name || '匿名'}
                    <span className="bazi-gender-tag">{analysisTypeLabel}</span>
                  </h2>
                  <p className="bazi-desc">{images.length} 张图片 · {captureMethodLabel}</p>
                  <p className="bazi-pattern-desc">
                    分析类型 <span className="bazi-pattern-value">{analysisTypeLabel}</span>
                    {faceFeatures && (<> · 朝向 <span className="bazi-pattern-value">{faceFeatures.pose.poseCN}</span></>)}
                    {handFeatures && (<> · 采集手 <span className="bazi-pattern-value">{handFeatures.handedness === 'Right' ? '右手' : handFeatures.handedness === 'Left' ? '左手' : '未知'}</span></>)}
                  </p>
                </div>
              </div>
              <div className="bazi-card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="bazi-expand-btn"
                  aria-expanded={cardExpanded}
                  onClick={() => setCardExpanded((v) => !v)}
                >
                  {cardExpanded ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="bazi-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); setShowReport(true); }}
                  style={{ marginTop: '4px' }}
                >
                  解盘报告
                </button>
              </div>
            </div>
            {/* ── 可收缩内容区 ── */}
            <div className={`bazi-card-content ${cardExpanded ? 'expanded' : 'collapsed'}`}>
              <div className="bazi-chart-content-wrapper">
                <div className="physio-result-content">
                  {/* 特征摘要 */}
                  <div className="physio-result-section">
                    <h3 className="physio-section-title">📊 特征摘要</h3>
                    <p className="physio-summary-text">{summary}</p>
                  </div>

                  {/* 面相特征详情 */}
                  {faceFeatures && (
                    <div className="physio-result-section">
                      <h3 className="physio-section-title">
                        👁 面相特征
                        <span className="physio-pose-tag">{faceFeatures.pose.poseCN}</span>
                      </h3>
                      <div className="physio-feature-grid">
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">脸型</span>
                          <span className="physio-feature-value">{faceFeatures.faceShape.shapeCN}</span>
                          <span className="physio-feature-desc">{faceFeatures.faceShape.description}</span>
                        </div>
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">三停</span>
                          <span className="physio-feature-value">
                            {faceFeatures.sanTing.balanced ? '三停均等' : `${faceFeatures.sanTing.longest === 'upper' ? '上停' : faceFeatures.sanTing.longest === 'middle' ? '中停' : '下停'}长`}
                          </span>
                          <span className="physio-feature-desc">{faceFeatures.sanTing.description}</span>
                        </div>
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">对称性</span>
                          <span className="physio-feature-value">{(faceFeatures.symmetry.overallScore * 100).toFixed(0)}%</span>
                          <span className="physio-feature-desc">{faceFeatures.symmetry.description}</span>
                        </div>
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">五官</span>
                          <span className="physio-feature-value">{(faceFeatures.wuGuan.browSymmetry * 100).toFixed(0)}% 对称</span>
                          <span className="physio-feature-desc">{faceFeatures.wuGuan.description}</span>
                        </div>
                      </div>
                      {/* 十二宫状态 */}
                      <div className="physio-gong-grid">
                        {[
                          { label: '命宫', val: faceFeatures.shiErGong.mingGong.status },
                          { label: '财帛宫', val: faceFeatures.shiErGong.caiBo.status },
                          { label: '官禄宫', val: faceFeatures.shiErGong.guanLu.status },
                          { label: '夫妻宫', val: faceFeatures.shiErGong.fuQi.status },
                          { label: '子女宫', val: faceFeatures.shiErGong.ziNv.status },
                          { label: '疾厄宫', val: faceFeatures.shiErGong.jiE.status },
                          { label: '迁移宫', val: faceFeatures.shiErGong.qianYi.status },
                          { label: '交友宫', val: faceFeatures.shiErGong.jiaoYou.status },
                          { label: '田宅宫', val: faceFeatures.shiErGong.tianZhai.status },
                          { label: '福德宫', val: faceFeatures.shiErGong.fuDe.status },
                          { label: '父母宫', val: faceFeatures.shiErGong.fuMu.status },
                          { label: '兄弟宫', val: faceFeatures.shiErGong.xiongDi.status },
                        ].map((g) => (
                          <div key={g.label} className={`physio-gong-tag ${g.val}`}>
                            <span className="physio-gong-name">{g.label}</span>
                            <span className="physio-gong-status">{g.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 手相特征详情 */}
                  {handFeatures && (
                    <div className="physio-result-section">
                      <h3 className="physio-section-title">✋ 手相特征</h3>
                      <div className="physio-feature-grid">
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">掌型</span>
                          <span className="physio-feature-value">{handFeatures.palmShape.palmTypeCN}</span>
                          <span className="physio-feature-desc">{handFeatures.palmShape.description}</span>
                        </div>
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">元素</span>
                          <span className="physio-feature-value">{handFeatures.palmShape.elementCN}</span>
                        </div>
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">2D:4D比</span>
                          <span className="physio-feature-value">{handFeatures.fingerRatios.indexRingRatio.toFixed(2)}</span>
                          <span className="physio-feature-desc">{handFeatures.fingerRatios.description}</span>
                        </div>
                        <div className="physio-feature-item">
                          <span className="physio-feature-label">采集手</span>
                          <span className="physio-feature-value">{handFeatures.handedness === 'Right' ? '右手' : handFeatures.handedness === 'Left' ? '左手' : '未知'}</span>
                        </div>
                      </div>
                      {/* 八丘状态 */}
                      <div className="physio-gong-grid">
                        {[
                          { label: '木星丘', val: handFeatures.palmMounts.jupiter.status },
                          { label: '土星丘', val: handFeatures.palmMounts.saturn.status },
                          { label: '太阳丘', val: handFeatures.palmMounts.apollo.status },
                          { label: '水星丘', val: handFeatures.palmMounts.mercury.status },
                          { label: '金星丘', val: handFeatures.palmMounts.venus.status },
                          { label: '月丘', val: handFeatures.palmMounts.moon.status },
                          { label: '火星丘', val: handFeatures.palmMounts.mars.status },
                          { label: '地丘', val: handFeatures.palmMounts.earth.status },
                        ].map((g) => (
                          <div key={g.label} className={`physio-gong-tag ${g.val}`}>
                            <span className="physio-gong-name">{g.label}</span>
                            <span className="physio-gong-status">{g.val}</span>
                          </div>
                        ))}
                      </div>
                      {/* 掌纹（自动检测 + LLM 深度解读） */}
                      <div className="physio-palm-lines">
                        <h4>掌纹特征</h4>
                        <p className="physio-palm-lines-desc">{handFeatures.palmLines.description}</p>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ════ 采集阶段：保持现有 bazi-form-card ════ */
        <div className="bazi-form-card physio-form-card">
          <h2 className="physio-form-title">输入人员信息</h2>

          {/* ── 错误横幅 ── */}
          {detectError && (
            <div className="report-error-banner">
              <span>{detectError}</span>
              <button type="button" onClick={() => setDetectError('')}>✕</button>
            </div>
          )}

          {/* ════ 分区1：采集配置 ════ */}
          <section className="physio-section">
            <>
              <div className="bazi-form-row">
                <label className="bazi-form-label">姓名</label>
                <div className="bazi-name-input-group">
                  <input
                    type="text"
                    className="bazi-form-input"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (selectedArchiveId) setSelectedArchiveId(null)
                    }}
                    placeholder="请输入姓名（选填）"
                    maxLength={64}
                  />
                  <button
                    type="button"
                    className="bazi-archive-pick-btn"
                    onClick={() => setShowArchivePicker(true)}
                    title="从档案库中选择"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                      <path d="M9 18a2 2 0 0 1-2-2V2h10l4 4v10a2 2 0 0 1-2 2h-3" />
                      <path d="M3 7v14a2 2 0 0 0 2 2h12" />
                      <path d="M14 22v-4a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="bazi-form-row">
                <label className="bazi-form-label">性别</label>
                <div className="bazi-gender-toggle">
                  {(['男', '女'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`bazi-gender-btn${gender === g ? ' active' : ''}`}
                      onClick={() => setGender(g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bazi-form-row">
                <label className="bazi-form-label">采集方式</label>
                <div className="bazi-calendar-toggle">
                  {([
                    { v: 'upload' as const, label: '图片上传' },
                    { v: 'camera' as const, label: '摄像头采集' },
                  ]).map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      className={`bazi-calendar-btn${captureMethod === m.v ? ' active' : ''}`}
                      onClick={() => {
                        if (captureMethod !== m.v) {
                          stopCamera()
                          setCaptureMethod(m.v)
                        }
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
        </section>

        {/* ════ 分区2：图形采集工作区（与信息配置同视图展示） ════ */}
        <section className="physio-section">
            {/* 摄像头区域（采集阶段时显示） */}
            {phase === 'capture' && captureMethod === 'camera' && (
              <div className="physio-camera-section">
                <video
                  ref={videoRef}
                  className="physio-video"
                  autoPlay
                  playsInline
                  muted
                  style={{ transform: 'scaleX(-1)', display: cameraActive ? 'block' : 'none' }}
                />
                {!cameraActive ? (
                  <button type="button" className="bazi-submit-btn" onClick={startCamera}>
                    启动摄像头
                  </button>
                ) : (
                  <div className="physio-camera-actions">
                    <button type="button" className="bazi-submit-btn" onClick={capturePhoto}>
                      拍照
                    </button>
                    <button type="button" className="bazi-submit-btn bazi-submit-btn-secondary" onClick={stopCamera}>
                      关闭摄像头
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 上传区域（采集阶段时显示） */}
            {phase === 'capture' && captureMethod === 'upload' && (
              <div className="physio-upload-section">
                <label className="physio-upload-area">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUpload(e.target.files)
                        e.target.value = ''  // 允许重复选择同一文件
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <div className="physio-upload-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p>点击上传图片（可多选）</p>
                    <span>支持面部照片和手掌照片混合上传，系统自动识别</span>
                  </div>
                </label>
              </div>
            )}

            {/* 多图管理网格 + 提取特征（采集阶段时显示） */}
            {phase === 'capture' && images.length > 0 && (
              <div className="physio-images-section">
                <div className="physio-images-header">
                  <span className="physio-images-count">已添加 {images.length} 张图片</span>
                  <button type="button" className="physio-clear-btn" onClick={clearAllImages}>
                    清空
                  </button>
                </div>
                <div className="physio-image-grid">
                  {images.map((img) => (
                    <div key={img.id} className="physio-image-thumb">
                      <img src={img.data} alt="采集图片" />
                      <button
                        type="button"
                        className="physio-image-remove"
                        onClick={() => removeImage(img.id)}
                        title="删除"
                      >
                        ✕
                      </button>
                      <span className={`physio-image-badge${img.type ? ` ${img.type}` : ''}`}>
                        {img.type === 'face' ? '面相' : img.type === 'hand' ? '手相' : img.source === 'camera' ? '拍照' : '上传'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="physio-preview-actions">
                  <button
                    type="button"
                    className="bazi-submit-btn"
                    onClick={handleDetect}
                    disabled={detecting}
                  >
                    {detecting ? '识别中...' : '提取特征'}
                  </button>
                  <button type="button" className="bazi-submit-btn bazi-submit-btn-secondary" onClick={clearAllImages}>
                    清空重选
                  </button>
                </div>
                {detectProgress && (
                  <p className="physio-loading-hint">{detectProgress}</p>
                )}
                {(faceLM.status === 'loading' || handLM.status === 'loading') && (
                  <p className="physio-loading-hint">正在加载 AI 检测模型，首次加载约需 10 秒...</p>
                )}
                {faceLM.status === 'error' && (
                  <p className="physio-error-hint">面部模型加载失败：{faceLM.error}</p>
                )}
                {handLM.status === 'error' && (
                  <p className="physio-error-hint">手部模型加载失败：{handLM.error}</p>
                )}
              </div>
            )}

            {/* 采集建议 */}
            {phase === 'capture' && images.length === 0 && (
              <div className="physio-tips">
                <h4>采集建议</h4>
                <ul>
                  <li>面部正对镜头，光线均匀，取下帽子、墨镜等遮挡物</li>
                </ul>
                <ul>
                  <li>手掌正对镜头，五指自然张开，掌纹清晰</li>
                  <li>左手主先天，右手主后天，建议双手都采集</li>
                </ul>
                <ul>
                  <li>支持多张图片，自动识别面相/手相及正面/侧面</li>
                  <li>可混合使用图片上传与摄像头采集</li>
                </ul>
              </div>
            )}

          </section>

      </div>
      )}

      {/* 档案选择弹窗 */}
      <ArchivePickerModal
        isOpen={showArchivePicker}
        onClose={() => setShowArchivePicker(false)}
        onSelectArchive={handleSelectArchive}
      />

      {/* 报告弹窗 */}
      {showReport && contextData && (
        <PhysiognomyReportModal
          analysisType={analysisType}
          chartName={name || '命主'}
          contextData={serializePhysiognomyContext(contextData)}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* 排盘信息弹窗 */}
      {showInfoModal && (
        <PhysiognomyInfoModal
          name={name || '命主'}
          gender={gender || '男'}
          analysisType={analysisType}
          captureMethod={captureMethod}
          imageCount={images.length}
          faceFeatures={faceFeatures}
          handFeatures={handFeatures}
          summary={summary}
          onClose={() => setShowInfoModal(false)}
        />
      )}

      {/* 拍照用的隐藏 canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
