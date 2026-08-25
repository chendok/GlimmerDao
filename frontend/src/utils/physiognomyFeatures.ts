/**
 * 面相特征提取工具
 *
 * 基于 MediaPipe Face Landmarker 的 468 个面部关键点，
 * 提取传统相学所需的可量化特征：三停比例、五官形态、十二宫状态、
 * 对称性、脸型判定、面部宽高比等。
 *
 * MediaPipe 468 点索引参考：
 * https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
 *
 * 关键索引约定（仅列出本模块使用的）：
 * - 10: 发际线（上停起点）
 * - 151: 鼻根（上停/中停分界）
 * - 152: 鼻尖（中停/下停分界）
 * - 175: 下巴底部
 * - 33: 右眼外角 / 263: 左眼外角
 * - 133: 右眼内角 / 362: 左眼内角
 * - 70: 右眉上沿 / 300: 左眉上沿
 * - 1: 鼻尖中心
 * - 61: 嘴右角 / 291: 嘴左角
 * - 0: 上唇中点 / 17: 下唇中点
 * - 234: 右脸颊 / 454: 左脸颊
 * - 172: 右耳上 / 397: 左耳上
 */

// ── 2D 点类型 ──
export interface Point2D {
  x: number
  y: number
  z?: number
}

// ── 距离计算 ──
function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ── 三停比例 ──
export interface SanTingFeatures {
  /** 上停：发际线到眉骨（10→151） */
  upper: number
  /** 中停：眉骨到鼻尖（151→152） */
  middle: number
  /** 下停：鼻尖到下巴（152→175） */
  lower: number
  /** 上停占比 */
  upperRatio: number
  /** 中停占比 */
  middleRatio: number
  /** 下停占比 */
  lowerRatio: number
  /** 三停是否均等（各占约 1/3） */
  balanced: boolean
  /** 最长的一停 */
  longest: 'upper' | 'middle' | 'lower'
  /** 判定说明 */
  description: string
}

/**
 * 提取三停比例
 *
 * 三停均等为大吉之相，代表一生运势平稳。
 * 上停长主早年得志，中停长主中年发达，下停长主晚年享福。
 */
export function extractSanTing(landmarks: Point2D[]): SanTingFeatures {
  const hairline = landmarks[10]    // 发际线
  const browTop = landmarks[151]    // 鼻根（上停/中停分界）
  const noseTip = landmarks[152]    // 鼻尖（中停/下停分界）
  const chin = landmarks[175]       // 下巴底部

  const upper = dist(hairline, browTop)
  const middle = dist(browTop, noseTip)
  const lower = dist(noseTip, chin)
  const total = upper + middle + lower

  const upperRatio = total > 0 ? upper / total : 0
  const middleRatio = total > 0 ? middle / total : 0
  const lowerRatio = total > 0 ? lower / total : 0

  // 三停均等判定：每停占比在 0.30~0.37 之间视为均等
  const balanced = [upperRatio, middleRatio, lowerRatio].every(
    (r) => r >= 0.30 && r <= 0.37,
  )

  let longest: 'upper' | 'middle' | 'lower' = 'upper'
  if (middle >= upper && middle >= lower) longest = 'middle'
  else if (lower >= upper && lower >= middle) longest = 'lower'

  let description = ''
  if (balanced) {
    description = '三停均等，一生运势平稳，福禄双全'
  } else {
    const longestMap: Record<string, string> = {
      upper: '上停较长，早年运势佳，智慧过人',
      middle: '中停较长，中年发达，事业有成',
      lower: '下停较长，晚年享福，子女缘厚',
    }
    description = longestMap[longest]
  }

  return {
    upper,
    middle,
    lower,
    upperRatio,
    middleRatio,
    lowerRatio,
    balanced,
    longest,
    description,
  }
}

// ── 五官特征 ──
export interface WuGuanFeatures {
  /** 眉眼间距（眉下沿到眼上沿） */
  browEyeDistance: number
  /** 眉毛长度（左） */
  leftBrowLength: number
  /** 眉毛长度（右） */
  rightBrowLength: number
  /** 眉毛对称性（0-1，越接近 1 越对称） */
  browSymmetry: number
  /** 眼睛长度（左） */
  leftEyeLength: number
  /** 眼睛长度（右） */
  rightEyeLength: number
  /** 眼睛对称性（0-1） */
  eyeSymmetry: number
  /** 眼睛大小（相对面部宽度） */
  eyeSizeRatio: number
  /** 鼻子长度 */
  noseLength: number
  /** 鼻子宽度 */
  noseWidth: number
  /** 鼻翼宽与脸宽比 */
  noseFaceRatio: number
  /** 嘴巴宽度 */
  mouthWidth: number
  /** 嘴与脸宽比 */
  mouthFaceRatio: number
  /** 唇厚（上唇+下唇） */
  lipThickness: number
  /** 耳朵长度（左） */
  leftEarLength: number
  /** 耳朵长度（右） */
  rightEarLength: number
  /** 耳朵对称性 */
  earSymmetry: number
  /** 五官综合判定 */
  description: string
}

/**
 * 提取五官特征
 *
 * 眉为保寿官、眼为监察官、鼻为审辨官、口为出纳官、耳为采听官。
 * 五官端正、相称者运势较佳。
 */
