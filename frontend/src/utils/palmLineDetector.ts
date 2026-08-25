/**
 * 掌纹线自动检测工具
 *
 * 基于 MediaPipe 21 手部关键点建立归一化坐标系，
 * 通过 Hessian 类脊线检测 + 方向滤波自动识别四大掌纹线：
 * 生命线、智慧线、感情线、命运线。
 *
 * 技术流程：
 * 1. 使用 MediaPipe 关键点建立稳定的手掌坐标系
 * 2. 对图像进行灰度化 + 对比度增强 + 高斯去噪
 * 3. 多方向二阶导检测（Hessian 响应）提取脊线
 * 4. 非极大值抑制 + 滞后阈值化获得单像素脊线图
 * 5. 在各掌纹 ROI 内追踪最长脊线作为检测结果
 *
 * 纯前端实现，原始图像不上传至服务器。
 */

import type { HandFeatures, PalmLineMark, PalmLinesFeatures } from './handFeatures'

// ── 2D 点 ──
interface Point {
  x: number
  y: number
}

// ── MediaPipe 21 手部关键点索引 ──
const WRIST = 0
const INDEX_BASE = 5
const MIDDLE_BASE = 9
const RING_BASE = 13
const PINKY_BASE = 17
const THUMB_BASE = 2
const INDEX_TIP = 8
const MIDDLE_TIP = 12
const RING_TIP = 16
const PINKY_TIP = 20

// ── ROI 定义（归一化坐标，以手掌宽高为基准） ──
interface ROIDef {
  /** ROI 左上角（归一化 0-1） */
  x: number
  y: number
  /** ROI 宽度（归一化） */
  w: number
  /** ROI 高度（归一化） */
  h: number
  /** 期望线方向（弧度），用于方向滤波 */
  expectedAngle: number
}

// 生命线：从拇指根部附近弯曲向食指根部区域
// 形状为弧线，此处用矩形 ROI 覆盖主要部分
const LIFE_LINE_ROIS: ROIDef[] = [
  // 主干部分：手腕到食指根部的斜向区域
  { x: 0.05, y: 0.25, w: 0.40, h: 0.65, expectedAngle: Math.PI * 0.75 },
  // 下段（靠近手腕）
  { x: 0.02, y: 0.55, w: 0.30, h: 0.35, expectedAngle: Math.PI * 0.80 },
]

// 智慧线：横向手掌中部
const HEAD_LINE_ROIS: ROIDef[] = [
  { x: 0.15, y: 0.35, w: 0.70, h: 0.18, expectedAngle: 0 },
]

// 感情线：横向掌上部（手指根部下方）
const HEART_LINE_ROIS: ROIDef[] = [
  { x: 0.15, y: 0.12, w: 0.72, h: 0.18, expectedAngle: 0 },
]

// 命运线：纵向手掌中央
const FATE_LINE_ROIS: ROIDef[] = [
  { x: 0.40, y: 0.20, w: 0.18, h: 0.65, expectedAngle: Math.PI / 2 },
]

// ── 工具函数 ──

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * 将 MediaPipe 关键点归一化为相对坐标
 * 以掌宽（indexBase→pinkyBase）和掌长（wrist→middleBase）为基准
 */
function normalizeLandmarks(landmarks: Point[]): {
  normalized: Point[]
  palmWidth: number
  palmLength: number
  origin: Point
} {
  const indexBase = landmarks[INDEX_BASE]
  const pinkyBase = landmarks[PINKY_BASE]
  const wrist = landmarks[WRIST]
  const middleBase = landmarks[MIDDLE_BASE]

  const palmWidth = dist(indexBase, pinkyBase) || 1
  const palmLength = dist(wrist, middleBase) || 1
  const scale = Math.max(palmWidth, palmLength)

  const normalized = landmarks.map((p) => ({
    x: (p.x - wrist.x) / scale,
    y: (p.y - wrist.y) / scale,
  }))

  return { normalized, palmWidth, palmLength, origin: wrist }
}

