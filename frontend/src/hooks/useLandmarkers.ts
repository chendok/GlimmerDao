/**
 * MediaPipe 关键点检测 Hooks
 *
 * 提供 FaceLandmarker（面部 468 点）和 HandLandmarker（手部 21 点）的懒加载与统一管理。
 * 模型文件存放在 public/mediapipe/models/，运行时从 CDN 加载 WASM 解码器，
 * 本地模型文件确保隐私（图像数据不离开浏览器）。
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { getErrorMessage } from '../utils/helpers'
import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'

// ── 模型路径配置 ──
// 本地 WASM：避免依赖外部 CDN，确保内网/离线可用
const WASM_BASE = '/mediapipe/wasm'
const FACE_MODEL = '/mediapipe/models/face_landmarker.task'
const HAND_MODEL = '/mediapipe/models/hand_landmarker.task'

// ── TensorFlow Lite 日志过滤 ──
// MediaPipe WASM 内部通过 stderr 输出 TF Lite 信息日志，
// 浏览器将其标记为 error 级别。检测期间临时静默，完成后恢复。
let _tfLiteFiltering = false
const _origConsoleError = console.error
function _enableTfLiteFilter() {
  if (_tfLiteFiltering) return
  _tfLiteFiltering = true
  console.error = (...args: unknown[]) => {
    // 仅过滤 TF Lite / XNNPACK 的无害 INFO 日志
    const first = args[0]
    if (typeof first === 'string' && (first.includes('TensorFlow Lite') || first.includes('XNNPACK'))) {
      return
    }
    _origConsoleError.apply(console, args)
  }
}
function _disableTfLiteFilter() {
  if (!_tfLiteFiltering) return
  _tfLiteFiltering = false
  console.error = _origConsoleError
}

// ── 加载状态 ──
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface LandmarkerState<T> {
  status: LoadStatus
  error: string | null
  landmarker: T | null
}

/**
 * 单例化的 FilesetResolver，避免重复加载 WASM
 */
let _filesetPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null
async function getFileset() {
  if (!_filesetPromise) {
    _filesetPromise = (async () => {
      _enableTfLiteFilter()
      try {
        return await FilesetResolver.forVisionTasks(WASM_BASE)
      } finally {
        _disableTfLiteFilter()
      }
    })()
  }
  return _filesetPromise
}

/**
 * 面部关键点检测 Hook
 *
 * 懒加载 FaceLandmarker，提供 detect 方法。
 * 模型配置：468 个面部关键点 + 表情 Blendshape + 变换矩阵。
 */
export function useFaceLandmarker() {
  const [state, setState] = useState<LandmarkerState<FaceLandmarker>>({
    status: 'idle',
    error: null,
    landmarker: null,
  })
  const landmarkerRef = useRef<FaceLandmarker | null>(null)

  const load = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const fileset = await getFileset()
      _enableTfLiteFilter()
      const lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: FACE_MODEL,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })
      _disableTfLiteFilter()
      landmarkerRef.current = lm
      setState({ status: 'ready', error: null, landmarker: lm })
      return lm
    } catch (e: unknown) {
      _disableTfLiteFilter()
      const msg = getErrorMessage(e) || '面部检测模型加载失败'
      setState({ status: 'error', error: msg, landmarker: null })
      return null
    }
  }, [])

  /**
   * 检测图像中的面部关键点
   * @param image HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
   * @returns FaceLandmarkerResult | null
   */
  const detect = useCallback(async (
    image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  ): Promise<FaceLandmarkerResult | null> => {
    const lm = landmarkerRef.current || await load()
    if (!lm) return null
    try {
      _enableTfLiteFilter()
      return lm.detect(image)
    } catch (e: unknown) {
      console.error('[FaceLandmarker] detect failed:', getErrorMessage(e) || e)
      return null
    } finally {
      _disableTfLiteFilter()
    }
  }, [load])

  // 卸载时释放资源
  useEffect(() => {
    return () => {
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  return { ...state, load, detect }
}

/**
 * 手部关键点检测 Hook
 *
 * 懒加载 HandLandmarker，提供 detect 方法。
 * 模型配置：21 个手部关键点，最多检测 2 只手。
 */
export function useHandLandmarker() {
  const [state, setState] = useState<LandmarkerState<HandLandmarker>>({
    status: 'idle',
    error: null,
    landmarker: null,
  })
  const landmarkerRef = useRef<HandLandmarker | null>(null)

  const load = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const fileset = await getFileset()
      _enableTfLiteFilter()
      const lm = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: HAND_MODEL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.3,
        minHandPresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      })
      _disableTfLiteFilter()
      landmarkerRef.current = lm
      setState({ status: 'ready', error: null, landmarker: lm })
      console.log('[HandLandmarker] model loaded successfully, delegate: CPU')
      return lm
    } catch (e: unknown) {
      _disableTfLiteFilter()
      console.error('[HandLandmarker] model load failed:', getErrorMessage(e) || e)
      const msg = getErrorMessage(e) || '手部检测模型加载失败'
      setState({ status: 'error', error: msg, landmarker: null })
      return null
    }
  }, [])

  /**
   * 检测图像中的手部关键点
   * @param image HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
   * @returns HandLandmarkerResult | null
   */
  const detect = useCallback(async (
    image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  ): Promise<HandLandmarkerResult | null> => {
    const lm = landmarkerRef.current || await load()
    if (!lm) return null
    try {
      _enableTfLiteFilter()
      return lm.detect(image)
    } catch (e: unknown) {
      console.error('[HandLandmarker] detect failed:', getErrorMessage(e) || e)
      return null
    } finally {
      _disableTfLiteFilter()
    }
  }, [load])

  // 卸载时释放资源
  useEffect(() => {
    return () => {
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  return { ...state, load, detect }
}
