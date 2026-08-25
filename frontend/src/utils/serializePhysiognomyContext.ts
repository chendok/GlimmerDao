/**
 * 面相手相特征序列化工具
 *
 * 将提取的 FaceFeatures / HandFeatures 序列化为结构化文本，
 * 作为 LLM 的 context_data 注入到分析报告中。
 *
 * 序列化原则：
 * 1. 仅传递可量化特征和判定结论，不传递原始图像
 * 2. 掌纹线传递自动检测/手动标注的几何描述
 * 3. 格式清晰、结构化，便于 LLM 理解
 */
import type { FaceFeatures } from './physiognomyFeatures'
import type { HandFeatures, PalmLineMark } from './handFeatures'

export type PhysiognomyAnalysisType = 'face' | 'hand' | 'combined'

export interface PhysiognomyContextData {
  /** 分析类型 */
  analysisType: PhysiognomyAnalysisType
  /** 命主姓名 */
  name?: string
  /** 性别 */
  gender?: string
  /** 采集方式 */
  captureMethod: 'camera' | 'upload'
  /** 面部特征（face/combined 时有值） */
  faceFeatures?: FaceFeatures
  /** 手部特征（hand/combined 时有值） */
  handFeatures?: HandFeatures
}

/**
 * 格式化百分比
 */
function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/**
 * 序列化面部特征
 */
function serializeFaceFeatures(f: FaceFeatures): string[] {
  const lines: string[] = []

  // ── 面部朝向 ──
  lines.push('【面部朝向】')
  lines.push(`  朝向：${f.pose.poseCN}（偏航 ${f.pose.yaw.toFixed(2)}，俯仰 ${f.pose.pitch.toFixed(2)}，翻滚 ${f.pose.roll.toFixed(2)}）`)
  lines.push(`  判定：${f.pose.description}`)
  lines.push('')

  // ── 三停 ──
  lines.push('【三停比例】')
  lines.push(`  上停（额至眉）：${pct(f.sanTing.upperRatio)} ${f.sanTing.balanced ? '【三停均等】' : ''}`)
  lines.push(`  中停（眉至鼻）：${pct(f.sanTing.middleRatio)}`)
  lines.push(`  下停（鼻至颏）：${pct(f.sanTing.lowerRatio)}`)
  lines.push(`  判定：${f.sanTing.description}`)
  lines.push('')

  // ── 脸型 ──
  lines.push('【脸型】')
  lines.push(`  脸型：${f.faceShape.shapeCN}（宽高比 ${f.faceShape.aspectRatio.toFixed(2)}）`)
  lines.push(`  判定：${f.faceShape.description}`)
  lines.push('')

  // ── 五官 ──
  lines.push('【五官】')
  lines.push(`  眉：左右长度比 ${f.wuGuan.browSymmetry.toFixed(2)}，对称度 ${pct(f.wuGuan.browSymmetry)}`)
  lines.push(`  眼：左右长度比 ${f.wuGuan.eyeSymmetry.toFixed(2)}，眼宽/脸宽 ${pct(f.wuGuan.eyeSizeRatio)}`)
  lines.push(`  鼻：鼻长 ${f.wuGuan.noseLength.toFixed(3)}，鼻宽/脸宽 ${pct(f.wuGuan.noseFaceRatio)}`)
  lines.push(`  口：嘴宽/脸宽 ${pct(f.wuGuan.mouthFaceRatio)}，唇厚 ${f.wuGuan.lipThickness.toFixed(3)}`)
  lines.push(`  耳：左右对称度 ${pct(f.wuGuan.earSymmetry)}`)
  lines.push(`  判定：${f.wuGuan.description}`)
  lines.push('')

  // ── 十二宫 ──
  lines.push('【十二宫状态】')
  lines.push(`  命宫（印堂）：${f.shiErGong.mingGong.status}`)
  lines.push(`  财帛宫（鼻）：${f.shiErGong.caiBo.status}`)
  lines.push(`  官禄宫（额）：${f.shiErGong.guanLu.status}`)
  lines.push(`  夫妻宫（眼尾）：${f.shiErGong.fuQi.status}`)
  lines.push(`  子女宫（眼下）：${f.shiErGong.ziNv.status}`)
  lines.push(`  疾厄宫（山根）：${f.shiErGong.jiE.status}`)
  lines.push(`  迁移宫（眉角发际）：${f.shiErGong.qianYi.status}`)
  lines.push(`  交友宫（脸颊）：${f.shiErGong.jiaoYou.status}`)
  lines.push(`  田宅宫（上眼睑）：${f.shiErGong.tianZhai.status}`)
  lines.push(`  福德宫（眉骨上）：${f.shiErGong.fuDe.status}`)
  lines.push(`  父母宫（日月角）：${f.shiErGong.fuMu.status}`)
  lines.push(`  兄弟宫（眉）：${f.shiErGong.xiongDi.status}`)
  lines.push(`  判定：${f.shiErGong.description}`)
  lines.push('')

  // ── 对称性 ──
  lines.push('【面部对称性】')
  lines.push(`  整体对称度：${pct(f.symmetry.overallScore)}`)
  lines.push(`  上停对称：${pct(f.symmetry.upperFaceScore)} | 中停：${pct(f.symmetry.midFaceScore)} | 下停：${pct(f.symmetry.lowerFaceScore)}`)
  lines.push(`  判定：${f.symmetry.description}`)
  lines.push('')

  // ── 表情 ──
  if (f.expression.smileScore > 0 || f.expression.browRaise > 0) {
    lines.push('【神态表情】')
    lines.push(`  微笑程度：${f.expression.smileScore.toFixed(2)}`)
    lines.push(`  判定：${f.expression.description}`)
    lines.push('')
  }

  return lines
}