export function extractWuGuan(landmarks: Point2D[]): WuGuanFeatures {
  // 眉毛：左 105→107→46，右 334→336→276（简化为端点距离）
  const leftBrowStart = landmarks[105]
  const leftBrowEnd = landmarks[46]
  const rightBrowStart = landmarks[336]
  const rightBrowEnd = landmarks[276]

  // 眼睛：左 33→133，右 362→263
  const leftEyeOuter = landmarks[33]
  const leftEyeInner = landmarks[133]
  const rightEyeOuter = landmarks[263]
  const rightEyeInner = landmarks[362]

  // 眉下沿/眼上沿
  const leftBrowBottom = landmarks[159] || landmarks[46]
  const leftEyeTop = landmarks[159] || landmarks[33]

  // 鼻子：1（鼻尖）→168（鼻根）， nostrils: 102(左鼻翼) → 331(右鼻翼)
  const noseTip = landmarks[1]
  const noseRoot = landmarks[168]
  const leftNostril = landmarks[102]
  const rightNostril = landmarks[331]

  // 嘴巴：61（右角）→291（左角），0（上唇中）→17（下唇中）
  const mouthRight = landmarks[61]
  const mouthLeft = landmarks[291]
  const upperLip = landmarks[0]
  const lowerLip = landmarks[17]

  // 耳朵：左 172→234，右 397→454
  const leftEarTop = landmarks[172]
  const leftEarBottom = landmarks[234] || landmarks[147]
  const rightEarTop = landmarks[397]
  const rightEarBottom = landmarks[454] || landmarks[376]

  // 脸宽
  const rightCheek = landmarks[234]
  const leftCheek = landmarks[454]
  const faceWidth = dist(rightCheek, leftCheek)

  // 计算
  const browEyeDistance = dist(leftBrowBottom, leftEyeTop)
  const leftBrowLength = dist(leftBrowStart, leftBrowEnd)
  const rightBrowLength = dist(rightBrowStart, rightBrowEnd)
  const browSymmetry = 1 - Math.abs(leftBrowLength - rightBrowLength) / Math.max(leftBrowLength, rightBrowLength, 0.001)

  const leftEyeLength = dist(leftEyeOuter, leftEyeInner)
  const rightEyeLength = dist(rightEyeOuter, rightEyeInner)
  const eyeSymmetry = 1 - Math.abs(leftEyeLength - rightEyeLength) / Math.max(leftEyeLength, rightEyeLength, 0.001)
  const avgEyeLength = (leftEyeLength + rightEyeLength) / 2
  const eyeSizeRatio = faceWidth > 0 ? avgEyeLength / faceWidth : 0

  const noseLength = dist(noseRoot, noseTip)
  const noseWidth = dist(leftNostril, rightNostril)
  const noseFaceRatio = faceWidth > 0 ? noseWidth / faceWidth : 0

  const mouthWidth = dist(mouthRight, mouthLeft)
  const mouthFaceRatio = faceWidth > 0 ? mouthWidth / faceWidth : 0
  const lipThickness = dist(upperLip, lowerLip)

  const leftEarLength = dist(leftEarTop, leftEarBottom)
  const rightEarLength = dist(rightEarTop, rightEarBottom)
  const earSymmetry = 1 - Math.abs(leftEarLength - rightEarLength) / Math.max(leftEarLength, rightEarLength, 0.001)

  // 综合判定
  const symmetries = [browSymmetry, eyeSymmetry, earSymmetry]
  const avgSymmetry = symmetries.reduce((a, b) => a + b, 0) / symmetries.length

  let description = ''
  if (avgSymmetry > 0.9) {
    description = '五官端正对称，面相上佳，运势通达'
  } else if (avgSymmetry > 0.75) {
    description = '五官基本端正，略有不对称，运势平稳'
  } else {
    description = '五官存在明显不对称，需注意相应运势波动'
  }

  return {
    browEyeDistance,
    leftBrowLength,
    rightBrowLength,
    browSymmetry,
    leftEyeLength,
    rightEyeLength,
    eyeSymmetry,
    eyeSizeRatio,
    noseLength,
    noseWidth,
    noseFaceRatio,
    mouthWidth,
    mouthFaceRatio,
    lipThickness,
    leftEarLength,
    rightEarLength,
    earSymmetry,
    description,
  }
}

// ── 十二宫状态 ──
export interface ShiErGongFeatures {
  /** 命宫（印堂）：两眉之间，宽阔为吉 */
  mingGong: { width: number; status: string }
  /** 财帛宫（鼻子）：鼻头丰隆为吉 */
  caiBo: { width: number; status: string }
  /** 官禄宫（额头正中）：宽广为吉 */
  guanLu: { height: number; status: string }
  /** 夫妻宫（眼尾）：丰满为吉 */
  fuQi: { fullness: number; status: string }
  /** 子女宫（眼下）：平满为吉 */
  ziNv: { height: number; status: string }
  /** 疾厄宫（山根）：高耸为吉 */
  jiE: { height: number; status: string }
  /** 迁移宫（眉角→发际）：开阔为吉，主外出运 */
  qianYi: { fullness: number; status: string }
  /** 交友宫（奴仆宫，脸颊两侧）：饱满为吉，主人缘 */
  jiaoYou: { fullness: number; status: string }
  /** 田宅宫（上眼睑）：宽阔为吉，主家业 */
  tianZhai: { height: number; status: string }
  /** 福德宫（眉骨上方）：丰隆为吉，主福气 */
  fuDe: { fullness: number; status: string }
  /** 父母宫（日月角，额头偏上方）：隆起为吉，主父母缘 */
  fuMu: { fullness: number; status: string }
  /** 兄弟宫（眉尾至眉中）：舒展为吉，主兄弟缘 */
  xiongDi: { width: number; status: string }
  /** 综合判定 */
  description: string
}

