/**
 * 手相特征提取工具
 *
 * 基于 MediaPipe Hand Landmarker 的 21 个手部关键点，
 * 提取传统相学所需的可量化特征：掌型、手指比例、八丘饱满度等。
 *
 * 掌纹线（生命线/智慧线/感情线/命运线）通过 palmLineDetector.ts
 * 基于 Hessian 脊线检测自动识别，或由用户手动标注。
 */

import type { Point2D } from './physiognomyFeatures'

// ── 距离计算（复用） ──
function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ── 手掌类型 ──
export type PalmType = 'square' | 'rectangular' | 'round' | 'unknown'
export type PalmElement = 'earth' | 'air' | 'water' | 'fire' | 'unknown'

export interface PalmShapeFeatures {
  /** 掌宽（食指根部到小指根部） */
  palmWidth: number
  /** 掌长（手腕到中指根部） */
  palmLength: number
  /** 掌宽/掌长比 */
  aspectRatio: number
  /** 掌型 */
  palmType: PalmType
  /** 掌型中文名 */
  palmTypeCN: string
  /** 四元素分类 */
  element: PalmElement
  /** 元素中文名 */
  elementCN: string
  /** 解读 */
  description: string
}

/**
 * 判定掌型与四元素分类
 *
 * 土型掌（方掌短指）：务实稳重
 * 风型掌（方掌长指）：理性善思
 * 水型掌（长掌长指）：感性艺术
 * 火型掌（长掌短指）：热情冲动
 */
export function extractPalmShape(landmarks: Point2D[]): PalmShapeFeatures {
  const wrist = landmarks[0]
  const indexBase = landmarks[5]
  const pinkyBase = landmarks[17]
  const middleBase = landmarks[9]

  const palmWidth = dist(indexBase, pinkyBase)
  const palmLength = dist(wrist, middleBase)
  const aspectRatio = palmLength > 0 ? palmWidth / palmLength : 0

  // 手指长度判定：中指根部到指尖
  const middleTip = landmarks[12]
  const fingerLength = dist(middleBase, middleTip)
  const fingerRatio = palmLength > 0 ? fingerLength / palmLength : 0

  let palmType: PalmType = 'unknown'
  let palmTypeCN = '未知'
  let element: PalmElement = 'unknown'
  let elementCN = '未知'
  let description = ''

  // 掌型：方掌（宽长比 > 0.85）vs 长掌（< 0.75）
  const isSquarePalm = aspectRatio > 0.8
  // 手指：长指（中指/掌长 > 0.85）vs 短指（< 0.7）
  const isLongFinger = fingerRatio > 0.8

  if (isSquarePalm && !isLongFinger) {
    palmType = 'square'
    palmTypeCN = '方掌短指'
    element = 'earth'
    elementCN = '土型掌'
    description = '土型掌：务实稳重，脚踏实地，宜经商实业，财运稳健'
  } else if (isSquarePalm && isLongFinger) {
    palmType = 'square'
    palmTypeCN = '方掌长指'
    element = 'air'
    elementCN = '风型掌'
    description = '风型掌：理性善思，逻辑清晰，宜学术研究，沟通力强'
  } else if (!isSquarePalm && isLongFinger) {
    palmType = 'rectangular'
    palmTypeCN = '长掌长指'
    element = 'water'
    elementCN = '水型掌'
    description = '水型掌：感性艺术，直觉敏锐，宜文艺创作，情感丰富'
  } else if (!isSquarePalm && !isLongFinger) {
    palmType = 'rectangular'
    palmTypeCN = '长掌短指'
    element = 'fire'
    elementCN = '火型掌'
    description = '火型掌：热情冲动，行动力强，宜开创事业，需控脾气'
  } else {
    palmType = 'round'
    palmTypeCN = '圆形掌'
    element = 'unknown'
    elementCN = '混合型'
    description = '混合型掌：兼具各型特征，性格多元'
  }

  return { palmWidth, palmLength, aspectRatio, palmType, palmTypeCN, element, elementCN, description }
}