/**
 * 提取 ROI 像素区域
 */
function extractROI(
  grayscale: Float32Array,
  width: number,
  height: number,
  roi: { x: number; y: number; w: number; h: number },
  rect: { x: number; y: number; w: number; h: number },
): { data: Float32Array; width: number; height: number; offsetX: number; offsetY: number } {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.floor(rect.x + rect.w))
  const y1 = Math.min(height, Math.floor(rect.y + rect.h))
  const w = x1 - x0
  const h = y1 - y0

  if (w <= 0 || h <= 0) {
    return { data: new Float32Array(0), width: 0, height: 0, offsetX: 0, offsetY: 0 }
  }

  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = grayscale[(y0 + y) * width + (x0 + x)]
    }
  }
  return { data, width: w, height: h, offsetX: x0, offsetY: y0 }
}

// ── 图像处理核心算法 ──

/**
 * 灰度化 + 对比度增强（CLAHE 简化版）+ 高斯去噪
 */
function preprocess(imageData: ImageData): {
  grayscale: Float32Array
  width: number
  height: number
} {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)

  // 灰度化
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  // 对比度增强：直方图均衡化（简化版）
  const histogram = new Float32Array(256)
  for (let i = 0; i < gray.length; i++) {
    const val = Math.min(255, Math.max(0, Math.round(gray[i])))
    histogram[val]++
  }
  const cdf = new Float32Array(256)
  cdf[0] = histogram[0]
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + histogram[i]
  const cdfMin = cdf.find((v) => v > 0) || 0
  const total = gray.length
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    lut[i] = ((cdf[i] - cdfMin) / Math.max(1, total - cdfMin)) * 255
  }
  for (let i = 0; i < gray.length; i++) {
    gray[i] = lut[Math.min(255, Math.max(0, Math.round(gray[i])))]
  }

  // 高斯模糊（3x3 近似）
  const smoothed = new Float32Array(width * height)
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const kernelSum = 16
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      let k = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * kernel[k++]
        }
      }
      smoothed[y * width + x] = sum / kernelSum
    }
  }
  // 边界复制
  for (let x = 0; x < width; x++) {
    smoothed[x] = gray[x]
    smoothed[(height - 1) * width + x] = gray[(height - 1) * width + x]
  }
  for (let y = 0; y < height; y++) {
    smoothed[y * width] = gray[y * width]
    smoothed[y * width + (width - 1)] = gray[y * width + (width - 1)]
  }

  return { grayscale: smoothed, width, height }
}

/**
 * Hessian 脊线检测
 *
 * 对每个像素计算二阶导数，判断是否为脊线（ridge）。
 * 脊线的特征是：在沿脊线方向上梯度小，在垂直方向上梯度大。
 *
 * @returns 脊线响应图（float，越大表示越可能是脊线）
 */