/**
 * 提取十二宫状态
 *
 * 重点分析命宫（印堂）、财帛宫（鼻子）、官禄宫（额头）、
 * 夫妻宫（眼尾）、子女宫（眼下）、疾厄宫（山根）六宫。
 */
export function extractShiErGong(landmarks: Point2D[]): ShiErGongFeatures {
  // 命宫（印堂）：两眉内角之间
  const leftBrowInner = landmarks[107] || landmarks[46]
  const rightBrowInner = landmarks[336] || landmarks[276]
  const mingGongWidth = dist(leftBrowInner, rightBrowInner)
  const mingGongStatus = mingGongWidth > 0.04 ? '宽阔' : mingGongWidth > 0.02 ? '适中' : '狭窄'

  // 财帛宫（鼻子）
  const noseTip = landmarks[1]
  const noseRoot = landmarks[168]
  const leftNostril = landmarks[102]
  const rightNostril = landmarks[331]
  const noseWidth = dist(leftNostril, rightNostril)
  const caiBoStatus = noseWidth > 0.08 ? '丰隆' : noseWidth > 0.05 ? '适中' : '偏小'

  // 官禄宫（额头正中）
  const hairline = landmarks[10]
  const browTop = landmarks[151]
  const guanLuHeight = dist(hairline, browTop)
  const guanLuStatus = guanLuHeight > 0.15 ? '宽广' : guanLuHeight > 0.1 ? '适中' : '偏窄'

  // 夫妻宫（眼尾后方）：以眼尾到太阳穴区域评估
  const leftEyeOuter = landmarks[33]
  const leftTemple = landmarks[234]
  const fuQiFullness = dist(leftEyeOuter, leftTemple)
  const fuQiStatus = fuQiFullness > 0.08 ? '丰满' : fuQiFullness > 0.05 ? '适中' : '凹陷'

  // 子女宫（眼下）：眼下方到眼袋区域
  const leftEyeBottom = landmarks[145] || landmarks[159]
  const leftCheekTop = landmarks[50] || landmarks[205]
  const ziNvHeight = dist(leftEyeBottom, leftCheekTop)
  const ziNvStatus = ziNvHeight > 0.04 ? '平满' : ziNvHeight > 0.02 ? '适中' : '低陷'

  // 疾厄宫（山根）：鼻根处
  const jiEHeight = dist(noseRoot, landmarks[151])
  const jiEStatus = jiEHeight > 0.04 ? '高耸' : jiEHeight > 0.02 ? '适中' : '低陷'

  // 迁移宫（眉角→发际）：眉尾到发际的距离，主外出运
  const leftBrowOuter = landmarks[105] || landmarks[70]
  const leftHairSide = landmarks[139] || landmarks[54]
  const qianYiFullness = dist(leftBrowOuter, leftHairSide)
  const qianYiStatus = qianYiFullness > 0.06 ? '开阔' : qianYiFullness > 0.035 ? '适中' : '窄小'

  // 交友宫（奴仆宫，脸颊两侧）：脸颊到下颌外侧距离
  const leftCheek = landmarks[50] || landmarks[205]
  const leftJawOuter = landmarks[172] || landmarks[58]
  const jiaoYouFullness = dist(leftCheek, leftJawOuter)
  const jiaoYouStatus = jiaoYouFullness > 0.09 ? '饱满' : jiaoYouFullness > 0.06 ? '适中' : '瘦削'

  // 田宅宫（上眼睑）：眉毛到眼睛上缘距离，主家业
  const leftBrowMidBottom = landmarks[105] || landmarks[70]
  const leftEyeTop = landmarks[159] || landmarks[160]
  const tianZhaiHeight = dist(leftBrowMidBottom, leftEyeTop)
  const tianZhaiStatus = tianZhaiHeight > 0.02 ? '宽阔' : tianZhaiHeight > 0.01 ? '适中' : '狭窄'

  // 福德宫（眉骨上方）：眉上方区域饱满度
  const leftBrowTop = landmarks[105] || landmarks[70]
  const leftForeheadMid = landmarks[138] || landmarks[54]
  const fuDeFullness = dist(leftBrowTop, leftForeheadMid)
  const fuDeStatus = fuDeFullness > 0.08 ? '丰隆' : fuDeFullness > 0.05 ? '适中' : '凹陷'

  // 父母宫（日月角，额头偏上方）：发际到眉上方左/右额角
  const leftSunAngle = landmarks[137] || landmarks[54]
  const rightSunAngle = landmarks[366] || landmarks[284]
  const fuMuFullness = (dist(hairline, leftSunAngle) + dist(hairline, rightSunAngle)) / 2
  const fuMuStatus = fuMuFullness > 0.1 ? '隆起' : fuMuFullness > 0.06 ? '平满' : '低平'

  // 兄弟宫（眉尾至眉中）：眉毛舒展长度
  const leftBrowLength = dist(leftBrowInner, leftBrowOuter)
  const xiongDiWidth = leftBrowLength
  const xiongDiStatus = xiongDiWidth > 0.08 ? '舒展' : xiongDiWidth > 0.05 ? '适中' : '短促'

  let description = ''
  const statuses = [
    mingGongStatus, caiBoStatus, guanLuStatus, fuQiStatus, ziNvStatus, jiEStatus,
    qianYiStatus, jiaoYouStatus, tianZhaiStatus, fuDeStatus, fuMuStatus, xiongDiStatus,
  ]
  const goodSignals = ['宽阔', '丰隆', '宽广', '丰满', '平满', '高耸', '开阔', '饱满', '舒展', '隆起']
  const goodCount = statuses.filter((s) => goodSignals.includes(s)).length
  if (goodCount >= 8) {
    description = '十二宫多数饱满，面相格局上佳'
  } else if (goodCount >= 5) {
    description = '十二宫尚可，部分宫位需注意'
  } else {
    description = '十二宫多欠佳，需后天调理补益'
  }

  return {
    mingGong: { width: mingGongWidth, status: mingGongStatus },
    caiBo: { width: noseWidth, status: caiBoStatus },
    guanLu: { height: guanLuHeight, status: guanLuStatus },
    fuQi: { fullness: fuQiFullness, status: fuQiStatus },
    ziNv: { height: ziNvHeight, status: ziNvStatus },
    jiE: { height: jiEHeight, status: jiEStatus },
    qianYi: { fullness: qianYiFullness, status: qianYiStatus },
    jiaoYou: { fullness: jiaoYouFullness, status: jiaoYouStatus },
    tianZhai: { height: tianZhaiHeight, status: tianZhaiStatus },
    fuDe: { fullness: fuDeFullness, status: fuDeStatus },
    fuMu: { fullness: fuMuFullness, status: fuMuStatus },
    xiongDi: { width: xiongDiWidth, status: xiongDiStatus },
    description,
  }
}