// ── 手指比例 ──
export interface FingerRatiosFeatures {
  /** 拇指长度 */
  thumbLength: number
  /** 食指长度 */
  indexLength: number
  /** 中指长度 */
  middleLength: number
  /** 无名指长度 */
  ringLength: number
  /** 小指长度 */
  pinkyLength: number
  /** 食指/无名指比（2D:4D ratio） */
  indexRingRatio: number
  /** 中指/掌长比 */
  middlePalmRatio: number
  /** 小指长度判定（短/中/长） */
  pinkyStatus: 'short' | 'medium' | 'long'
  /** 拇指大小判定 */
  thumbStatus: 'small' | 'medium' | 'large'
  /** 解读 */
  description: string
}

/**
 * 提取手指比例特征
 *
 * 2D:4D 比（食指/无名指）反映先天激素水平：
 * - < 1.0：无名指长，睾酮水平高，竞争性强
 * - > 1.0：食指长，雌激素水平高，善于社交
 *
 * 小指短：不善言辞；小指长：口才佳。
 * 拇指大：意志力强；拇指小：优柔寡断。
 */
export function extractFingerRatios(landmarks: Point2D[]): FingerRatiosFeatures {
  // 各手指根部到指尖
  const thumbLength = dist(landmarks[1], landmarks[4])
  const indexLength = dist(landmarks[5], landmarks[8])
  const middleLength = dist(landmarks[9], landmarks[12])
  const ringLength = dist(landmarks[13], landmarks[16])
  const pinkyLength = dist(landmarks[17], landmarks[20])

  const indexRingRatio = ringLength > 0 ? indexLength / ringLength : 0
  const palmLength = dist(landmarks[0], landmarks[9])
  const middlePalmRatio = palmLength > 0 ? middleLength / palmLength : 0

  // 小指判定：与无名指第一关节比
  const ringFirstKnuckle = dist(landmarks[13], landmarks[14])
  let pinkyStatus: 'short' | 'medium' | 'long' = 'medium'
  if (pinkyLength < ringFirstKnuckle * 0.85) pinkyStatus = 'short'
  else if (pinkyLength > ringFirstKnuckle * 1.1) pinkyStatus = 'long'

  // 拇指判定：与掌长比
  const thumbPalmRatio = palmLength > 0 ? thumbLength / palmLength : 0
  let thumbStatus: 'small' | 'medium' | 'large' = 'medium'
  if (thumbPalmRatio < 0.35) thumbStatus = 'small'
  else if (thumbPalmRatio > 0.5) thumbStatus = 'large'

  let description = ''
  const parts: string[] = []
  if (indexRingRatio < 0.95) {
    parts.push('无名指较长，竞争性强，行动力佳')
  } else if (indexRingRatio > 1.05) {
    parts.push('食指较长，善于社交，领导力强')
  }
  if (pinkyStatus === 'short') parts.push('小指偏短，需注意表达沟通')
  else if (pinkyStatus === 'long') parts.push('小指修长，口才佳善交际')
  if (thumbStatus === 'large') parts.push('拇指粗大，意志坚定')
  else if (thumbStatus === 'small') parts.push('拇指偏小，性格柔和')
  description = parts.length > 0 ? parts.join('；') : '手指比例均衡，性格中正'

  return {
    thumbLength,
    indexLength,
    middleLength,
    ringLength,
    pinkyLength,
    indexRingRatio,
    middlePalmRatio,
    pinkyStatus,
    thumbStatus,
    description,
  }
}

// ── 八丘饱满度 ──
export interface PalmMountsFeatures {
  /** 木星丘（食指根部） */
  jupiter: { fullness: number; status: string }
  /** 土星丘（中指根部） */
  saturn: { fullness: number; status: string }
  /** 太阳丘（无名指根部） */
  apollo: { fullness: number; status: string }
  /** 水星丘（小指根部） */
  mercury: { fullness: number; status: string }
  /** 金星丘（拇指根部） */
  venus: { fullness: number; status: string }
  /** 月丘（掌侧） */
  moon: { fullness: number; status: string }
  /** 火星丘（掌中） */
  mars: { fullness: number; status: string }
  /** 地丘（手腕处，又称海王星丘） */
  earth: { fullness: number; status: string }
  /** 综合解读 */
  description: string
}