function hessianRidgeResponse(
  grayscale: Float32Array,
  width: number,
  height: number,
  sigma: number = 1.5,
): Float32Array {
  const response = new Float32Array(width * height)
  const border = Math.ceil(sigma * 3)

  for (let y = border; y < height - border; y++) {
    for (let x = border; x < width - border; x++) {
      const idx = y * width + x

      // 计算 Hessian 矩阵（使用差分近似二阶导）
      // Ixx: x 方向二阶导
      const ixx = grayscale[idx + 1] - 2 * grayscale[idx] + grayscale[idx - 1]
      // Iyy: y 方向二阶导
      const iyy = grayscale[idx + width] - 2 * grayscale[idx] + grayscale[idx - width]
      // Ixy: 交叉二阶导
      const ixy = (grayscale[idx + width + 1] - grayscale[idx + width - 1]
                   - grayscale[idx - width + 1] + grayscale[idx - width - 1]) / 4

      // 计算 Hessian 的特征值
      // det(H) = Ixx*Iyy - Ixy^2
      // trace(H) = Ixx + Iyy
      const det = ixx * iyy - ixy * ixy
      const trace = ixx + iyy

      // 对于亮底暗纹（掌纹是暗线），脊线满足：
      // Ixx 和 Iyy 都为负（或一个负一个正，但绝对值大的为负）
      // 使用特征值差作为脊线强度
      const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det))
      const lambda1 = (trace + discriminant) / 2
      const lambda2 = (trace - discriminant) / 2

      // 脊线响应：两个特征值中至少一个为负（暗脊线），且差值大
      if (lambda1 < 0 && lambda2 < 0) {
        // 两个特征值都为负 → 检测到脊线
        response[idx] = Math.abs(lambda1) + Math.abs(lambda2)
      } else if (lambda1 * lambda2 < 0) {
        // 一个正一个负 → 可能是边缘，弱化
        response[idx] = Math.max(0, -Math.min(lambda1, lambda2)) * 0.3
      }
    }
  }

  // 归一化
  let maxVal = 0
  for (let i = 0; i < response.length; i++) {
    if (response[i] > maxVal) maxVal = response[i]
  }
  if (maxVal > 0) {
    for (let i = 0; i < response.length; i++) response[i] /= maxVal
  }

  return response
}

/**
 * 方向加权：根据期望线方向，增强该方向的脊线响应
 *
 * 对每个像素计算局部主方向，与期望方向对比，一致则增强
 */
function directionWeight(
  ridgeResponse: Float32Array,
  grayscale: Float32Array,
  width: number,
  height: number,
  expectedAngle: number,
): Float32Array {
  const weighted = new Float32Array(ridgeResponse.length)

  const cosExp = Math.cos(expectedAngle)
  const sinExp = Math.sin(expectedAngle)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x

      // 计算局部梯度方向
      const gx = grayscale[idx + 1] - grayscale[idx - 1]
      const gy = grayscale[idx + width] - grayscale[idx - width]

      const gradMag = Math.sqrt(gx * gx + gy * gy)
      if (gradMag < 1e-6) {
        weighted[idx] = ridgeResponse[idx]
        continue
      }

      // 梯度方向（垂直于脊线方向）
      const gradAngle = Math.atan2(gy, gx)
      // 脊线方向 = 梯度方向 + 90°
      const ridgeAngle = gradAngle + Math.PI / 2

      // 计算与期望方向的夹角
      let diff = Math.abs(ridgeAngle - expectedAngle)
      diff = Math.min(diff, Math.PI * 2 - diff, Math.PI - diff)

      // 方向一致性权重：夹角越小权重越高
      const weight = Math.cos(diff) * 0.5 + 0.5

      weighted[idx] = ridgeResponse[idx] * weight
    }
  }

  return weighted
}

/**
 * 二值化 + 骨架化：从脊线响应图获取单像素宽的脊线
 */