/**
 * 序列化单条掌纹线
 */
function serializePalmLine(line: PalmLineMark | null, name: string): string {
  if (!line) return `  ${name}：未标注`
  const parts = [
    `长度 ${line.length.toFixed(3)}`,
    `清晰度 ${line.clarity}/5`,
    line.branched ? '有分叉' : '无分叉',
  ]
  return `  ${name}：${parts.join('，')}`
}

/**
 * 序列化手部特征
 */
function serializeHandFeatures(h: HandFeatures): string[] {
  const lines: string[] = []

  // ── 掌型 ──
  lines.push('【掌型】')
  lines.push(`  掌型：${h.palmShape.palmTypeCN}（${h.palmShape.elementCN}，宽长比 ${h.palmShape.aspectRatio.toFixed(2)}）`)
  lines.push(`  掌宽 ${h.palmShape.palmWidth.toFixed(3)}，掌长 ${h.palmShape.palmLength.toFixed(3)}`)
  lines.push(`  判定：${h.palmShape.description}`)
  lines.push('')

  // ── 手指比例 ──
  lines.push('【手指比例】')
  lines.push(`  拇指：${h.fingerRatios.thumbStatus === 'large' ? '粗大' : h.fingerRatios.thumbStatus === 'small' ? '偏小' : '适中'}（长度 ${h.fingerRatios.thumbLength.toFixed(3)}）`)
  lines.push(`  食指：长度 ${h.fingerRatios.indexLength.toFixed(3)}`)
  lines.push(`  中指：长度 ${h.fingerRatios.middleLength.toFixed(3)}（中指/掌长 ${h.fingerRatios.middlePalmRatio.toFixed(2)}）`)
  lines.push(`  无名指：长度 ${h.fingerRatios.ringLength.toFixed(3)}`)
  lines.push(`  小指：${h.fingerRatios.pinkyStatus === 'short' ? '偏短' : h.fingerRatios.pinkyStatus === 'long' ? '修长' : '适中'}（长度 ${h.fingerRatios.pinkyLength.toFixed(3)}）`)
  lines.push(`  食指/无名指比（2D:4D）：${h.fingerRatios.indexRingRatio.toFixed(2)} ${h.fingerRatios.indexRingRatio < 0.95 ? '（无名指长，行动型）' : h.fingerRatios.indexRingRatio > 1.05 ? '（食指长，社交型）' : '（均衡）'}`)
  lines.push(`  判定：${h.fingerRatios.description}`)
  lines.push('')

  // ── 八丘 ──
  lines.push('【掌丘饱满度】')
  lines.push(`  木星丘（食指根）：${h.palmMounts.jupiter.status}`)
  lines.push(`  土星丘（中指根）：${h.palmMounts.saturn.status}`)
  lines.push(`  太阳丘（无名指根）：${h.palmMounts.apollo.status}`)
  lines.push(`  水星丘（小指根）：${h.palmMounts.mercury.status}`)
  lines.push(`  金星丘（拇指根）：${h.palmMounts.venus.status}`)
  lines.push(`  月丘（掌侧）：${h.palmMounts.moon.status}`)
  lines.push(`  火星丘（掌中）：${h.palmMounts.mars.status}`)
  lines.push(`  地丘（手腕处）：${h.palmMounts.earth.status}`)
  lines.push(`  判定：${h.palmMounts.description}`)
  lines.push('')

  // ── 掌纹 ──
  lines.push('【掌纹线】')
  lines.push(serializePalmLine(h.palmLines.lifeLine, '生命线'))
  lines.push(serializePalmLine(h.palmLines.headLine, '智慧线'))
  lines.push(serializePalmLine(h.palmLines.heartLine, '感情线'))
  lines.push(serializePalmLine(h.palmLines.fateLine, '命运线'))
  lines.push(`  判定：${h.palmLines.description}`)
  lines.push('')

  // ── 左右手 ──
  if (h.handedness !== 'Unknown') {
    lines.push(`【采集手】${h.handedness === 'Right' ? '右手（后天主运）' : '左手（先天主命）'}`)
    lines.push('')
  }

  return lines
}