/**
 * 估算八丘饱满度
 *
 * 注意：2D 关键点无法直接测量 3D 高度，此处以各丘区域
 * 关键点间的距离比例作为饱满度的近似估计。
 */
export function extractPalmMounts(landmarks: Point2D[]): PalmMountsFeatures {
  const wrist = landmarks[0]
  const thumbBase = landmarks[2]
  const indexBase = landmarks[5]
  const middleBase = landmarks[9]
  const ringBase = landmarks[13]
  const pinkyBase = landmarks[17]

  // 各丘饱满度以根部到手腕的距离为近似
  const jupiterFullness = dist(indexBase, wrist)
  const saturnFullness = dist(middleBase, wrist)
  const apolloFullness = dist(ringBase, wrist)
  const mercuryFullness = dist(pinkyBase, wrist)
  const venusFullness = dist(thumbBase, wrist) * 1.2  // 金星丘区域较大

  // 月丘：小指根部到手腕的距离（掌侧）
  const moonFullness = dist(pinkyBase, wrist) * 0.8

  // 火星丘：掌中心区域
  const marsFullness = dist(landmarks[9], landmarks[5]) + dist(landmarks[9], landmarks[13])

  // 地丘（手腕处）：手腕到掌底的纵向距离，代表根基与晚运
  const palmBottom = landmarks[0]
  const palmCenter = landmarks[9]
  const earthFullness = dist(palmBottom, palmCenter) * 0.35

  const getStatus = (val: number, threshold1: number, threshold2: number): string => {
    if (val > threshold2) return '饱满'
    if (val > threshold1) return '适中'
    return '平坦'
  }

  const avgFullness = (jupiterFullness + saturnFullness + apolloFullness + mercuryFullness) / 4

  const result: PalmMountsFeatures = {
    jupiter: { fullness: jupiterFullness, status: getStatus(jupiterFullness, avgFullness * 0.85, avgFullness * 1.1) },
    saturn: { fullness: saturnFullness, status: getStatus(saturnFullness, avgFullness * 0.85, avgFullness * 1.1) },
    apollo: { fullness: apolloFullness, status: getStatus(apolloFullness, avgFullness * 0.85, avgFullness * 1.1) },
    mercury: { fullness: mercuryFullness, status: getStatus(mercuryFullness, avgFullness * 0.85, avgFullness * 1.1) },
    venus: { fullness: venusFullness, status: getStatus(venusFullness, avgFullness * 0.9, avgFullness * 1.2) },
    moon: { fullness: moonFullness, status: getStatus(moonFullness, avgFullness * 0.7, avgFullness * 0.95) },
    mars: { fullness: marsFullness, status: getStatus(marsFullness, avgFullness * 0.6, avgFullness * 0.85) },
    earth: { fullness: earthFullness, status: getStatus(earthFullness, avgFullness * 0.18, avgFullness * 0.28) },
    description: '',
  }

  const fullCount = [result.jupiter, result.saturn, result.apollo, result.mercury, result.venus, result.moon, result.mars, result.earth]
    .filter((m) => m.status === '饱满').length

  let desc = ''
  if (fullCount >= 5) {
    desc = '八丘多饱满，精力充沛，运势旺盛'
  } else if (fullCount >= 3) {
    desc = '八丘尚可，部分领域需努力'
  } else {
    desc = '八丘偏平，需后天补益精力'
  }
  result.description = desc

  return result
}

// ── 手掌纹（用户手动标注） ──
export interface PalmLineMark {
  /** 线名 */
  name: string
  /** 起点 */
  start: Point2D
  /** 终点 */
  end: Point2D
  /** 中间控制点（可选） */
  midPoints?: Point2D[]
  /** 长度 */
  length: number
  /** 清晰度（1-5，用户主观评分） */
  clarity: number
  /** 是否分叉 */
  branched: boolean
}