// ── 脸型判定 ──
export type FaceShape = 'oval' | 'round' | 'square' | 'long' | 'triangular' | 'unknown'

export interface FaceShapeFeatures {
  /** 脸宽 */
  faceWidth: number
  /** 脸长 */
  faceLength: number
  /** 脸部宽高比 */
  aspectRatio: number
  /** 脸型 */
  shape: FaceShape
  /** 脸型中文名 */
  shapeCN: string
  /** 脸型相学解读 */
  description: string
}

/**
 * 判定脸型
 *
 * 国字脸主权威，圆字脸主福，甲字脸主智，由字脸主富。
 */
export function extractFaceShape(landmarks: Point2D[]): FaceShapeFeatures {
  const hairline = landmarks[10]
  const chin = landmarks[175]
  const rightCheek = landmarks[234]
  const leftCheek = landmarks[454]

  const faceWidth = dist(rightCheek, leftCheek)
  const faceLength = dist(hairline, chin)
  const aspectRatio = faceLength > 0 ? faceWidth / faceLength : 0

  let shape: FaceShape = 'unknown'
  let shapeCN = '未知'
  let description = ''

  if (aspectRatio > 0.85) {
    if (aspectRatio > 1.0) {
      shape = 'round'
      shapeCN = '圆字脸'
      description = '圆字脸主福，性格圆融，人缘佳，一生衣食丰足'
    } else {
      shape = 'square'
      shapeCN = '国字脸'
      description = '国字脸主权威，性格刚毅果断，有领导才能，事业有成'
    }
  } else if (aspectRatio > 0.7) {
    shape = 'oval'
    shapeCN = '甲字脸'
    description = '甲字脸主智，思维敏捷，早年得志，宜文职发展'
  } else {
    shape = 'long'
    shapeCN = '由字脸'
    description = '由字脸主富，重实务，中年发迹，晚年享福'
  }

  return { faceWidth, faceLength, aspectRatio, shape, shapeCN, description }
}

// ── 面部对称性 ──
export interface SymmetryFeatures {
  /** 整体对称性评分（0-1） */
  overallScore: number
  /** 眉眼对称 */
  upperFaceScore: number
  /** 鼻嘴对称 */
  midFaceScore: number
  /** 下巴对称 */
  lowerFaceScore: number
  /** 解读 */
  description: string
}

/**
 * 计算面部对称性
 *
 * 面相以对称为吉，左右对称代表阴阳平衡、运势通达。
 */
export function extractSymmetry(landmarks: Point2D[]): SymmetryFeatures {
  // 以鼻梁中线为基准，比较左右对称点的 x 坐标偏移
  // 鼻尖（1）与鼻根（168）的中点作为中线上点
  const noseTip = landmarks[1]
  const noseRoot = landmarks[168]
  const centerX = (noseTip.x + noseRoot.x) / 2

  // 对称点对：[左, 右]
  const pairs: [number, number][] = [
    [33, 263],   // 眼外角
    [133, 362],  // 眼内角
    [105, 334],  // 眉头
    [46, 276],   // 眉尾
    [61, 291],   // 嘴角
    [172, 397],  // 耳上
    [234, 454],  // 脸颊
    [102, 331],  // 鼻翼
  ]

  let totalDeviation = 0
  let upperDeviation = 0
  let midDeviation = 0
  let lowerDeviation = 0
  const upperPairs = 4  // 前 4 对为上半面
  const midPairs = 2    // 接下来 2 对为中面
  const lowerPairs = 2  // 最后 2 对为下半面

  pairs.forEach(([leftIdx, rightIdx], i) => {
    const left = landmarks[leftIdx]
    const right = landmarks[rightIdx]
    if (!left || !right) return
    // 左点应在中线左侧，右点应在中线右侧
    const leftDist = centerX - left.x
    const rightDist = right.x - centerX
    const deviation = Math.abs(leftDist - rightDist) / Math.max(Math.abs(leftDist) + Math.abs(rightDist), 0.001)
    totalDeviation += deviation
    if (i < upperPairs) upperDeviation += deviation
    else if (i < upperPairs + midPairs) midDeviation += deviation
    else lowerDeviation += deviation
  })

  const overallScore = Math.max(0, 1 - totalDeviation / pairs.length)
  const upperFaceScore = Math.max(0, 1 - upperDeviation / upperPairs)
  const midFaceScore = Math.max(0, 1 - midDeviation / midPairs)
  const lowerFaceScore = Math.max(0, 1 - lowerDeviation / lowerPairs)

  let description = ''
  if (overallScore > 0.9) {
    description = '面部高度对称，阴阳平衡，面相上佳'
  } else if (overallScore > 0.75) {
    description = '面部基本对称，运势平稳'
  } else {
    description = '面部存在不对称，需注意左右对应运势'
  }

  return { overallScore, upperFaceScore, midFaceScore, lowerFaceScore, description }
}