/**
 * 将面相手相特征序列化为结构化文本
 *
 * 输出格式：
 *   【麻衣神相采集信息】
 *   分析类型：面相/手相/综合
 *   姓名：xxx  性别：x
 *   采集方式：摄像头/上传
 *
 *   【面相特征】
 *   ...面部特征...
 *
 *   【手相特征】
 *   ...手部特征...
 *
 *   【分析要求】
 *   ...
 */
export function serializePhysiognomyContext(data: PhysiognomyContextData): string {
  const lines: string[] = []

  // ── 采集信息 ──
  lines.push('【麻衣神相采集信息】')
  const typeMap: Record<PhysiognomyAnalysisType, string> = {
    face: '面相分析',
    hand: '手相分析',
    combined: '面相+手相综合分析',
  }
  lines.push(`分析类型：${typeMap[data.analysisType]}`)
  if (data.name) lines.push(`姓名：${data.name}`)
  if (data.gender) lines.push(`性别：${data.gender}`)
  lines.push(`采集方式：${data.captureMethod === 'camera' ? '摄像头实时采集' : '图片上传'}`)
  lines.push('')

  // ── 面相特征 ──
  if (data.faceFeatures) {
    lines.push('═══ 面相特征 ═══')
    lines.push(...serializeFaceFeatures(data.faceFeatures))
  }

  // ── 手相特征 ──
  if (data.handFeatures) {
    lines.push('═══ 手相特征 ═══')
    lines.push(...serializeHandFeatures(data.handFeatures))
  }

  // ── 分析要求 ──
  lines.push('【分析要求】')
  if (data.analysisType === 'face') {
    lines.push('请基于以上面部特征数据，运用《麻衣神相》《柳庄相法》等相学理论，')
    lines.push('从三停、五官、十二宫、脸型、对称性等维度进行面相深度分析。')
    lines.push('重点解读命主性格特质、运势走向、事业财运、婚姻感情、健康提示等。')
  } else if (data.analysisType === 'hand') {
    lines.push('请基于以上手部特征数据，运用相学理论，')
    lines.push('从掌型、手指比例、掌丘、掌纹等维度进行手相深度分析。')
    lines.push('重点解读命主性格特质、天赋潜能、运势走向、人生建议等。')
  } else {
    lines.push('请基于以上面部和手部特征数据，运用《麻衣神相》等相学理论，')
    lines.push('进行面相与手相的综合分析，互相印证，给出全面的人生解读。')
    lines.push('面相关注三停五官十二宫，手相关注掌型掌丘掌纹，综合判断命主格局层次。')
  }

  // ── 隐私说明 ──
  lines.push('')
  lines.push('【隐私说明】')
  lines.push('以上数据仅包含可量化的几何特征和判定结论，原始图像未上传。')
  lines.push('分析应基于特征数据展开，不涉及对原始图像的直接评判。')

  return lines.join('\n')
}