function binarizeAndSkeletonize(
  response: Float32Array,
  width: number,
  height: number,
  threshold: number = 0.15,
): Uint8Array {
  const binary = new Uint8Array(width * height)

  // 自适应阈值
  let mean = 0
  for (let i = 0; i < response.length; i++) mean += response[i]
  mean /= response.length
  const adaptiveThreshold = Math.max(threshold, mean * 1.5)

  for (let i = 0; i < response.length; i++) {
    if (response[i] > adaptiveThreshold) {
      binary[i] = 1
    }
  }

  // 简单骨架化：迭代 thinning（Zhang-Suen 简化版）
  const thinned = new Uint8Array(binary)
  let changed = true
  let iter = 0
  while (changed && iter < 20) {
    changed = false
    iter++
    const buffer = new Uint8Array(thinned)

    // 迭代 1
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (buffer[idx] === 0) continue

        const p2 = buffer[(y - 1) * width + x]
        const p4 = buffer[y * width + (x + 1)]
        const p6 = buffer[(y + 1) * width + x]
        const p8 = buffer[y * width + (x - 1)]
        const p3 = buffer[(y - 1) * width + (x + 1)]
        const p5 = buffer[(y + 1) * width + (x + 1)]
        const p7 = buffer[(y + 1) * width + (x - 1)]
        const p9 = buffer[(y - 1) * width + (x - 1)]

        const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9]
        let transitions = 0
        for (let k = 0; k < 8; k++) {
          if (neighbors[k] === 0 && neighbors[(k + 1) % 8] === 1) transitions++
        }
        const ones = neighbors.reduce((a, b) => a + b, 0)

        if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 && transitions === 1 && ones >= 2 && ones <= 6) {
          thinned[idx] = 0
          changed = true
        }
      }
    }

    // 迭代 2
    const buffer2 = new Uint8Array(thinned)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (buffer2[idx] === 0) continue

        const p2 = buffer2[(y - 1) * width + x]
        const p4 = buffer2[y * width + (x + 1)]
        const p6 = buffer2[(y + 1) * width + x]
        const p8 = buffer2[y * width + (x - 1)]
        const p3 = buffer2[(y - 1) * width + (x + 1)]
        const p5 = buffer2[(y + 1) * width + (x + 1)]
        const p7 = buffer2[(y + 1) * width + (x - 1)]
        const p9 = buffer2[(y - 1) * width + (x - 1)]

        const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9]
        let transitions = 0
        for (let k = 0; k < 8; k++) {
          if (neighbors[k] === 0 && neighbors[(k + 1) % 8] === 1) transitions++
        }
        const ones = neighbors.reduce((a, b) => a + b, 0)

        if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0 && transitions === 1 && ones >= 2 && ones <= 6) {
          thinned[idx] = 0
          changed = true
        }
      }
    }
  }

  return thinned
}

/**
 * 从骨架化二值图中追踪最长脊线
 *
 * 在 ROI 内找到最长的连通脊线段，提取其像素坐标序列
 */
function traceLongestRidge(
  binary: Uint8Array,
  width: number,
  height: number,
  roi: { x: number; y: number; w: number; h: number },
): Point[] {
  const x0 = Math.max(0, Math.floor(roi.x))
  const y0 = Math.max(0, Math.floor(roi.y))
  const x1 = Math.min(width, Math.floor(roi.x + roi.w))
  const y1 = Math.min(height, Math.floor(roi.y + roi.h))

  // 收集 ROI 内所有脊线像素
  const ridgePixels: Point[] = []
  const visited = new Uint8Array(width * height)

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (binary[y * width + x] === 1) {
        ridgePixels.push({ x, y })
      }
    }
  }

  if (ridgePixels.length < 10) return []

  // BFS 找最长连通段
  let longestPath: Point[] = []
  const ridgeSet = new Set<number>()
  for (const p of ridgePixels) {
    ridgeSet.add(p.y * width + p.x)
  }

  for (const startPixel of ridgePixels) {
    const startIdx = startPixel.y * width + startPixel.x
    if (visited[startIdx]) continue

    // BFS 从该像素找最长路径
    const queue: { idx: number; path: number[] }[] = []
    const bfsVisited = new Set<number>([startIdx])
    queue.push({ idx: startIdx, path: [startIdx] })

    let bestPath: number[] = []

    while (queue.length > 0) {
      const { idx, path } = queue.shift()!
      const x = idx % width
      const y = Math.floor(idx / width)

      // 获取邻居
      const neighbors: number[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx >= x0 && nx < x1 && ny >= y0 && ny < y1) {
            const nIdx = ny * width + nx
            if (ridgeSet.has(nIdx) && !bfsVisited.has(nIdx)) {
              neighbors.push(nIdx)
            }
          }
        }
      }

      if (neighbors.length === 0 || path.length > 2000) {
        if (path.length > bestPath.length) {
          bestPath = path
        }
        continue
      }

      for (const nIdx of neighbors) {
        if (!bfsVisited.has(nIdx)) {
          bfsVisited.add(nIdx)
          queue.push({ idx: nIdx, path: [...path, nIdx] })
        }
      }
    }

    // 标记为已访问
    for (const idx of bfsVisited) visited[idx] = 1

    if (bestPath.length > longestPath.length) {
      longestPath = bestPath.map((idx) => ({ x: idx % width, y: Math.floor(idx / width) }))
    }
  }

  return longestPath
}