// ── 表情特征（Blendshapes） ──
export interface ExpressionFeatures {
  /** 微笑程度（0-1） */
  smileScore: number
  /** 眉毛上扬程度 */
  browRaise: number
  /** 眼睛睁大程度 */
  eyeWide: number
  /** 嘴巴张开程度 */
  jawOpen: number
  /** 解读 */
  description: string
}

/**
 * 从 Blendshapes 提取表情特征
 */
export function extractExpression(blendshapes?: { categoryName: string; score: number }[]): ExpressionFeatures {
  const defaultResult: ExpressionFeatures = {
    smileScore: 0,
    browRaise: 0,
    eyeWide: 0,
    jawOpen: 0,
    description: '未检测到表情数据',
  }
  if (!blendshapes || blendshapes.length === 0) return defaultResult

  const get = (name: string) => blendshapes.find((b) => b.categoryName === name)?.score || 0

  const smileScore = Math.max(
    get('mouthSmileLeft'),
    get('mouthSmileRight'),
  )
  const browRaise = Math.max(
    get('browInnerUp'),
    get('browOuterUpLeft'),
    get('browOuterUpRight'),
  )
  const eyeWide = Math.max(
    get('eyeWideLeft'),
    get('eyeWideRight'),
  )
  const jawOpen = get('jawOpen')

  let description = ''
  if (smileScore > 0.5) {
    description = '面带微笑，和善可亲，人缘佳'
  } else if (smileScore > 0.2) {
    description = '嘴角微扬，神态温和'
  } else {
    description = '神态平静，性情稳重'
  }

  return { smileScore, browRaise, eyeWide, jawOpen, description }
}

// ── 面部朝向检测 ──
export type FacePose = 'frontal' | 'left' | 'right' | 'tilted'

export interface FacePoseInfo {
  /** 朝向类型 */
  pose: FacePose
  /** 中文名 */
  poseCN: string
  /** 偏航角（-1 到 1，负为左转，正为右转） */
  yaw: number
  /** 俯仰角（-1 到 1，负为低头，正为抬头） */
  pitch: number
  /** 翻滚角（-1 到 1，负为左倾，正为右倾） */
  roll: number
  /** 侧面置信度（0-1） */
  sideConfidence: number
  /** 判定说明 */
  description: string
}

/**
 * 检测面部朝向
 *
 * 利用 MediaPipe 面部变换矩阵（faceTransformationMatrixes）
 * 从 4x4 仿射矩阵中提取旋转分量，推算 yaw/pitch/roll。
 * 若无变换矩阵，则基于关键点几何特征近似判断。
 */
export function detectFacePose(
  landmarks: Point2D[],
  transformationMatrix?: { data: number[] | Float32Array } | number[][],
): FacePoseInfo {
  let yaw = 0
  let pitch = 0
  let roll = 0

  if (transformationMatrix) {
    // 兼容 MediaPipe Matrix 类型和 number[][]
    let m: number[][]
    if ('data' in transformationMatrix) {
      const d = transformationMatrix.data
      m = [
        [d[0], d[1], d[2], d[3]],
        [d[4], d[5], d[6], d[7]],
        [d[8], d[9], d[10], d[11]],
        [d[12], d[13], d[14], d[15]],
      ]
    } else {
      m = transformationMatrix as number[][]
    }

    // 从 4x4 变换矩阵提取旋转分量
    // yaw: atan2(-m[0][2], m[0][0])
    yaw = Math.atan2(-(m[0]?.[2] || 0), m[0]?.[0] || 1) / (Math.PI / 2)
    // pitch: atan2(-m[1][2], sqrt(m[1][0]^2 + m[1][1]^2))
    pitch = Math.atan2(-(m[1]?.[2] || 0), Math.sqrt((m[1]?.[0] || 0) ** 2 + (m[1]?.[1] || 1) ** 2)) / (Math.PI / 2)
    // roll: atan2(m[1][0], m[0][0])
    roll = Math.atan2(m[1]?.[0] || 0, m[0]?.[0] || 1) / (Math.PI / 2)
  } else {
    // 基于关键点几何特征近似判断
    const leftEyeOuter = landmarks[33]
    const rightEyeOuter = landmarks[263]
    const noseTip = landmarks[1]
    const leftCheek = landmarks[234]
    const rightCheek = landmarks[454]

    if (leftEyeOuter && rightEyeOuter && noseTip && leftCheek && rightCheek) {
      // yaw：鼻尖相对于两眼中心的水平偏移
      const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2
      const eyeWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x) || 0.001
      yaw = (noseTip.x - eyeCenterX) / eyeWidth * 2

      // roll：两眼连线与水平线的夹角
      const eyeAngle = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x)
      roll = Math.sin(eyeAngle)

      // pitch：鼻尖相对于两眼的垂直距离归一化
      const eyeNoseDist = Math.abs(noseTip.y - (leftEyeOuter.y + rightEyeOuter.y) / 2)
      pitch = (eyeNoseDist / eyeWidth - 0.5) * 2
    }
  }

  // 确定朝向
  const absYaw = Math.abs(yaw)
  const absRoll = Math.abs(roll)

  let pose: FacePose = 'frontal'
  let poseCN = '正面'
  let description = '正面面相，五官对称，特征提取准确度高'

  if (absYaw > 0.35) {
    // 明显侧面
    if (yaw < 0) {
      pose = 'left'
      poseCN = '左侧面'
      description = '左侧面相，面向左侧。可提取三停、眉骨、鼻梁等侧面特征'
    } else {
      pose = 'right'
      poseCN = '右侧面'
      description = '右侧面相，面向右侧。可提取三停、眉骨、鼻梁等侧面特征'
    }
  } else if (absRoll > 0.25 || absYaw > 0.15) {
    pose = 'tilted'
    poseCN = '偏头'
    description = '面部略有偏转，部分特征可能不完全对称'
  } else {
    pose = 'frontal'
    poseCN = '正面'
    description = '正面面相，五官对称，特征提取准确度高'
  }

  const sideConfidence = Math.min(1, absYaw / 0.5)

  return { pose, poseCN, yaw, pitch, roll, sideConfidence, description }
}

