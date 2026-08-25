/**
 * 麻衣神相排盘状态持久化 Hook
 *
 * 使用模块级单例 ref 存储排盘状态，确保在组件卸载/重新挂载时
 * （如切换功能模块、页面刷新）状态不丢失。同时将非 transient 数据
 * 序列化到 sessionStorage，处理页面刷新场景。
 *
 * 存储策略：
 * 1. 模块级变量：跨组件实例共享，切换功能模块时保持数据
 * 2. sessionStorage：处理页面刷新，序列化排除检测中间状态
 * 3. 大小保护：数据过大时跳过 sessionStorage 持久化
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { FaceFeatures } from '../utils/physiognomyFeatures'
import type { HandFeatures } from '../utils/handFeatures'
import type { PhysiognomyAnalysisType } from '../utils/serializePhysiognomyContext'

// ── 类型定义 ──
export type Phase = 'capture' | 'result'
export type CaptureMethod = 'camera' | 'upload'

export interface CapturedImage {
  id: string
  data: string
  source: 'upload' | 'camera'
  type: 'face' | 'hand' | null
  width: number
  height: number
}

// ── 持久化状态结构 ──
interface PersistentState {
  phase: Phase
  analysisType: PhysiognomyAnalysisType
  captureMethod: CaptureMethod
  name: string
  gender: '男' | '女'
  images: CapturedImage[]
  faceFeatures: FaceFeatures | null
  handFeatures: HandFeatures | null
  selectedArchiveId: number | null
  savedArchiveId: number | null
}

// ── 默认状态 ──
const DEFAULT_STATE: PersistentState = {
  phase: 'capture',
  analysisType: 'face',
  captureMethod: 'upload',
  name: '',
  gender: '男',
  images: [],
  faceFeatures: null,
  handFeatures: null,
  selectedArchiveId: null,
  savedArchiveId: null,
}

// ── sessionStorage Key ──
const STORAGE_KEY = 'glimmerdao_physiognomy_state'
// sessionStorage 单条目大小限制约 5MB，保守取 4MB
const MAX_STORAGE_BYTES = 4 * 1024 * 1024

// ── 模块级单例存储（跨组件实例共享） ──
let _cachedState: PersistentState | null = null

/**
 * 从 sessionStorage 恢复状态
 */
function loadFromStorage(): PersistentState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // 验证必要字段存在
    if (parsed && typeof parsed === 'object' && 'phase' in parsed && 'images' in parsed) {
      return { ...DEFAULT_STATE, ...parsed }
    }
  } catch {
    // 忽略损坏的存储数据
  }
  return null
}

/**
 * 保存状态到 sessionStorage
 * 遇到 QuotaExceededError 时静默失败
 */