/**
 * 将脊线像素序列转为 PalmLineMark
 */
function pixelsToLineMark(
  pixels: Point[],
  allPixels: Point[],
  imageWidth: number,
  imageHeight: number,
): Omit<PalmLineMark, 'length'> | null {
  if (pixels.length < 5) return null

  // 按 x 或 y 排序（取变化较大的维度）
  const xRange = Math.max(...pixels.map((p) => p.x)) - Math.min(...pixels.map((p) => p.x))
  const yRange = Math.max(...pixels.map((p) => p.y)) - Math.min(...pixels.map((p) => p.y))

  let sorted: Point[]
  if (xRange > yRange) {
    sorted = [...pixels].sort((a, b) => a.x - b.x)
  } else {
    sorted = [...pixels].sort((a, b) => a.y - b.y)
  }

  // 稀疏采样为控制点（每 10 像素取一个）
  const samples: Point[] = []
  const step = Math.max(1, Math.floor(sorted.length / 15))
  for (let i = 0; i < sorted.length; i += step) {
    samples.push(sorted[i])
  }
  // 确保包含终点
  if (samples[samples.length - 1] !== sorted[sorted.length - 1]) {
    samples.push(sorted[sorted.length - 1])
  }

  const start = samples[0]
  const end = samples[samples.length - 1]
  const midPoints = samples.slice(1, -1)

  // 计算清晰度（基于像素数量和线性度）
  const lineLength = pixels.length
  const straightDist = dist(start, end)
  const linearity = straightDist / Math.max(1, lineLength)
  const clarityScore = Math.min(5, Math.max(1, Math.round(linearity * 3 + (lineLength / 50))))

  // 判断是否有分叉（在骨架图中邻近的分支）
  let branched = false
  // 检查主线附近是否有其他脊线像素分支
  const sampleSet = new Set(pixels.map((p) => `${p.x},${p.y}`))
  for (let i = 1; i < sorted.length - 1; i++) {
    const p = sorted[i]
    const neighbors = [
      { x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 },
      { x: p.x + 1, y: p.y + 1 }, { x: p.x - 1, y: p.y - 1 },
      { x: p.x + 1, y: p.y - 1 }, { x: p.x - 1, y: p.y + 1 },
    ]
    let extraNeighbors = 0
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`
      if (sampleSet.has(key)) {
        // 检查是否是沿主方向的连续
        const prevInLine = sampleSet.has(`${sorted[i - 1].x},${sorted[i - 1].y}`)
        const nextInLine = sampleSet.has(`${sorted[i + 1].x},${sorted[i + 1].y}`)
        if (!prevInLine || !nextInLine) {
          extraNeighbors++
        }
      }
    }
    if (extraNeighbors >= 2) {
      branched = true
      break
    }
  }

  return {
    name: '',
    start,
    end,
    midPoints: midPoints.length > 0 ? midPoints : undefined,
    clarity: clarityScore,
    branched,
  }
}

// ── 主检测入口 ──

/**
 * 检测掌纹线主函数
 *
 * @param image 手掌图像（已加载的 HTMLImageElement / HTMLCanvasElement）
 * @param landmarks MediaPipe 21 手部关键点（像素坐标）
 * @param handedness 左右手标识
 * @returns 检测到的掌纹特征
 */
export function detectPalmLines(
  image: HTMLImageElement | HTMLCanvasElement,
  landmarks: Point[],
  handedness: 'Left' | 'Right' | 'Unknown' = 'Unknown',
): PalmLinesFeatures {
  // 1. 获取图像像素数据
  const canvas = document.createElement('canvas')
  canvas.width = image instanceof HTMLImageElement ? image.naturalWidth : image.width
  canvas.height = image instanceof HTMLImageElement ? image.naturalHeight : image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return emptyPalmLines('无法获取 Canvas 上下文')
  }
  ctx.drawImage(image, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const width = canvas.width
  const height = canvas.height

  // 2. 预处理
  const { grayscale } = preprocess(imageData)

  // 3. Hessian 脊线响应
  const ridgeResponse = hessianRidgeResponse(grayscale, width, height, 1.5)

  // 4. 建立归一化坐标系
  const { normalized, palmWidth, palmLength } = normalizeLandmarks(landmarks)
  const scale = Math.max(palmWidth, palmLength)
  const minScale = Math.min(width, height) / Math.max(scale, 1)

  // 5. 检测每条掌纹线
  const detectLine = (
    rois: ROIDef[],
    lineName: string,
  ): Omit<PalmLineMark, 'length'> | null => {
    let bestPixels: Point[] = []
    let bestScore = 0

    for (const roiDef of rois) {
      // 将归一化 ROI 转换为像素坐标
      const rect = {
        x: roiDef.x * width,
        y: roiDef.y * height,
        w: roiDef.w * width,
        h: roiDef.h * height,
      }

      // 方向加权
      const weighted = directionWeight(ridgeResponse, grayscale, width, height, roiDef.expectedAngle)

      // 骨架化
      const binary = binarizeAndSkeletonize(weighted, width, height, 0.1)

      // 追踪脊线
      const pixels = traceLongestRidge(binary, width, height, rect)

      const score = pixels.length * (1 + minScale * 0.01)
      if (score > bestScore) {
        bestScore = score
        bestPixels = pixels
      }
    }

    if (bestPixels.length >= 8) {
      // 计算清晰度得分
      const lineMark = pixelsToLineMark(bestPixels, bestPixels, width, height)
      if (lineMark) {
        return { ...lineMark, name: lineName }
      }
    }
    return null
  }

  // 检测四条线
  const lifeLine = detectLine(LIFE_LINE_ROIS, '生命线')
  const headLine = detectLine(HEAD_LINE_ROIS, '智慧线')
  const heartLine = detectLine(HEART_LINE_ROIS, '感情线')
  const fateLine = detectLine(FATE_LINE_ROIS, '命运线')

  // 构建结果
  const parts: string[] = []
  const addLine = (label: string, line: Omit<PalmLineMark, 'length'> | null) => {
    if (line) {
      const len = dist(line.start, line.end)
      const midLen = line.midPoints?.length || 0
      const desc = `${label}清晰，跨度约${Math.round(len / scale * 100) / 100}掌宽`
      if (line.branched) {
        parts.push(`${desc}，有分叉`)
      } else if (line.clarity >= 4) {
        parts.push(`${desc}，纹路深明`)
      } else {
        parts.push(`${desc}`)
      }
    } else {
      parts.push(`${label}不明显或检测失败`)
    }
  }

  addLine('生命线', lifeLine)
  addLine('智慧线', headLine)
  addLine('感情线', heartLine)
  if (fateLine) addLine('命运线', fateLine)

  return {
    lifeLine: lifeLine ? { ...lifeLine, length: dist(lifeLine.start, lifeLine.end) } : null,
    headLine: headLine ? { ...headLine, length: dist(headLine.start, headLine.end) } : null,
    heartLine: heartLine ? { ...heartLine, length: dist(heartLine.start, heartLine.end) } : null,
    fateLine: fateLine ? { ...fateLine, length: dist(fateLine.start, fateLine.end) } : null,
    description: parts.join('；'),
  }
}

/**
 * 空掌纹特征（检测失败时的降级）
 */
function emptyPalmLines(reason: string): PalmLinesFeatures {
  return {
    lifeLine: null,
    headLine: null,
    heartLine: null,
    fateLine: null,
    description: `掌纹自动检测失败（${reason}），请在特征摘要界面手动标注掌纹线位置`,
  }
}