/**
 * 侧面面相特征提取（调整后的特征提取管线）
 *
 * 侧面面相时，某些成对特征（如对称性、双耳对比）无法完整提取，
 * 因此使用侧面适配的特征提取策略：
 * - 三停：仍可通过发际线-鼻根-鼻尖-下巴的纵向距离提取
 * - 五官：可提取眉形、眼型、鼻形、嘴形（同侧）
 * - 对称性：仅评估可见侧的内部对称，或使用 pitch 修正
 * - 十二宫：部分宫位可见，补充侧面专属特征
 */
function extractSideFaceFeatures(
  landmarks: Point2D[],
  poseInfo: FacePoseInfo,
  blendshapes?: { categoryName: string; score: number }[],
): Omit<FaceFeatures, 'confidence'> {
  const isLeft = poseInfo.pose === 'left'

  // 三停：使用中轴线上的关键点（不受侧面影响）
  const sanTing = extractSanTing(landmarks)

  // 五官：根据侧面选择同侧特征
  const wuGuan = extractSideWuGuan(landmarks, isLeft)

  // 十二宫：仅评估可见侧宫位
  const shiErGong = extractSideShiErGong(landmarks, isLeft)

  // 脸型：使用可见侧轮廓
  const faceShape = extractSideFaceShape(landmarks, isLeft)

  // 对称性：侧面时仅评估面部纵向比例
  const symmetry = extractSideSymmetry(landmarks, poseInfo)

  // 表情
  const expression = extractExpression(blendshapes)

  return { sanTing, wuGuan, shiErGong, faceShape, symmetry, expression, pose: poseInfo }
}

/**
 * 侧面五官提取
 */
function extractSideWuGuan(landmarks: Point2D[], isLeft: boolean): WuGuanFeatures {
  const sideLabel = isLeft ? 'left' : 'right'

  const browStart = landmarks[isLeft ? 105 : 336]
  const browEnd = landmarks[isLeft ? 46 : 276]
  const eyeOuter = landmarks[isLeft ? 33 : 263]
  const eyeInner = landmarks[isLeft ? 133 : 362]
  const eyeTop = landmarks[isLeft ? 159 : 386]
  const eyeBottom = landmarks[isLeft ? 145 : 374]

  // 鼻
  const noseTip = landmarks[1]
  const noseRoot = landmarks[168]
  const nostril = landmarks[isLeft ? 102 : 331]

  // 嘴
  const mouthCorner = landmarks[isLeft ? 291 : 61]
  const upperLip = landmarks[0]
  const lowerLip = landmarks[17]

  // 耳（侧面时耳朵更清晰）
  const earTop = landmarks[isLeft ? 172 : 397]
  const earBottom = landmarks[isLeft ? 234 : 454] || landmarks[isLeft ? 147 : 376]

  const browLength = dist(browStart, browEnd)
  const eyeLength = dist(eyeOuter, eyeInner)
  const eyeHeight = dist(eyeTop, eyeBottom)
  const noseLength = dist(noseRoot, noseTip)
  const noseWidth = dist(nostril, landmarks[isLeft ? 102 : 331] === nostril ? nostril : landmarks[isLeft ? 102 : 331]) || dist(nostril, landmarks[isLeft ? 220 : 440])
  const lipThickness = dist(upperLip, lowerLip)
  const mouthWidth = dist(mouthCorner, landmarks[isLeft ? 61 : 291])
  const earLength = dist(earTop, earBottom)

  // 面部参考宽度（使用可见侧眼角到鼻尖距离）
  const refWidth = dist(eyeOuter, noseTip) || 0.01

  let description = ''
  if (eyeLength / refWidth > 0.4) {
    description = `${sideLabel}眼较长，眼神充足`
  } else {
    description = `${sideLabel}眼型中等`
  }
  description += `；鼻梁${noseLength / refWidth > 0.8 ? '高挺' : '适中'}`

  return {
    browEyeDistance: dist(eyeTop, browEnd),
    leftBrowLength: browLength,
    rightBrowLength: browLength,
    browSymmetry: 1.0,
    leftEyeLength: eyeLength,
    rightEyeLength: eyeLength,
    eyeSymmetry: 1.0,
    eyeSizeRatio: eyeHeight / Math.max(refWidth, 0.001),
    noseLength,
    noseWidth,
    noseFaceRatio: noseWidth / Math.max(refWidth, 0.001),
    mouthWidth,
    mouthFaceRatio: mouthWidth / Math.max(refWidth, 0.001),
    lipThickness,
    leftEarLength: earLength,
    rightEarLength: earLength,
    earSymmetry: 1.0,
    description,
  }
}