export interface PalmLinesFeatures {
  /** 生命线 */
  lifeLine: PalmLineMark | null
  /** 智慧线 */
  headLine: PalmLineMark | null
  /** 感情线 */
  heartLine: PalmLineMark | null
  /** 命运线（可选） */
  fateLine: PalmLineMark | null
  /** 解读 */
  description: string
}

/**
 * 构建手掌纹特征
 *
 * 掌纹线可通过两种方式获得：
 * 1. 自动检测：palmLineDetector.ts 基于 Hessian 脊线检测自动识别
 * 2. 手动标注：用户在界面上标注（起点→终点+控制点）
 * 此函数将标注/检测数据规范化为 PalmLinesFeatures。
 */
export function buildPalmLines(
  lifeLine: Omit<PalmLineMark, 'length'> | null = null,
  headLine: Omit<PalmLineMark, 'length'> | null = null,
  heartLine: Omit<PalmLineMark, 'length'> | null = null,
  fateLine: Omit<PalmLineMark, 'length'> | null = null,
): PalmLinesFeatures {
  const calcLength = (line: Omit<PalmLineMark, 'length'> | null): PalmLineMark | null => {
    if (!line) return null
    let length = dist(line.start, line.end)
    if (line.midPoints && line.midPoints.length > 0) {
      const allPoints = [line.start, ...line.midPoints, line.end]
      for (let i = 0; i < allPoints.length - 1; i++) {
        length += dist(allPoints[i], allPoints[i + 1]) - dist(allPoints[i], allPoints[i + 1]) // 减去直线的重复
      }
      // 重新计算折线总长
      length = 0
      for (let i = 0; i < allPoints.length - 1; i++) {
        length += dist(allPoints[i], allPoints[i + 1])
      }
    }
    return { ...line, length }
  }

  const life = calcLength(lifeLine)
  const head = calcLength(headLine)
  const heart = calcLength(heartLine)
  const fate = calcLength(fateLine)

  const parts: string[] = []
  if (life) {
    parts.push(life.branched ? '生命线有分叉' : '生命线清晰')
  }
  if (head) {
    parts.push(head.branched ? '智慧线有分叉' : '智慧线平直')
  }
  if (heart) {
    parts.push(heart.branched ? '感情线丰富' : '感情线清晰')
  }
  if (fate) {
    parts.push('有命运线')
  }

  return {
    lifeLine: life,
    headLine: head,
    heartLine: heart,
    fateLine: fate,
    description: parts.length > 0 ? parts.join('；') : '未检测到明显掌纹线，LLM 将根据掌型、手指比例、掌丘饱满度等可量化特征综合推断掌纹含义',
  }
}

// ── 手相综合特征 ──
export interface HandFeatures {
  palmShape: PalmShapeFeatures
  fingerRatios: FingerRatiosFeatures
  palmMounts: PalmMountsFeatures
  palmLines: PalmLinesFeatures
  /** 检测置信度 */
  confidence: number
  /** 左手/右手 */
  handedness: 'Left' | 'Right' | 'Unknown'
}

/**
 * 综合提取手相特征
 * @param landmarks MediaPipe 21 手部关键点
 * @param handedness 左右手标识
 * @param palmLines 用户手动标注的掌纹线
 */
export function extractHandFeatures(
  landmarks: Point2D[],
  handedness: 'Left' | 'Right' | 'Unknown' = 'Unknown',
  palmLines?: PalmLinesFeatures,
): HandFeatures {
  return {
    palmShape: extractPalmShape(landmarks),
    fingerRatios: extractFingerRatios(landmarks),
    palmMounts: extractPalmMounts(landmarks),
    palmLines: palmLines || buildPalmLines(null, null, null, null),
    confidence: 1.0,
    handedness,
  }
}