/**
 * 生成特征摘要（用于档案库列表展示）
 */
export function generateFeatureSummary(data: PhysiognomyContextData): string {
  const parts: string[] = []
  if (data.faceFeatures) {
    parts.push(`脸型：${data.faceFeatures.faceShape.shapeCN}`)
    parts.push(`三停：${data.faceFeatures.sanTing.balanced ? '均等' : data.faceFeatures.sanTing.longest === 'upper' ? '上停长' : data.faceFeatures.sanTing.longest === 'middle' ? '中停长' : '下停长'}`)
    parts.push(`对称度：${(data.faceFeatures.symmetry.overallScore * 100).toFixed(0)}%`)
  }
  if (data.handFeatures) {
    parts.push(`掌型：${data.handFeatures.palmShape.palmTypeCN}`)
    parts.push(`元素：${data.handFeatures.palmShape.elementCN}`)
  }
  return parts.join('，')
}

/**
 * 将麻衣神相特征数据序列化为 JSON 格式（与注入 LLM 的数据一致）
 */
export function serializePhysiognomyJson(params: {
  name: string
  gender: string
  analysisType: PhysiognomyAnalysisType
  captureMethod: 'camera' | 'upload'
  imageCount: number
  faceFeatures?: FaceFeatures | null
  handFeatures?: HandFeatures | null
}): string {
  const typeMap: Record<PhysiognomyAnalysisType, string> = {
    face: '面相分析',
    hand: '手相分析',
    combined: '面相+手相综合分析',
  }

  const result: Record<string, unknown> = {
    chartType: '麻衣神相',
    analysisType: typeMap[params.analysisType],
    basicInfo: {
      name: params.name || '匿名',
      gender: params.gender,
      captureMethod: params.captureMethod === 'camera' ? '摄像头实时采集' : '图片上传',
      imageCount: params.imageCount,
    },
  }

  // ── 面相特征 ──
  if (params.faceFeatures) {
    const f = params.faceFeatures
    const faceData: Record<string, unknown> = {}

    faceData.pose = {
      direction: f.pose.poseCN,
      yaw: parseFloat(f.pose.yaw.toFixed(2)),
      pitch: parseFloat(f.pose.pitch.toFixed(2)),
      roll: parseFloat(f.pose.roll.toFixed(2)),
      description: f.pose.description,
    }

    faceData.faceShape = {
      type: f.faceShape.shapeCN,
      aspectRatio: parseFloat(f.faceShape.aspectRatio.toFixed(2)),
      description: f.faceShape.description,
    }

    faceData.sanTing = {
      upperRatio: parseFloat(f.sanTing.upperRatio.toFixed(4)),
      middleRatio: parseFloat(f.sanTing.middleRatio.toFixed(4)),
      lowerRatio: parseFloat(f.sanTing.lowerRatio.toFixed(4)),
      balanced: f.sanTing.balanced,
      longest: f.sanTing.longest,
      description: f.sanTing.description,
    }

    faceData.wuGuan = {
      browSymmetry: parseFloat(f.wuGuan.browSymmetry.toFixed(4)),
      eyeSymmetry: parseFloat(f.wuGuan.eyeSymmetry.toFixed(4)),
      eyeSizeRatio: parseFloat(f.wuGuan.eyeSizeRatio.toFixed(4)),
      noseLength: parseFloat(f.wuGuan.noseLength.toFixed(3)),
      noseFaceRatio: parseFloat(f.wuGuan.noseFaceRatio.toFixed(4)),
      mouthFaceRatio: parseFloat(f.wuGuan.mouthFaceRatio.toFixed(4)),
      lipThickness: parseFloat(f.wuGuan.lipThickness.toFixed(3)),
      earSymmetry: parseFloat(f.wuGuan.earSymmetry.toFixed(4)),
      description: f.wuGuan.description,
    }

    faceData.shiErGong = {
      mingGong: f.shiErGong.mingGong.status,
      caiBo: f.shiErGong.caiBo.status,
      guanLu: f.shiErGong.guanLu.status,
      fuQi: f.shiErGong.fuQi.status,
      ziNv: f.shiErGong.ziNv.status,
      jiE: f.shiErGong.jiE.status,
      qianYi: f.shiErGong.qianYi.status,
      jiaoYou: f.shiErGong.jiaoYou.status,
      tianZhai: f.shiErGong.tianZhai.status,
      fuDe: f.shiErGong.fuDe.status,
      fuMu: f.shiErGong.fuMu.status,
      xiongDi: f.shiErGong.xiongDi.status,
      description: f.shiErGong.description,
    }

    faceData.symmetry = {
      overallScore: parseFloat(f.symmetry.overallScore.toFixed(4)),
      upperFaceScore: parseFloat(f.symmetry.upperFaceScore.toFixed(4)),
      midFaceScore: parseFloat(f.symmetry.midFaceScore.toFixed(4)),
      lowerFaceScore: parseFloat(f.symmetry.lowerFaceScore.toFixed(4)),
      description: f.symmetry.description,
    }

    if (f.expression.smileScore > 0 || f.expression.browRaise > 0) {
      faceData.expression = {
        smileScore: parseFloat(f.expression.smileScore.toFixed(2)),
        browRaise: parseFloat(f.expression.browRaise.toFixed(2)),
        description: f.expression.description,
      }
    }

    result.faceFeatures = faceData
  }

  // ── 手相特征 ──
  if (params.handFeatures) {
    const h = params.handFeatures
    const handData: Record<string, unknown> = {}

    handData.palmShape = {
      type: h.palmShape.palmTypeCN,
      element: h.palmShape.elementCN,
      aspectRatio: parseFloat(h.palmShape.aspectRatio.toFixed(2)),
      palmWidth: parseFloat(h.palmShape.palmWidth.toFixed(3)),
      palmLength: parseFloat(h.palmShape.palmLength.toFixed(3)),
      description: h.palmShape.description,
    }

    handData.fingerRatios = {
      thumbLength: parseFloat(h.fingerRatios.thumbLength.toFixed(3)),
      thumbStatus: h.fingerRatios.thumbStatus,
      indexLength: parseFloat(h.fingerRatios.indexLength.toFixed(3)),
      middleLength: parseFloat(h.fingerRatios.middleLength.toFixed(3)),
      middlePalmRatio: parseFloat(h.fingerRatios.middlePalmRatio.toFixed(2)),
      ringLength: parseFloat(h.fingerRatios.ringLength.toFixed(3)),
      pinkyLength: parseFloat(h.fingerRatios.pinkyLength.toFixed(3)),
      pinkyStatus: h.fingerRatios.pinkyStatus,
      indexRingRatio: parseFloat(h.fingerRatios.indexRingRatio.toFixed(2)),
      description: h.fingerRatios.description,
    }

    handData.palmMounts = {
      jupiter: h.palmMounts.jupiter.status,
      saturn: h.palmMounts.saturn.status,
      apollo: h.palmMounts.apollo.status,
      mercury: h.palmMounts.mercury.status,
      venus: h.palmMounts.venus.status,
      moon: h.palmMounts.moon.status,
      mars: h.palmMounts.mars.status,
      earth: h.palmMounts.earth.status,
      description: h.palmMounts.description,
    }

    const serializeLine = (line: typeof h.palmLines.lifeLine) => {
      if (!line) return null
      return {
        length: parseFloat(line.length.toFixed(3)),
        clarity: line.clarity,
        branched: line.branched,
      }
    }
    handData.palmLines = {
      lifeLine: serializeLine(h.palmLines.lifeLine),
      headLine: serializeLine(h.palmLines.headLine),
      heartLine: serializeLine(h.palmLines.heartLine),
      fateLine: serializeLine(h.palmLines.fateLine),
      description: h.palmLines.description,
    }

    if (h.handedness !== 'Unknown') {
      handData.handedness = h.handedness === 'Right' ? '右手（后天主运）' : '左手（先天主命）'
    }

    result.handFeatures = handData
  }

  return JSON.stringify(result, null, 2)
}