/**
 * 侧面十二宫提取
 */
function extractSideShiErGong(landmarks: Point2D[], isLeft: boolean): ShiErGongFeatures {
  // 命宫（印堂）
  const mingGongWidth = dist(landmarks[107] || landmarks[46], landmarks[336] || landmarks[276])
  const mingGongStatus = mingGongWidth > 0.04 ? '宽阔' : mingGongWidth > 0.02 ? '适中' : '狭窄'

  // 财帛宫（鼻子）
  const noseWidth = dist(landmarks[102], landmarks[331])
  const caiBoStatus = noseWidth > 0.08 ? '丰隆' : noseWidth > 0.05 ? '适中' : '偏小'

  // 官禄宫（额头）
  const guanLuHeight = dist(landmarks[10], landmarks[151])
  const guanLuStatus = guanLuHeight > 0.15 ? '宽广' : guanLuHeight > 0.1 ? '适中' : '偏窄'

  // 夫妻宫（眼尾）
  const eyeOuter = landmarks[isLeft ? 33 : 263]
  const temple = landmarks[isLeft ? 234 : 454]
  const fuQiFullness = dist(eyeOuter, temple)
  const fuQiStatus = fuQiFullness > 0.08 ? '丰满' : fuQiFullness > 0.05 ? '适中' : '凹陷'

  // 子女宫（眼下）
  const eyeBottom = landmarks[isLeft ? 145 : 374]
  const cheekTop = landmarks[isLeft ? 50 : 280]
  const ziNvHeight = dist(eyeBottom, cheekTop)
  const ziNvStatus = ziNvHeight > 0.04 ? '平满' : ziNvHeight > 0.02 ? '适中' : '低陷'

  // 疾厄宫（山根）
  const jiEHeight = dist(landmarks[168], landmarks[151])
  const jiEStatus = jiEHeight > 0.04 ? '高耸' : jiEHeight > 0.02 ? '适中' : '低陷'

  // 迁移宫（眉角→发际）
  const browOuter = landmarks[isLeft ? 105 : 334] || landmarks[isLeft ? 70 : 300]
  const hairSide = landmarks[isLeft ? 139 : 368] || landmarks[isLeft ? 54 : 284]
  const qianYiFullness = dist(browOuter, hairSide)
  const qianYiStatus = qianYiFullness > 0.06 ? '开阔' : qianYiFullness > 0.035 ? '适中' : '窄小'

  // 交友宫（脸颊两侧）
  const cheek = landmarks[isLeft ? 50 : 280]
  const jawOuter = landmarks[isLeft ? 172 : 396] || landmarks[isLeft ? 58 : 288]
  const jiaoYouFullness = dist(cheek, jawOuter)
  const jiaoYouStatus = jiaoYouFullness > 0.09 ? '饱满' : jiaoYouFullness > 0.06 ? '适中' : '瘦削'

  // 田宅宫（上眼睑）
  const browMidBottom = landmarks[isLeft ? 105 : 334] || landmarks[isLeft ? 70 : 300]
  const eyeTop = landmarks[isLeft ? 159 : 386] || landmarks[isLeft ? 160 : 387]
  const tianZhaiHeight = dist(browMidBottom, eyeTop)
  const tianZhaiStatus = tianZhaiHeight > 0.02 ? '宽阔' : tianZhaiHeight > 0.01 ? '适中' : '狭窄'

  // 福德宫（眉骨上方）
  const fuDeFullness = dist(browMidBottom, hairSide)
  const fuDeStatus = fuDeFullness > 0.08 ? '丰隆' : fuDeFullness > 0.05 ? '适中' : '凹陷'

  // 父母宫（日月角）
  const sunAngle = landmarks[isLeft ? 137 : 366] || landmarks[isLeft ? 54 : 284]
  const fuMuFullness = dist(landmarks[10], sunAngle)
  const fuMuStatus = fuMuFullness > 0.1 ? '隆起' : fuMuFullness > 0.06 ? '平满' : '低平'

  // 兄弟宫（眉尾长度）
  const browInner = landmarks[isLeft ? 107 : 336] || landmarks[isLeft ? 46 : 276]
  const xiongDiWidth = dist(browInner, browOuter)
  const xiongDiStatus = xiongDiWidth > 0.08 ? '舒展' : xiongDiWidth > 0.05 ? '适中' : '短促'

  const statuses = [
    mingGongStatus, caiBoStatus, guanLuStatus, fuQiStatus, ziNvStatus, jiEStatus,
    qianYiStatus, jiaoYouStatus, tianZhaiStatus, fuDeStatus, fuMuStatus, xiongDiStatus,
  ]
  const goodSignals = ['宽阔', '丰隆', '宽广', '丰满', '平满', '高耸', '开阔', '饱满', '舒展', '隆起']
  const goodCount = statuses.filter((s) => goodSignals.includes(s)).length
  const description = goodCount >= 8
    ? `${isLeft ? '左侧' : '右侧'}面相：十二宫多数饱满，面相格局上佳`
    : goodCount >= 5
      ? `${isLeft ? '左侧' : '右侧'}面相：十二宫尚可，部分宫位需注意`
      : `${isLeft ? '左侧' : '右侧'}面相：十二宫多欠佳`

  return {
    mingGong: { width: mingGongWidth, status: mingGongStatus },
    caiBo: { width: noseWidth, status: caiBoStatus },
    guanLu: { height: guanLuHeight, status: guanLuStatus },
    fuQi: { fullness: fuQiFullness, status: fuQiStatus },
    ziNv: { height: ziNvHeight, status: ziNvStatus },
    jiE: { height: jiEHeight, status: jiEStatus },
    qianYi: { fullness: qianYiFullness, status: qianYiStatus },
    jiaoYou: { fullness: jiaoYouFullness, status: jiaoYouStatus },
    tianZhai: { height: tianZhaiHeight, status: tianZhaiStatus },
    fuDe: { fullness: fuDeFullness, status: fuDeStatus },
    fuMu: { fullness: fuMuFullness, status: fuMuStatus },
    xiongDi: { width: xiongDiWidth, status: xiongDiStatus },
    description,
  }
}