function saveToStorage(state: PersistentState): boolean {
  try {
    const serialized = JSON.stringify(state)
    if (serialized.length > MAX_STORAGE_BYTES) {
      // 数据过大，跳过持久化（仅保留内存中的数据）
      return false
    }
    sessionStorage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

/**
 * 从 sessionStorage 清除状态
 */
export function clearPhysiognomyStorage(): void {
  _cachedState = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}

/**
 * 麻衣神相排盘状态持久化 Hook
 *
 * 提供所有排盘所需的状态及 setter 函数，状态在以下场景保持持久：
 * - 切换功能模块（面相 ↔ 其他功能）
 * - 组件卸载/重新挂载
 * - 页面刷新（通过 sessionStorage）
 */
export function usePhysiognomyState() {
  // ── 初始化：从缓存或 sessionStorage 恢复 ──
  // 每次组件挂载时都检查缓存，确保状态能够正确恢复
  if (!_cachedState) {
    _cachedState = loadFromStorage() || { ...DEFAULT_STATE }
  }

  const [phase, setPhaseState] = useState<Phase>(_cachedState!.phase)
  const [analysisType, setAnalysisTypeState] = useState<PhysiognomyAnalysisType>(_cachedState!.analysisType)
  const [captureMethod, setCaptureMethodState] = useState<CaptureMethod>(_cachedState!.captureMethod)
  const [name, setNameState] = useState<string>(_cachedState!.name)
  const [gender, setGenderState] = useState<'男' | '女'>(_cachedState!.gender)
  const [images, setImagesState] = useState<CapturedImage[]>(_cachedState!.images)
  const [faceFeatures, setFaceFeaturesState] = useState<FaceFeatures | null>(_cachedState!.faceFeatures)
  const [handFeatures, setHandFeaturesState] = useState<HandFeatures | null>(_cachedState!.handFeatures)
  const [selectedArchiveId, setSelectedArchiveIdState] = useState<number | null>(_cachedState!.selectedArchiveId)
  const [savedArchiveId, setSavedArchiveIdState] = useState<number | null>(_cachedState!.savedArchiveId)

  // ── 构建当前快照 ──
  const getSnapshot = useCallback((): PersistentState => ({
    phase,
    analysisType,
    captureMethod,
    name,
    gender,
    images,
    faceFeatures,
    handFeatures,
    selectedArchiveId,
    savedArchiveId,
  }), [phase, analysisType, captureMethod, name, gender, images, faceFeatures, handFeatures, selectedArchiveId, savedArchiveId])

  // ── 状态变化时同步到模块级缓存和 sessionStorage ──
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const snapshot = getSnapshot()
    _cachedState = snapshot
    saveToStorage(snapshot)
  }, [getSnapshot])

  // ── Setter 函数（统一同步更新缓存） ──
  const setPhase = useCallback((p: Phase) => {
    setPhaseState(p)
    if (_cachedState) _cachedState.phase = p
  }, [])

  const setAnalysisType = useCallback((t: PhysiognomyAnalysisType) => {
    setAnalysisTypeState(t)
    if (_cachedState) _cachedState.analysisType = t
  }, [])

  const setCaptureMethod = useCallback((m: CaptureMethod) => {
    setCaptureMethodState(m)
    if (_cachedState) _cachedState.captureMethod = m
  }, [])

  const setName = useCallback((n: string) => {
    setNameState(n)
    if (_cachedState) _cachedState.name = n
  }, [])

  const setGender = useCallback((g: '男' | '女') => {
    setGenderState(g)
    if (_cachedState) _cachedState.gender = g
  }, [])

  const setImages = useCallback((updater: CapturedImage[] | ((prev: CapturedImage[]) => CapturedImage[])) => {
    setImagesState(updater)
    if (_cachedState) {
      _cachedState.images = typeof updater === 'function'
        ? (updater as (prev: CapturedImage[]) => CapturedImage[])(_cachedState.images)
        : updater
    }
  }, [])

  const setFaceFeatures = useCallback((f: FaceFeatures | null) => {
    setFaceFeaturesState(f)
    if (_cachedState) _cachedState.faceFeatures = f
  }, [])

  const setHandFeatures = useCallback((h: HandFeatures | null) => {
    setHandFeaturesState(h)
    if (_cachedState) _cachedState.handFeatures = h
  }, [])

  const setSelectedArchiveId = useCallback((id: number | null) => {
    setSelectedArchiveIdState(id)
    if (_cachedState) _cachedState.selectedArchiveId = id
  }, [])

  const setSavedArchiveId = useCallback((id: number | null) => {
    setSavedArchiveIdState(id)
    if (_cachedState) _cachedState.savedArchiveId = id
  }, [])

  // ── 重置到采集阶段（保留图片和特征，仅切换 phase） ──
  const resetToCapture = useCallback(() => {
    setPhase('capture')
    setSavedArchiveId(null)
  }, [setPhase])

  // ── 完全重置（清空所有数据） ──
  const fullReset = useCallback(() => {
    setPhase('capture')
    setImages([])
    setFaceFeatures(null)
    setHandFeatures(null)
    setSavedArchiveId(null)
    setSelectedArchiveId(null)
  }, [setPhase])

  return {
    // 状态
    phase,
    analysisType,
    captureMethod,
    name,
    gender,
    images,
    faceFeatures,
    handFeatures,
    selectedArchiveId,
    savedArchiveId,
    // Setters
    setPhase,
    setAnalysisType,
    setCaptureMethod,
    setName,
    setGender,
    setImages,
    setFaceFeatures,
    setHandFeatures,
    setSelectedArchiveId,
    setSavedArchiveId,
    // 操作
    resetToCapture,
    fullReset,
  }
}