/**
 * 侧面脸型判定
 */
function extractSideFaceShape(landmarks: Point2D[], isLeft: boolean): FaceShapeFeatures {
  const hairline = landmarks[10]
  const chin = landmarks[175]
  const cheek = landmarks[isLeft ? 234 : 454]
  const jawAngle = landmarks[isLeft ? 58 : 288]

  const faceLength = dist(hairline, chin)
  const faceWidth = dist(cheek, jawAngle)
  const aspectRatio = faceLength > 0 ? faceWidth / faceLength : 0

  let shape: FaceShape = 'unknown'
  let shapeCN = '未知'
  let description = ''

  if (aspectRatio > 0.55) {
    shape = 'round'
    shapeCN = '圆脸'
    description = '侧面观脸型偏圆，性格温和'
  } else if (aspectRatio > 0.42) {
    shape = 'oval'
    shapeCN = '鹅蛋脸'
    description = '侧面观脸型椭圆，五官比例协调'
  } else {
    shape = 'long'
    shapeCN = '长脸'
    description = '侧面观脸型偏长，思维缜密'
  }

  return { faceWidth, faceLength, aspectRatio, shape, shapeCN, description }
}

/**
 * 侧面对称性（基于纵向比例）
 */
function extractSideSymmetry(landmarks: Point2D[], poseInfo: FacePoseInfo): SymmetryFeatures {
  const noseTip = landmarks[1]
  const noseRoot = landmarks[168]
  const chin = landmarks[175]
  const hairline = landmarks[10]

  const total = dist(hairline, chin) || 0.001
  const upperRatio = dist(hairline, noseRoot) / total
  const middleRatio = dist(noseRoot, noseTip) / total
  const lowerRatio = dist(noseTip, chin) / total

  const deviation = Math.abs(upperRatio - 0.33) + Math.abs(middleRatio - 0.33) + Math.abs(lowerRatio - 0.33)
  const overallScore = Math.max(0, 1 - deviation * 1.5)

  let description = ''
  if (overallScore > 0.9) {
    description = '侧面三停比例协调，运势平稳'
  } else if (overallScore > 0.75) {
    description = '侧面三停基本协调'
  } else {
    description = '侧面三停比例略有偏差，需注意对应运势'
  }

  return {
    overallScore,
    upperFaceScore: 1 - Math.abs(upperRatio - 0.33) * 2,
    midFaceScore: 1 - Math.abs(middleRatio - 0.33) * 2,
    lowerFaceScore: 1 - Math.abs(lowerRatio - 0.33) * 2,
    description,
  }
}

// ── 面相综合特征 ──
export interface FaceFeatures {
  sanTing: SanTingFeatures
  wuGuan: WuGuanFeatures
  shiErGong: ShiErGongFeatures
  faceShape: FaceShapeFeatures
  symmetry: SymmetryFeatures
  expression: ExpressionFeatures
  /** 面部朝向信息 */
  pose: FacePoseInfo
  /** 检测置信度 */
  confidence: number
}

/**
 * 综合提取面相特征（自动检测正面/侧面）
 * @param landmarks MediaPipe 468 面部关键点
 * @param blendshapes 可选，表情 Blendshape 数据
 * @param transformationMatrix 可选，面部变换矩阵（用于朝向检测）
 */
export function extractFaceFeatures(
  landmarks: Point2D[],
  blendshapes?: { categoryName: string; score: number }[],
  transformationMatrix?: { data: number[] | Float32Array } | number[][],
): FaceFeatures {
  // 自动检测面部朝向
  const poseInfo = detectFacePose(landmarks, transformationMatrix)

  // 根据朝向选择特征提取策略
  if (poseInfo.pose === 'frontal' || poseInfo.pose === 'tilted') {
    // 正面或偏头：使用标准提取
    return {
      sanTing: extractSanTing(landmarks),
      wuGuan: extractWuGuan(landmarks),
      shiErGong: extractShiErGong(landmarks),
      faceShape: extractFaceShape(landmarks),
      symmetry: extractSymmetry(landmarks),
      expression: extractExpression(blendshapes),
      pose: poseInfo,
      confidence: 1.0,
    }
  } else {
    // 左侧面或右侧面：使用侧面适配提取
    const sideFeatures = extractSideFaceFeatures(landmarks, poseInfo, blendshapes)
    return {
      ...sideFeatures,
      pose: poseInfo,
      confidence: 1.0,
    }
  }
}
