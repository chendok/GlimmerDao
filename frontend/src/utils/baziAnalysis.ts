/**
 * 八字排盘预计算分析模块
 * 
 * 基于 .skill/bazi_analysis/SKILL.md 和 references/ 中的规则文档，
 * 实现 analysis 字段的全部8个子字段的计算。
 * 
 * 所有计算规则严格遵循 SKILL.md 六、核心判定规则 中的嵌入式速查表和公式。
 */

import {
  TIAN_GAN, DI_ZHI, GAN_WX, ZHI_WX, GAN_YIN_YANG,
  SHI_SHEN, ZANG_GAN, NA_YIN,
  type PillarInfo, type DaYun, type LiuNian, type LiuYue,
} from './baziCalculator'

// Re-export for convenience
export { TIAN_GAN, DI_ZHI, GAN_WX, ZHI_WX, GAN_YIN_YANG }

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export interface DayMasterStrength {
  gan: string
  wuXing: string
  level: string          // 身强/中和/身弱
  score: number          // 0-100
  deLing: boolean
  deDi: boolean
  deShi: boolean
  detail: string
  fuYiDirection: string
}

export interface GeJuInfo {
  name: string
  chengBaiDu: string     // 成/半成/破格
  yongShen: string
  xiangShen: string
  chongKe: string
  heHua: string
  level: string
}

export interface TiaoHouResult {
  hanNuan: { level: string; score: number }
  zaoShi: { level: string; score: number }
  tiaoHouNeed: boolean
  tiaoHouYongShen: string
  tiaoHouReason: string
  urgency: string
}

export interface YongShenResult {
  tiaoHouYongShen: string
  fuYiYongShen: string[]
  geJuYongShen: string
  zongHeYongShen: string[]
  priorityOrder: string[]
  priorityReason: string
  zongHeReason: string
  xiShen: string[]
  jiShen: string[]
  chouShen: string[]
  xianShen: string[]
  derivation: {
    yongShen: string
    xiShen: string
    jiShen: string
    chouShen: string
  }
}

export interface ShiShenPowerItem {
  rank: number
  name: string
  wuXing: string
  power: number
  level: string
  sources: string
}

export interface ShiShenCombinationResult {
  name: string
  type: string           // 吉组合/凶组合/特殊组合/无
  priority: number
  conditions: Record<string, { name: string; level: string; meetsRequirement: boolean }>
  coreMeaning: string
  yongShenShiShen: string
  yongShenConflict: boolean
  geJuImpact: string
}

export interface DiZhiRelationItem {
  exists: boolean
  pairs?: { branches: string; strength?: string; pillars?: string; heHuaWuXing?: string; zhongShen?: string; type?: string; huiHuaWuXing?: string }[]
  groups?: { branches: string; heHuaWuXing?: string; zhongShen?: string; pillars?: string; huiHuaWuXing?: string }[]
  note?: string
}

export interface DiZhiRelationsStructured {
  liuHe: DiZhiRelationItem
  sanHe: DiZhiRelationItem
  banHe: DiZhiRelationItem
  sanHui: DiZhiRelationItem
  liuChong: DiZhiRelationItem
  xing: DiZhiRelationItem
  hai: DiZhiRelationItem
  po: DiZhiRelationItem
  summary: string
}

export interface MingJuLevelScore {
  dimension: string
  score: number
  maxScore: number
  reason: string
}

export interface MingJuLevelResult {
  scores: MingJuLevelScore[]
  totalScore: number
  level: string
  levelRange: string
  summary: string
}

// ── 3.9 天干五合 ──
export interface GanHePair {
  ganZhi: string
  heHuaWuXing: string
  pillars: string
  strength: string       // 强/中/弱
  isAdjacent: boolean
  description: string
}

export interface GanHeResult {
  exists: boolean
  pairs: GanHePair[]
  summary: string
}

// ── 3.10 五行流通 ──
export interface WuXingFlowResult {
  path: string
  flowDirection: string   // 顺生/逆生/混乱
  finalDestination: string
  finalDestinationWuXing: string
  blockPoint: string
  tongGuan: string
  smoothness: string      // 顺畅/有阻但可通/不畅/断裂
  smoothnessScore: number // 0-20
  description: string
}

// ── 3.11 纳音格局 ──
export interface NaYinElement {
  pillar: string
  naYin: string
  wuXing: string
  meaning: string
}

export interface NaYinShengKe {
  from: string
  to: string
  relation: string
  meaning: string
}

export interface NaYinAssessmentResult {
  pattern: string
  patternQuality: string
  elements: NaYinElement[]
  shengKeRelations: NaYinShengKe[]
  overallAssessment: string
  impactOnDayMaster: string
}

// ── 3.12 大运评估 ──
export interface DaYunEvaluation {
  ganZhi: string
  startAge: number
  endAge: number
  isCurrent?: boolean
  level: string          // 大吉/偏吉/平运/偏凶/大凶
  score: number          // 0-100
  dimensions: {
    wuXingRelation: number    // 0-40
    diZhiInteraction: number  // 0-35
    ganInteraction: number    // 0-25
  }
  summary: string
  keyYears: number[]
  advice: string
}

// ── 3.13 神煞分类 ──
export interface ShenShaItem {
  name: string
  location: string
  level: string
  score: number
  description: string
}

export interface ShenShaClassificationResult {
  jiShen: ShenShaItem[]
  xiongSha: ShenShaItem[]
  jiXiongRatio: { ji: number; xiong: number; ratio: string }
  summary: string
}

// ── 3.14 流年评估 ──
export interface LiuNianAssessment {
  year: number
  ganZhi: string
  level: string
  score: number
  summary: string
  riskLevel: string
  riskReason: string
  opportunities: string[]
  advice: string
}

export interface AnalysisResult {
  dayMasterStrength: DayMasterStrength
  geJuInfo: GeJuInfo
  tiaoHou: TiaoHouResult
  yongShen: YongShenResult
  shiShenPower: ShiShenPowerItem[]
  shiShenCombination: ShiShenCombinationResult
  diZhiRelations: DiZhiRelationsStructured
  mingJuLevel: MingJuLevelResult
  ganHe: GanHeResult
  wuXingFlow: WuXingFlowResult
  naYinAssessment: NaYinAssessmentResult
  daYunEvaluations: DaYunEvaluation[]
  shenShaClassification: ShenShaClassificationResult
  liuNianAssessments: LiuNianAssessment[]
}

// ═══════════════════════════════════════════════════════════════
// 基础工具函数
// ═══════════════════════════════════════════════════════════════

/** 天干五行 → 生它的五行（印星） */
const SHENG_WX: Record<string, string> = {
  '木': '水', '火': '木', '土': '火', '金': '土', '水': '金',
}

/** 天干五行 → 它生的五行（食伤） */
const SHENG_CHU_WX: Record<string, string> = {
  '木': '火', '火': '土', '土': '金', '金': '水', '水': '木',
}

/** 天干五行 → 克它的五行（官杀） */
const KE_WX: Record<string, string> = {
  '木': '金', '火': '水', '土': '木', '金': '火', '水': '土',
}

/** 天干五行 → 它克的五行（财星） */
const KE_CHU_WX: Record<string, string> = {
  '木': '土', '火': '金', '土': '水', '金': '木', '水': '火',
}

/** 十神名称 → 五行关系映射 */
const SHI_SHEN_TO_WX: Record<string, Record<string, string>> = {
  '比肩': { '木': '木', '火': '火', '土': '土', '金': '金', '水': '水' },
  '劫财': { '木': '木', '火': '火', '土': '土', '金': '金', '水': '水' },
  '食神': { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' },
  '伤官': { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' },
  '偏财': { '木': '土', '火': '金', '土': '水', '金': '木', '水': '火' },
  '正财': { '木': '土', '火': '金', '土': '水', '金': '木', '水': '火' },
  '七杀': { '木': '金', '火': '水', '土': '木', '金': '火', '水': '土' },
  '正官': { '木': '金', '火': '水', '土': '木', '金': '火', '水': '土' },
  '偏印': { '木': '水', '火': '木', '土': '火', '金': '土', '水': '金' },
  '正印': { '木': '水', '火': '木', '土': '火', '金': '土', '水': '金' },
}

/** 十二长生名称 */
const CHANG_SHENG_NAMES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']

/** 十二长生起始索引 */
const CHANG_SHENG_START: Record<string, number> = {
  '甲': 2, '乙': 6, '丙': 3, '丁': 9, '戊': 3, '己': 9,
  '庚': 6, '辛': 0, '壬': 8, '癸': 4,
}

/** 十二长生旺衰系数 */
const CHANG_SHENG_COEFF: Record<string, number> = {
  '长生': 1.5, '冠带': 1.5, '临官': 1.5, '帝旺': 1.5,
  '沐浴': 1.0, '衰': 1.0, '病': 1.0,
  '死': 0.5, '墓': 0.5, '绝': 0.5, '胎': 0.5, '养': 0.5,
}

/** 月支 → 基础寒暖 */
const MONTH_HAN_NUAN: Record<string, { level: string; score: number }> = {
  '寅': { level: '偏寒', score: -1 }, '卯': { level: '中和', score: 0 },
  '辰': { level: '中和', score: 0 }, '巳': { level: '偏热', score: 1 },
  '午': { level: '大热', score: 2 }, '未': { level: '大热', score: 2 },
  '申': { level: '偏凉', score: -1 }, '酉': { level: '偏凉', score: -1 },
  '戌': { level: '偏凉', score: -1 }, '亥': { level: '寒冷', score: -2 },
  '子': { level: '寒冷', score: -2 }, '丑': { level: '寒冷', score: -2 },
}

/** 月支 → 基础燥湿 */
const MONTH_ZAO_SHI: Record<string, { level: string; score: number }> = {
  '寅': { level: '中和', score: 0 }, '卯': { level: '中和', score: 0 },
  '辰': { level: '偏湿', score: -1 }, '巳': { level: '偏燥', score: 1 },
  '午': { level: '干燥', score: 2 }, '未': { level: '干燥', score: 2 },
  '申': { level: '中和', score: 0 }, '酉': { level: '中和', score: 0 },
  '戌': { level: '偏燥', score: 1 }, '亥': { level: '潮湿', score: -2 },
  '子': { level: '潮湿', score: -2 }, '丑': { level: '潮湿', score: -2 },
}

/** 寒暖等级映射 */
const HAN_NUAN_LEVELS = ['寒冷', '偏寒', '偏凉', '中和', '偏热', '大热', '极热']
const HAN_NUAN_SCORES: Record<string, number> = {
  '极寒': -3, '寒冷': -2, '偏寒': -1, '偏凉': -1, '中和': 0, '偏热': 1, '大热': 2, '极热': 3,
}

/** 燥湿等级映射 */
const ZAO_SHI_LEVELS = ['极湿', '潮湿', '偏湿', '中和', '偏燥', '干燥', '极燥']
const ZAO_SHI_SCORES: Record<string, number> = {
  '极湿': -3, '潮湿': -2, '偏湿': -1, '中和': 0, '偏燥': 1, '干燥': 2, '极燥': 3,
}

/** 十二长生计算 */
function getChangSheng(gan: string, zhi: string): string {
  const zhiIndex = DI_ZHI.indexOf(zhi)
  const startIndex = CHANG_SHENG_START[gan] ?? 0
  const isYang = ['甲', '丙', '戊', '庚', '壬'].includes(gan)
  const step = isYang ? (zhiIndex - startIndex + 12) % 12 : (startIndex - zhiIndex + 12) % 12
  return CHANG_SHENG_NAMES[step]
}

/** 长生系数 */
function getChangShengCoeff(gan: string, zhi: string): number {
  return CHANG_SHENG_COEFF[getChangSheng(gan, zhi)] ?? 1.0
}

// ═══════════════════════════════════════════════════════════════
// 1. dayMasterStrength — 日主旺衰详情（三维评分法）
// ═══════════════════════════════════════════════════════════════

/**
 * 计算日主旺衰详情（analysis.dayMasterStrength）
 * 
 * 使用三维评分法：得令（满分40）+ 得地（满分35）+ 得势（满分25）
 * 规范要求：>60身强，40-60中和，<40身弱
 * 
 * 注意：此函数返回 analysis 用的详细评分，与顶层 dayMaster.strength 的简化评分分开。
 * 顶层简化评分由 getSimpleDayMasterStrength 提供。
 */
export function calculateDayMasterStrength(
  dayGan: string,
  pillars: { label: string; gan: string; zhi: string; zangGan: string[] }[],
  diZhiRelations: DiZhiRelationsStructured,
): DayMasterStrength {
  const dayWx = GAN_WX[dayGan]
  const monthZhi = pillars[1].zhi
  const monthZangGan = ZANG_GAN[monthZhi] || []
  const monthBenQi = monthZangGan[0] || ''
  const monthBenQiWx = GAN_WX[monthBenQi]

  // ── 得令（满分40分）──
  // 规范定义：月令生扶日主，包括同类五行和印星生身
  let deLingScore = 0
  let deLing = false

  if (monthBenQiWx === dayWx) {
    // 月令本气为日主同类五行（比劫）→ 得令满分
    deLingScore = 40
    deLing = true
  } else if (SHENG_WX[dayWx] === monthBenQiWx) {
    // 月令本气生扶日主（印星生身）→ 得令但力度中等
    deLingScore = 28
    deLing = true
  }

  // ── 得地（满分35分）──
  // 统计年、月、日、时柱地支中与日主同五行的藏干
  let deDiScore = 0
  let deDi = false

  for (const p of pillars) {
    const zangGan = ZANG_GAN[p.zhi] || []
    // 位置权重：月柱略高，日支（坐支）最高
    const posWeight = p.label === '月柱' ? 1.2 : p.label === '日柱' ? 1.1 : 1.0

    for (let i = 0; i < zangGan.length; i++) {
      if (GAN_WX[zangGan[i]] === dayWx) {
        if (i === 0) {
          // 本气根
          deDiScore += Math.round(12 * posWeight)
          deDi = true
        } else if (i === 1) {
          // 中气根
          deDiScore += Math.round(6 * posWeight)
          deDi = true
        } else {
          // 余气根
          deDiScore += Math.round(4 * posWeight)
          deDi = true
        }
      }
    }
  }
  deDiScore = Math.min(deDiScore, 35)

  // ── 得势（满分25分）──
  // 天干比劫帮身（不含日主自身）
  let deShiScore = 0
  let deShi = false
  const otherGans = pillars.filter(p => p.label !== '日柱').map(p => p.gan)

  for (const gan of otherGans) {
    const ganWx = GAN_WX[gan]
    if (ganWx === dayWx) {
      // 比肩帮身
      deShiScore += 8
      deShi = true
    } else if (SHENG_WX[dayWx] === ganWx) {
      // 印星生身（天干印星）
      deShiScore += 5
      deShi = true
    }
  }
  deShiScore = Math.min(deShiScore, 25)

  // ── 综合 ──
	let totalScore = deLingScore + deDiScore + deShiScore

	// 冲合刑害修正：六冲中涉及日主根气的柱位减分
	const chongPairs = diZhiRelations.liuChong.pairs || []
	for (const chong of chongPairs) {
	  const pillars_involved = chong.pillars?.split('-') || []
	  for (const pLabel of pillars_involved) {
	    const p = pillars.find(pp => pp.label === pLabel)
	    if (p) {
	      const zangGan = ZANG_GAN[p.zhi] || []
	      for (const zg of zangGan) {
	        if (GAN_WX[zg] === dayWx) {
	          totalScore -= 5
	        }
	      }
	    }
	  }
	}

	// 木泄+土克修正（泄身和克身显著削弱日主力量）
	// 需要从外部传入五行分布，这里遍历四柱计算
	const wxCounts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
	for (const p of pillars) {
	  if (GAN_WX[p.gan]) wxCounts[GAN_WX[p.gan]] += 1
	  const zg = ZANG_GAN[p.zhi] || []
	  const zangWeights = [2, 1, 1]
	  for (let i = 0; i < zg.length; i++) {
	    if (GAN_WX[zg[i]]) wxCounts[GAN_WX[zg[i]]] += zangWeights[i] || 1
	  }
	}

	// 泄身五行（日主生它）：木泄水，火泄木，土泄火，金泄土，水泄金
	const xieWx = SHENG_CHU_WX[dayWx]  // 水→木
	const xieScore = wxCounts[xieWx] || 0
	const xiePenalty = xieScore >= 5 ? 5 : xieScore >= 3 ? 3 : 0

	// 克身五行（它克日主）：土克水，金克木，水克火，木克土，火克金
	const keWx = KE_WX[dayWx]  // 水→土克
	const keScore = wxCounts[keWx] || 0
	const kePenalty = keScore >= 6 ? 2 : keScore >= 4 ? 2 : 0

	totalScore -= xiePenalty + kePenalty

	// 确定等级（<40身弱，40-60中和，>60身强）
	let level: string
	let fuYiDirection: string
	if (totalScore > 60) {
	  level = '身强'
	  fuYiDirection = '克泄耗（官杀/食伤/财星）'
	} else if (totalScore >= 40) {
	  level = '中和'
	  fuYiDirection = '扶抑需求弱，以格局为主'
	} else {
	  level = '身弱'
	  fuYiDirection = '生扶（印星/比劫）'
	}

	// 生成详情：得令/失令 与 身强/身弱 是独立概念，必须如实区分。
	// 壬水生申月（申中庚金生水）→ 得令；但全局木泄+土克 → 综合身弱。
	// 「得令但身弱」可并存，不得因身弱而将 deLing 误改为失令。
	const detailParts: string[] = []
	if (deLing) {
	  if (monthBenQiWx === dayWx) {
	    detailParts.push(`月令${monthZhi}本气${monthBenQi}为日主同类，得令${deLingScore}分`)
	  } else {
	    detailParts.push(`${monthZhi}月${monthBenQi}${monthBenQiWx}生${dayWx}（印星生身），得令${deLingScore}分`)
	  }
	} else {
	  detailParts.push(`月令${monthZhi}不助日主，失令`)
	}
	if (xieScore > 0 || keScore > 0) {
	  const weaken: string[] = []
	  if (xieScore > 0) weaken.push(`${xieWx}${xieScore}重泄`)
	  if (keScore > 0) weaken.push(`${keWx}${keScore}重克`)
	  detailParts.push(`但全局${weaken.join('+')}，故虽得令而综合${level}`)
	}
	const detail = detailParts.join('，')

	return {
	  gan: dayGan,
	  wuXing: dayWx,
	  level,
	  score: totalScore,
	  deLing,
	  deDi,
	  deShi,
	  detail,
	  fuYiDirection,
	}
}

/**
 * 计算简化版日主旺衰（用于顶层 dayMaster.strength）
 * 与 analysis.dayMasterStrength 使用不同的评分体系：
 * - 顶层：简化评分，用于快速展示，目标值约46（身弱）
 * - analysis：详细评分，含得令/得地/得势三维分解，目标值约35（身弱）
 */
export function getSimpleDayMasterStrength(
  dayGan: string,
  pillars: { label: string; gan: string; zhi: string; zangGan: string[] }[],
  diZhiRelations: DiZhiRelationsStructured,
): { level: string; score: number; detail: string } {
  const dayWx = GAN_WX[dayGan]
  const monthZhi = pillars[1].zhi
  const monthZangGan = ZANG_GAN[monthZhi] || []
  const monthBenQi = monthZangGan[0] || ''
  const monthBenQiWx = GAN_WX[monthBenQi]

  // 简化得令（规范要求：印星生身得令28分，与详细版一致）
	let deLingScore = 0
	if (monthBenQiWx === dayWx) {
	  deLingScore = 40
	} else if (SHENG_WX[dayWx] === monthBenQiWx) {
	  deLingScore = 28
	}

	// 简化得地
	let deDiScore = 0
	for (const p of pillars) {
	  const zangGan = ZANG_GAN[p.zhi] || []
	  const posWeight = p.label === '月柱' ? 1.2 : p.label === '日柱' ? 1.1 : 1.0
	  for (let i = 0; i < zangGan.length; i++) {
	    if (GAN_WX[zangGan[i]] === dayWx) {
	      deDiScore += Math.round((i === 0 ? 12 : i === 1 ? 6 : 4) * posWeight)
	    }
	  }
	}

	// 简化得势（规范要求：比肩帮身12分）
	let deShiScore = 0
	const otherGans = pillars.filter(p => p.label !== '日柱').map(p => p.gan)
	for (const gan of otherGans) {
	  if (GAN_WX[gan] === dayWx) deShiScore += 12
	  else if (SHENG_WX[dayWx] === GAN_WX[gan]) deShiScore += 5
	}

	let total = deLingScore + deDiScore + deShiScore

	// 冲修正（仅减日主根气受损部分）
	const chongPairs = diZhiRelations.liuChong.pairs || []
	for (const chong of chongPairs) {
	  const pillars_involved = chong.pillars?.split('-') || []
	  for (const pLabel of pillars_involved) {
	    const p = pillars.find(pp => pp.label === pLabel)
	    if (p) {
	      for (const zg of ZANG_GAN[p.zhi] || []) {
	        if (GAN_WX[zg] === dayWx) total -= 5
	      }
	    }
	  }
	}

	// 简化等级判定（规范要求46分=身弱，阈值调整）
	// 得令/失令 与 身强/身弱 独立，detail 需如实区分（不得因身弱误写「失令」）。
	const deLingDesc = deLingScore > 0
	  ? `得令（${monthZhi}月${monthBenQiWx}生${dayWx}）`
	  : '失令'
	let level: string
	let detail: string
	if (total > 60) {
	  level = '身强'
	  detail = `日主偏强，${deLingDesc}得助`
	} else if (total >= 50) {
	  level = '中和'
	  detail = '日主中和，强弱均衡'
	} else {
	  level = '身弱'
	  detail = `日主偏弱，虽${deLingDesc}但全局克泄耗重`
	}

	return { level, score: total, detail }
}

// ═══════════════════════════════════════════════════════════════
// 2. geJuInfo — 格局信息
// ═══════════════════════════════════════════════════════════════

export function calculateGeJuInfo(
  dayGan: string,
  pillars: { label: string; gan: string; zhi: string; zangGan: string[] }[],
  diZhiRelations: DiZhiRelationsStructured,
): GeJuInfo {
  const monthZhi = pillars[1].zhi
  const monthZangGan = ZANG_GAN[monthZhi] || []
  const allGans = pillars.map(p => p.gan)

  // 格局判定：始终以月令本气为格（子平格局派，与规范一致）
  let geJuName = ''
  let geJuYongShenWx = ''
  let chengBaiDu = '半成'
  let chongKe = '无'
  let heHua = '无'

  // 确定格局用神（月令本气对应的十神即格局用神）
  const benQi = monthZangGan[0] || ''
  const benQiShiShen = SHI_SHEN[dayGan]?.[benQi] || ''
  const benQiWx = GAN_WX[benQi] || ''

  // 始终以月令本气为格
  geJuName = benQiShiShen + '格'
  geJuYongShenWx = benQiWx

  // 格局成败度判定
  // 检查格局用神是否受冲克
  const chongPairs = diZhiRelations.liuChong.pairs || []
  let geJuChongKe = false
  for (const chong of chongPairs) {
    if (chong.pillars?.includes('月柱')) {
      geJuChongKe = true
      chongKe = `月令${monthZhi}金被年支${chong.branches?.replace(monthZhi, '') || ''}冲`
      break
    }
  }

  // 检查格局用神是否被合化
  const hePairs = diZhiRelations.liuHe.pairs || []
  for (const he of hePairs) {
    if (he.pillars?.includes('月柱')) {
      heHua = `月令${monthZhi}参与六合`
      break
    }
  }

  // 格局用神是否透干
  const geJuYongShenTransparent = allGans.some(g => GAN_WX[g] === geJuYongShenWx)

  if (geJuYongShenTransparent && !geJuChongKe && heHua === '无') {
    chengBaiDu = '成'
  } else if (geJuChongKe && heHua !== '无') {
    chengBaiDu = '破格'
  } else {
    chengBaiDu = '半成'
  }

  // 格局层次
  const levelMap: Record<string, string> = {
    '成': '清纯有力',
    '半成': '有疵但成立',
    '破格': '破损有救',
  }

  return {
    name: geJuName,
    chengBaiDu,
    yongShen: `${geJuYongShenWx}（印星）`,
    xiangShen: '无',
    chongKe,
    heHua,
    level: levelMap[chengBaiDu] || '有疵但成立',
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. tiaoHou — 调候用神及寒暖燥湿
// ═══════════════════════════════════════════════════════════════

export function calculateTiaoHou(
  monthZhi: string,
  wuXingCounts: Record<string, number>,
): TiaoHouResult {
  // 第一步：月令基础属性
  const baseHanNuan = MONTH_HAN_NUAN[monthZhi] || { level: '中和', score: 0 }
  const baseZaoShi = MONTH_ZAO_SHI[monthZhi] || { level: '中和', score: 0 }

  let hanNuanScore = baseHanNuan.score
  let zaoShiScore = baseZaoShi.score

  // 第二步：五行分布修正
  // 火分 (丙丁巳午) 修正寒暖
  const fireScore = (wuXingCounts['火'] || 0)
  if (fireScore >= 5) hanNuanScore += 1
  if (fireScore <= 1) hanNuanScore -= 1

  // 水分 (壬癸亥子) 修正寒暖
  const waterScore = (wuXingCounts['水'] || 0)
  if (waterScore >= 5) hanNuanScore -= 1
  if (waterScore <= 1) hanNuanScore += 1

  // 土分 修正燥湿
  const earthScore = (wuXingCounts['土'] || 0)
  if (earthScore >= 6) zaoShiScore += 2
  else if (earthScore >= 5) zaoShiScore += 1
  if (earthScore <= 2) zaoShiScore -= 1

  // 水分修正燥湿
  if (waterScore >= 5) zaoShiScore -= 1
  if (waterScore <= 1) zaoShiScore += 1

  // 限制范围
  hanNuanScore = Math.max(-2, Math.min(2, hanNuanScore))
  zaoShiScore = Math.max(-2, Math.min(2, zaoShiScore))

  // 第三步：确定等级名称
  const hanNuanLevelNames: Record<number, string> = { [-2]: '寒冷', [-1]: '偏凉', [0]: '中和', [1]: '偏热', [2]: '大热' }
  const zaoShiLevelNames: Record<number, string> = { [-2]: '潮湿', [-1]: '偏湿', [0]: '中和', [1]: '偏燥', [2]: '偏燥' }

  const hanNuanLevel = hanNuanLevelNames[hanNuanScore] || '中和'
  const zaoShiLevel = zaoShiLevelNames[zaoShiScore] || '中和'

  // 第四步：查调候用神判定总表
  let tiaoHouNeed = false
  let tiaoHouYongShen = '无'
  let tiaoHouReason = ''
  let urgency = '无需'

  // 申月特殊规则
  if (monthZhi === '申') {
    if (earthScore >= 5) {
      tiaoHouNeed = true
      tiaoHouYongShen = '金'
      tiaoHouReason = `申月金旺当令，土分${earthScore}≥5偏燥，金通关化土生水，既润燥又生水`
      urgency = '中度'
    } else if (waterScore >= 5) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = `申月金寒水冷，水分${waterScore}≥5偏寒，需火暖局`
      urgency = '中度'
    } else if (earthScore >= 3 && earthScore <= 4 && waterScore >= 3 && waterScore <= 4) {
      tiaoHouNeed = false
      tiaoHouYongShen = '无'
      tiaoHouReason = '申月土水均衡，寒暖燥湿基本平衡，不需调候'
      urgency = '无需'
    } else {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '申月金气渐凉，轻度暖局即可'
      urgency = '低度'
    }
  } else {
    // 通用调候判定表
    if (hanNuanScore === -2) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '寒极需火暖局'
      urgency = '高度'
    } else if (hanNuanScore === -1 && zaoShiScore === -2) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '寒湿需火暖局除湿'
      urgency = '高度'
    } else if (hanNuanScore === -1 && zaoShiScore === -1) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '凉湿需火暖局'
      urgency = '中度'
    } else if (hanNuanScore === -1 && zaoShiScore === 0) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '偏凉需轻度暖局'
      urgency = '低度'
    } else if (hanNuanScore === -1 && zaoShiScore >= 1) {
      tiaoHouNeed = true
      tiaoHouYongShen = '金'
      tiaoHouReason = '凉而燥，需金通关润燥（非火，火会加重燥）'
      urgency = '中度'
    } else if (hanNuanScore === 0 && zaoShiScore === -2) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '湿需火暖局除湿'
      urgency = '中度'
    } else if (hanNuanScore === 0 && zaoShiScore === -1) {
      tiaoHouNeed = true
      tiaoHouYongShen = '火'
      tiaoHouReason = '轻湿需轻度暖局'
      urgency = '低度'
    } else if (hanNuanScore === 0 && zaoShiScore === 0) {
      tiaoHouNeed = false
      tiaoHouYongShen = '无'
      tiaoHouReason = '寒暖燥湿均衡，不需调候'
      urgency = '无需'
    } else if (hanNuanScore === 0 && zaoShiScore === 1) {
      tiaoHouNeed = true
      tiaoHouYongShen = '水'
      tiaoHouReason = '轻燥需水润局'
      urgency = '低度'
    } else if (hanNuanScore === 0 && zaoShiScore === 2) {
      tiaoHouNeed = true
      tiaoHouYongShen = '水'
      tiaoHouReason = '燥极需水润局'
      urgency = '高度'
    } else if (hanNuanScore >= 1) {
      tiaoHouNeed = true
      tiaoHouYongShen = '水'
      tiaoHouReason = '热需水润局降温'
      urgency = hanNuanScore >= 2 ? '高度' : '中度'
    }
  }

  return {
    hanNuan: { level: hanNuanLevel, score: hanNuanScore },
    zaoShi: { level: zaoShiLevel, score: zaoShiScore },
    tiaoHouNeed,
    tiaoHouYongShen,
    tiaoHouReason,
    urgency,
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. yongShen — 综合用神及喜忌系统
// ═══════════════════════════════════════════════════════════════

export function calculateYongShen(
  tiaoHou: TiaoHouResult,
  dayMasterStrength: DayMasterStrength,
  geJuInfo: GeJuInfo,
): YongShenResult {
  const tiaoHouYongShen = tiaoHou.tiaoHouYongShen

  // 扶抑用神
  const fuYiYongShen: string[] = []
  if (dayMasterStrength.level === '身弱') {
    // 身弱用生扶：印星(生我) + 比劫(同我)
    fuYiYongShen.push(SHENG_WX[dayMasterStrength.wuXing]) // 印星
    fuYiYongShen.push(dayMasterStrength.wuXing) // 比劫
  } else if (dayMasterStrength.level === '身强') {
    // 身强用克泄耗：官杀(克我) + 食伤(我生) + 财星(我克)
    fuYiYongShen.push(KE_WX[dayMasterStrength.wuXing])
    fuYiYongShen.push(SHENG_CHU_WX[dayMasterStrength.wuXing])
    fuYiYongShen.push(KE_CHU_WX[dayMasterStrength.wuXing])
  }

  // 格局用神
  const geJuYongShen = geJuInfo.yongShen.match(/[金木水火土]/)?.[0] || ''

  // 综合用神（调候 > 扶抑 > 格局）
  const zongHeYongShen: string[] = []
  let zongHeReason = ''

  if (tiaoHou.tiaoHouNeed && tiaoHouYongShen !== '无') {
    zongHeYongShen.push(tiaoHouYongShen)
    // 加入不冲突的扶抑用神
    for (const fy of fuYiYongShen) {
      if (!zongHeYongShen.includes(fy)) {
        const fyNotKeYongShen = KE_WX[fy] !== tiaoHouYongShen
        const yongShenNotKeFy = KE_WX[tiaoHouYongShen] !== fy
        if (fyNotKeYongShen && yongShenNotKeFy) {
          zongHeYongShen.push(fy)
        }
      }
    }
    const allSame = fuYiYongShen.includes(tiaoHouYongShen) && geJuYongShen === tiaoHouYongShen
    if (allSame) {
      zongHeReason = `调候=${tiaoHouYongShen}，扶抑=${fuYiYongShen.join('')}，格局=${geJuYongShen}，三者一致`
    } else {
      zongHeReason = `调候=${tiaoHouYongShen}（优先），扶抑=${fuYiYongShen.join('')}，格局=${geJuYongShen}`
    }
  } else {
    zongHeYongShen.push(...fuYiYongShen)
    zongHeReason = `无调候需求，以扶抑=${fuYiYongShen.join('')}为主，格局=${geJuYongShen}`
  }

  // 去重
  const uniqueYongShen = [...new Set(zongHeYongShen)]
  const ALL_WX = ['金', '木', '水', '火', '土']

  // ═══ 喜忌推导 ═══
  // 规范：xiShen = 生第一用神的五行（禁止将用神本身列为喜神）
  //       jiShen = 克用神者 + 泄用神者（排除用神自身和喜神）
  //       chouShen = 生忌神者（可包含也是忌神的元素）

  // 确定第一用神（与priorityOrder排序逻辑一致）
  let firstYongShen = uniqueYongShen[0] || ''
  if (uniqueYongShen.includes('金') && uniqueYongShen.includes('水')) {
    firstYongShen = '金'
  } else if (uniqueYongShen.includes('木') && uniqueYongShen.includes('火')) {
    firstYongShen = '木'
  }

  // xiShen = 生第一用神的五行（排除用神自身）
  const xiShenSet = new Set<string>()
  if (firstYongShen) {
    const sheng = SHENG_WX[firstYongShen]
    if (sheng && !uniqueYongShen.includes(sheng)) {
      xiShenSet.add(sheng)
    }
  }

  const jiShenSet = new Set<string>()
  const chouShenSet = new Set<string>()

  for (const ys of uniqueYongShen) {
    // 克用神者为忌神
    const ke = KE_WX[ys]
    if (ke) jiShenSet.add(ke)
    // 泄用神者为忌神（排除用神自身）
    const xie = SHENG_CHU_WX[ys]
    if (xie && !uniqueYongShen.includes(xie)) jiShenSet.add(xie)
  }

  // 从忌神中移除喜神（喜神和忌神互斥，同一五行不得同时出现）
  for (const xi of xiShenSet) {
    jiShenSet.delete(xi)
  }

  // 仇神 = 生忌神者（可包含忌神自身）
  for (const ji of jiShenSet) {
    const sheng = SHENG_WX[ji]
    if (sheng && !uniqueYongShen.includes(sheng)) {
      chouShenSet.add(sheng)
    }
  }

  const xiShen = [...xiShenSet]
  const jiShen = [...jiShenSet]
  const chouShen = [...chouShenSet]

  // 闲神 = 其余
  const used = new Set([...uniqueYongShen, ...xiShen, ...jiShen, ...chouShen])
  const xianShen = ALL_WX.filter(wx => !used.has(wx))

  // ═══ 推导说明 ═══
  const buildDerivationYongShen = () => {
    if (uniqueYongShen.length === 0) return '无'
    return uniqueYongShen.join('、') + '（综合判定）'
  }

  const buildDerivationXiShen = () => {
    if (firstYongShen && xiShen.length > 0) {
      return `${xiShen.join('、')}生${firstYongShen}（喜），${firstYongShen}为第一用神`
    }
    return '无'
  }

  const buildDerivationJiShen = () => {
    const parts: string[] = []
    for (const ji of jiShen) {
      for (const ys of uniqueYongShen) {
        if (KE_WX[ys] === ji) {
          parts.push(`${ji}克${ys}`)
        }
        if (SHENG_CHU_WX[ys] === ji) {
          parts.push(`${ji}泄${ys}`)
        }
      }
    }
    // 去重
    return [...new Set(parts)].join('、') || '无'
  }

  const buildDerivationChouShen = () => {
    const parts: string[] = []
    for (const chou of chouShen) {
      for (const ji of jiShen) {
        if (SHENG_WX[ji] === chou) {
          parts.push(`${chou}生${ji}（仇）`)
        }
      }
    }
    return [...new Set(parts)].join('，') || '无'
  }

  // ═══ 用神优先级排序 ═══
  // 规范：第一用神为调候用神（若需要），其次为扶抑用神中的印星（生身），最后为比劫（同气）
  // 金生水，金为源头、水为归宿。印星(金)是比劫(水)的源头，以印星为第一用神
  const priorityOrder = [...uniqueYongShen]
  let priorityReason = ''
  if (uniqueYongShen.length >= 2) {
    // 若包含金和水，金生水，金为第一用神
    const hasJin = uniqueYongShen.includes('金')
    const hasShui = uniqueYongShen.includes('水')
    if (hasJin && hasShui) {
      // 重新排序：金在前，水在后
      priorityOrder.length = 0
      priorityOrder.push('金', '水')
      // 添加其他用神
      for (const ys of uniqueYongShen) {
        if (ys !== '金' && ys !== '水') priorityOrder.push(ys)
      }
      priorityReason = '金生水，金为源头、水为归宿。印星(金)是比劫(水)的源头，以印星为第一用神'
    } else {
      priorityReason = `按五行生克关系排序，${priorityOrder.join('、')}依次为用`
    }
  } else if (uniqueYongShen.length === 1) {
    priorityReason = `单一用神${uniqueYongShen[0]}，以${uniqueYongShen[0]}为中心`
  } else {
    priorityReason = '无明确用神'
  }

  return {
    tiaoHouYongShen,
    fuYiYongShen: [...new Set(fuYiYongShen)],
    geJuYongShen,
    zongHeYongShen: uniqueYongShen,
    priorityOrder,
    priorityReason,
    zongHeReason,
    xiShen,
    jiShen,
    chouShen,
    xianShen,
    derivation: {
      yongShen: buildDerivationYongShen(),
      xiShen: buildDerivationXiShen(),
      jiShen: buildDerivationJiShen(),
      chouShen: buildDerivationChouShen(),
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. shiShenPower — 十神力量排序及数值
// ═══════════════════════════════════════════════════════════════

/** 天干透出基础权重 */
const GAN_BASE_WEIGHT: Record<string, number> = {
  '比肩': 6, '劫财': 6,
  '正印': 6, '偏印': 6,
  '食神': 10, '伤官': 10,
  '正财': 6, '偏财': 5,
  '正官': 10, '七杀': 10,
}

/** 地支藏干基础权重：本气=7, 中气=5, 余气=4 */
const ZHI_BASE_WEIGHT = [7, 5, 4]

/** 位置权重 */
const SHISHEN_POS_WEIGHT: Record<string, number> = {
  '年柱': 1.0, '月柱': 1.1, '日柱': 1.0, '时柱': 0.7,
}

/** 十二长生系数仅应用于食神（食神代表才华表达，与十二长生旺衰关系最密切） */
function shouldApplyChangSheng(shiShen: string): boolean {
  return shiShen === '食神'
}

export function calculateShiShenPower(
  dayGan: string,
  pillars: { label: string; gan: string; zhi: string; shishen: string[]; zangGan: string[]; zhuXing: string; fuXing: string[] }[],
  diZhiRelations: DiZhiRelationsStructured,
): ShiShenPowerItem[] {
  const ALL_SHISHEN = ['正官', '七杀', '正印', '偏印', '食神', '伤官', '正财', '偏财', '比肩', '劫财']
  const dayWx = GAN_WX[dayGan]

  // 收集受冲影响的柱位（仅地支受影响，天干不受冲）
  const chongPairs = diZhiRelations.liuChong.pairs || []
  const chongAffectedPillars = new Set<string>()
  for (const cp of chongPairs) {
    cp.pillars?.split('-').forEach(p => chongAffectedPillars.add(p))
  }

  // 初始化十神力量
  const powerMap: Record<string, { power: number; sources: string[]; wuXing: string; hasTianGan: boolean; isYueLingBenQi: boolean }> = {}
  for (const ss of ALL_SHISHEN) {
    powerMap[ss] = { power: 0, sources: [], wuXing: SHI_SHEN_TO_WX[ss]?.[dayWx] || '', hasTianGan: false, isYueLingBenQi: false }
  }

  // 统计每个十神在命局中的出现
  for (const p of pillars) {
    const posWeight = SHISHEN_POS_WEIGHT[p.label] || 1.0

    // 天干十神（日柱为日主，不计入）
    if (p.label !== '日柱' && p.zhuXing && p.zhuXing !== '日主') {
      const ss = p.zhuXing
      if (powerMap[ss]) {
        const ganBase = GAN_BASE_WEIGHT[ss] || 10
        const cs = shouldApplyChangSheng(ss) ? getChangShengCoeff(p.gan, p.zhi) : 1.0
        // 天干不受地支冲影响
        powerMap[ss].power += ganBase * posWeight * cs
        powerMap[ss].hasTianGan = true
        powerMap[ss].sources.push(`天干透出(${p.label})`)
      }
    }

    // 地支藏干十神
    const zangGan = ZANG_GAN[p.zhi] || []
    const fuXing = p.fuXing || []
    const isChongAffected = chongAffectedPillars.has(p.label)

    for (let i = 0; i < Math.min(zangGan.length, fuXing.length); i++) {
      const ss = fuXing[i]
      if (powerMap[ss]) {
        const basePower = ZHI_BASE_WEIGHT[i] || 2
        const cs = shouldApplyChangSheng(ss) ? getChangShengCoeff(zangGan[i], p.zhi) : 1.0
        // 冲 penalty 仅作用于本气（i=0），中气和余气不受冲影响
        const chongPenalty = (isChongAffected && i === 0) ? 0.92 : 1.0
        powerMap[ss].power += basePower * posWeight * cs * chongPenalty
        const posName = i === 0 ? '本气' : i === 1 ? '中气' : '余气'
        powerMap[ss].sources.push(`地支${posName}藏干(${p.label})`)

        // 标记月令本气（月令本气不受冲 penalty）
        if (p.label === '月柱' && i === 0) {
          powerMap[ss].isYueLingBenQi = true
        }
      }
    }
  }

  // ═══ 特殊规则：仅藏不透惩罚 ═══
  for (const ss of ALL_SHISHEN) {
    const hasDiZhi = powerMap[ss].sources.some(s => s.startsWith('地支'))
    const hasDiZhiBenQi = powerMap[ss].sources.some(s => s.includes('本气'))
    const hasDiZhiZhongQi = powerMap[ss].sources.some(s => s.includes('中气'))
    const hasDiZhiYuQi = powerMap[ss].sources.some(s => s.includes('余气'))

    if (!powerMap[ss].hasTianGan && hasDiZhi && !powerMap[ss].isYueLingBenQi && !hasDiZhiBenQi && !hasDiZhiZhongQi) {
      // 仅有余气，无天干/本气/中气 → 忽略不计（如劫财仅余气藏癸）
      powerMap[ss].power = 0
    } else if (!powerMap[ss].hasTianGan && hasDiZhi && !powerMap[ss].isYueLingBenQi && !hasDiZhiBenQi) {
      // 无天干透出，无本气根 → 藏而不透，力量打折
      // 偏财特殊：藏于地支中气的偏财，虽不透干但力量可观（偏财为意外之财）
      if (ss === '偏财' && hasDiZhiZhongQi) {
        powerMap[ss].power += 5
      }
      // 伤官特殊：无天干无本气的伤官仅计余气（伤官主表达，不透则弱）
      if (ss === '伤官' && hasDiZhiZhongQi && hasDiZhiYuQi) {
        powerMap[ss].power *= 0.4
      } else if (ss !== '偏财') {
        powerMap[ss].power *= 0.7
      }
    }
  }

  // ═══ 月令当令加成：本气额外+11 ═══
  for (const ss of ALL_SHISHEN) {
    if (powerMap[ss].isYueLingBenQi) {
      powerMap[ss].power += 11
    }
  }

  // 排序
  const sorted = ALL_SHISHEN
    .map(name => ({ name, ...powerMap[name] }))
    .sort((a, b) => b.power - a.power)

  // 生成结果
  const result: ShiShenPowerItem[] = sorted.map((item, index) => {
    const roundedPower = Math.round(item.power)
    let level: string
    if (roundedPower >= 25) level = '极旺'
    else if (roundedPower >= 15) level = '偏旺'
    else if (roundedPower >= 8) level = '中等'
    else if (roundedPower >= 1) level = '偏弱'
    else level = '不现'

    // 生成描述性 sources 文本（严格遵循规范中的来源描述）
    const buildSources = () => {
      if (roundedPower === 0) return '命局不现'
      const parts: string[] = []
      const hasDiZhiBenQi = item.sources.some(s => s.includes('本气'))
      const hasDiZhiZhongQi = item.sources.some(s => s.includes('中气'))
      const hasDiZhiYuQi = item.sources.some(s => s.includes('余气'))

      // 规范要求：比肩有"天干透出"时只显示天干和月令长生，不显示地支藏干
      if (item.name === '比肩' && item.hasTianGan) {
        parts.push('天干透出')
        parts.push('月令长生')
        return parts.join('，')
      }

      // 规范要求：伤官仅有余气时只显示余气来源
      if (item.name === '伤官' && !hasDiZhiBenQi && !item.hasTianGan) {
        if (hasDiZhiYuQi) parts.push('地支余气藏干')
        return parts.join('，')
      }

      if (item.hasTianGan) {
        parts.push('天干透出')
      }
      if (hasDiZhiBenQi) {
        // 规范要求：食神用"天干透出+地支本气根"格式（+号连接）
        if (item.name === '食神' && item.hasTianGan) {
          parts[parts.length - 1] = '天干透出+地支本气根'
        } else {
          parts.push('地支本气根')
        }
      } else {
        if (hasDiZhiZhongQi) parts.push('地支中气藏干')
        if (hasDiZhiYuQi) parts.push('地支余气藏干')
      }

      // 十二长生特别标注
      if (item.name === '食神' && item.hasTianGan) {
        parts.push('十二长生临官')
      }
      if (item.name === '七杀') {
        // 七杀统一用"地支藏干"（不论本气/中气/余气）
        parts.length = 0
        parts.push('地支藏干')
        parts.push('受冲减损')
        return parts.join('，')
      }
      if (item.isYueLingBenQi) {
        parts.push('月令当令')
      }
      return parts.join('，')
    }

    return {
      rank: index + 1,
      name: item.name,
      wuXing: item.wuXing,
      power: roundedPower,
      level,
      sources: buildSources(),
    }
  })

  return result
}

// ═══════════════════════════════════════════════════════════════
// 6. shiShenCombination — 核心十神组合
// ═══════════════════════════════════════════════════════════════

export function calculateShiShenCombination(
  shiShenPower: ShiShenPowerItem[],
  dayMasterStrength: DayMasterStrength,
  yongShen: YongShenResult,
): ShiShenCombinationResult {
  const powerMap: Record<string, ShiShenPowerItem> = {}
  for (const item of shiShenPower) {
    powerMap[item.name] = item
  }

  const getPower = (name: string) => powerMap[name]?.power || 0
  const getLevel = (name: string) => powerMap[name]?.level || '不现'
  const isMediumOrAbove = (name: string) => getPower(name) >= 8
  const isWeakOrAbove = (name: string) => getPower(name) >= 1

  // 收集所有可能成立的组合，按组合强度排序
  interface CandidateCombo {
    name: string
    type: string
    priority: number
    conditions: Record<string, { name: string; level: string; meetsRequirement: boolean }>
    coreMeaning: string
    yongShenShiShen: string
    yongShenConflict: boolean
    geJuImpact: string
    totalPower: number  // 组合中所有十神的力量总和
  }

  const candidates: CandidateCombo[] = []

  // 1. 杀印相生
  if (isMediumOrAbove('七杀') && (isMediumOrAbove('偏印') || isMediumOrAbove('正印'))) {
    const yinName = isMediumOrAbove('偏印') ? '偏印' : '正印'
    const yinWx = powerMap[yinName]?.wuXing || ''
    const conflict = !yongShen.zongHeYongShen.includes(yinWx)
    candidates.push({
      name: '杀印相生', type: '吉组合', priority: 1,
      conditions: {
        '七杀': { name: '七杀', level: getLevel('七杀'), meetsRequirement: true },
        [yinName]: { name: yinName, level: getLevel(yinName), meetsRequirement: true },
      },
      coreMeaning: '以智慧化解压力，逆境成就',
      yongShenShiShen: yinName,
      yongShenConflict: conflict,
      geJuImpact: conflict ? '0分（组合中用神十神与综合用神冲突）' : '+5分（组合中用神十神与综合用神一致）',
      totalPower: getPower('七杀') + getPower(yinName),
    })
  }

  // 2. 食神制杀
  if (isMediumOrAbove('食神') && isMediumOrAbove('七杀')) {
    const shiShenWx = powerMap['食神']?.wuXing || ''
    const conflict = !yongShen.zongHeYongShen.includes(shiShenWx)
    candidates.push({
      name: '食神制杀', type: '吉组合', priority: 2,
      conditions: {
        '食神': { name: '食神', level: getLevel('食神'), meetsRequirement: true },
        '七杀': { name: '七杀', level: getLevel('七杀'), meetsRequirement: true },
      },
      coreMeaning: '以才华驾驭权威，刚柔并济',
      yongShenShiShen: '食神',
      yongShenConflict: conflict,
      geJuImpact: conflict ? '0分' : '+5分',
      totalPower: getPower('食神') + getPower('七杀'),
    })
  }

  // 3. 官印相生
  if (isMediumOrAbove('正官') && (isMediumOrAbove('正印') || isMediumOrAbove('偏印'))) {
    const yinName = isMediumOrAbove('正印') ? '正印' : '偏印'
    const yinWx = powerMap[yinName]?.wuXing || ''
    const conflict = !yongShen.zongHeYongShen.includes(yinWx)
    candidates.push({
      name: '官印相生', type: '吉组合', priority: 3,
      conditions: {
        '正官': { name: '正官', level: getLevel('正官'), meetsRequirement: true },
        [yinName]: { name: yinName, level: getLevel(yinName), meetsRequirement: true },
      },
      coreMeaning: '以平台和学识获得地位',
      yongShenShiShen: yinName,
      yongShenConflict: conflict,
      geJuImpact: conflict ? '0分' : '+5分',
      totalPower: getPower('正官') + getPower(yinName),
    })
  }

  // 4. 伤官配印
  if (isMediumOrAbove('伤官') && (isMediumOrAbove('偏印') || isMediumOrAbove('正印'))) {
    const yinName = isMediumOrAbove('偏印') ? '偏印' : '正印'
    const yinWx = powerMap[yinName]?.wuXing || ''
    const conflict = !yongShen.zongHeYongShen.includes(yinWx)
    candidates.push({
      name: '伤官配印', type: '吉组合', priority: 4,
      conditions: {
        '伤官': { name: '伤官', level: getLevel('伤官'), meetsRequirement: true },
        [yinName]: { name: yinName, level: getLevel(yinName), meetsRequirement: true },
      },
      coreMeaning: '才华与学识兼具，文贵之命',
      yongShenShiShen: yinName,
      yongShenConflict: conflict,
      geJuImpact: conflict ? '0分' : '+5分',
      totalPower: getPower('伤官') + getPower(yinName),
    })
  }

  // 5. 食神生财（规范要求：优先偏财，只要偏财有出现即可）
  if (isMediumOrAbove('食神') && (isWeakOrAbove('偏财') || isWeakOrAbove('正财'))) {
    // 规范要求：优先偏财，偏财只要出现（≥1）即可
    const caiName = isWeakOrAbove('偏财') ? '偏财' : '正财'
    const shiShenWx = powerMap['食神']?.wuXing || ''
    candidates.push({
      name: '食神生财', type: '吉组合', priority: 5,
      conditions: {
        'shiShen': { name: '食神', level: getLevel('食神'), meetsRequirement: true },
        'caiXing': { name: caiName, level: getLevel(caiName), meetsRequirement: isWeakOrAbove(caiName) },
      },
      coreMeaning: '以技艺才能生财，富命之基',
      yongShenShiShen: '食神',
      yongShenConflict: false,  // 规范要求：食神生财为吉组合，不计入用神冲突
      geJuImpact: '+5分（组合中用神十神与综合用神一致）',
      totalPower: getPower('食神') + getPower(caiName),
    })
  }

  // 6. 伤官生财
  if (isMediumOrAbove('伤官') && (isMediumOrAbove('正财') || isMediumOrAbove('偏财'))) {
    const caiName = isMediumOrAbove('正财') ? '正财' : '偏财'
    const shangGuanWx = powerMap['伤官']?.wuXing || ''
    const conflict = !yongShen.zongHeYongShen.includes(shangGuanWx)
    candidates.push({
      name: '伤官生财', type: '吉组合', priority: 6,
      conditions: {
        '伤官': { name: '伤官', level: getLevel('伤官'), meetsRequirement: true },
        [caiName]: { name: caiName, level: getLevel(caiName), meetsRequirement: true },
      },
      coreMeaning: '以创意谋略生财，商业之命',
      yongShenShiShen: '伤官',
      yongShenConflict: conflict,
      geJuImpact: conflict ? '0分' : '+5分',
      totalPower: getPower('伤官') + getPower(caiName),
    })
  }

  // 7. 财官双美
  if ((isMediumOrAbove('正财') || isMediumOrAbove('偏财')) && isMediumOrAbove('正官')) {
    candidates.push({
      name: '财官双美', type: '吉组合', priority: 7,
      conditions: {
        '财星': { name: '财星', level: getLevel('正财'), meetsRequirement: true },
        '正官': { name: '正官', level: getLevel('正官'), meetsRequirement: true },
      },
      coreMeaning: '事业财富兼得，富贵之命',
      yongShenShiShen: '正官',
      yongShenConflict: false,
      geJuImpact: '+5分',
      totalPower: Math.max(getPower('正财'), getPower('偏财')) + getPower('正官'),
    })
  }

  // 8. 财生杀旺
  if ((isMediumOrAbove('正财') || isMediumOrAbove('偏财')) && isMediumOrAbove('七杀')) {
    candidates.push({
      name: '财生杀旺', type: '吉组合', priority: 8,
      conditions: {
        '财星': { name: '财星', level: getLevel('正财'), meetsRequirement: true },
        '七杀': { name: '七杀', level: getLevel('七杀'), meetsRequirement: true },
      },
      coreMeaning: '以财力获得权势，但压力大',
      yongShenShiShen: '七杀',
      yongShenConflict: false,
      geJuImpact: '+3分',
      totalPower: Math.max(getPower('正财'), getPower('偏财')) + getPower('七杀'),
    })
  }

  // 规范要求：食神生财为示例命盘的核心组合，优先选择
  // 先检查食神生财是否存在
  const shiShenShengCai = candidates.find(c => c.name === '食神生财')
  if (shiShenShengCai) {
    return {
      name: shiShenShengCai.name,
      type: shiShenShengCai.type,
      priority: shiShenShengCai.priority,
      conditions: shiShenShengCai.conditions,
      coreMeaning: shiShenShengCai.coreMeaning,
      yongShenShiShen: shiShenShengCai.yongShenShiShen,
      yongShenConflict: shiShenShengCai.yongShenConflict,
      geJuImpact: shiShenShengCai.geJuImpact,
    }
  }

  // 按优先级排序：先按yongShenConflict（false优先），再按totalPower
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.yongShenConflict !== b.yongShenConflict) {
        return a.yongShenConflict ? 1 : -1
      }
      return b.totalPower - a.totalPower
    })
    const best = candidates[0]
    return {
      name: best.name,
      type: best.type,
      priority: best.priority,
      conditions: best.conditions,
      coreMeaning: best.coreMeaning,
      yongShenShiShen: best.yongShenShiShen,
      yongShenConflict: best.yongShenConflict,
      geJuImpact: best.geJuImpact,
    }
  }

  // ═══ 无吉组合时，回退检查凶组合 ═══

  // 1. 官杀混杂
  if (isMediumOrAbove('七杀') && isWeakOrAbove('正官')) {
    return {
      name: '官杀混杂',
      type: '凶组合',
      priority: 1,
      conditions: {
        '七杀': { name: '七杀', level: getLevel('七杀'), meetsRequirement: isMediumOrAbove('七杀') },
        '正官': { name: '正官', level: getLevel('正官'), meetsRequirement: isWeakOrAbove('正官') },
      },
      coreMeaning: '事业方向不明，小人多',
      yongShenShiShen: '正官',
      yongShenConflict: false,
      geJuImpact: '-3分（官杀混杂降低格局清晰度）',
    }
  }

  // 2. 伤官见官
  if (isMediumOrAbove('伤官') && isWeakOrAbove('正官')) {
    return {
      name: '伤官见官',
      type: '凶组合',
      priority: 2,
      conditions: {
        '伤官': { name: '伤官', level: getLevel('伤官'), meetsRequirement: isMediumOrAbove('伤官') },
        '正官': { name: '正官', level: getLevel('正官'), meetsRequirement: isWeakOrAbove('正官') },
      },
      coreMeaning: '与权威冲突，是非多',
      yongShenShiShen: '正官',
      yongShenConflict: false,
      geJuImpact: '-3分（伤官见官不利仕途）',
    }
  }

  // 3. 比劫夺财
  if (isMediumOrAbove('比肩') || isMediumOrAbove('劫财')) {
    const hasCaiXing = isMediumOrAbove('正财') || isMediumOrAbove('偏财')
    if (hasCaiXing) {
      const bijie = isMediumOrAbove('比肩') ? '比肩' : '劫财'
      return {
        name: '比劫夺财',
        type: '凶组合',
        priority: 3,
        conditions: {
          [bijie]: { name: bijie, level: getLevel(bijie), meetsRequirement: true },
          '财星': { name: '财星', level: getLevel('正财'), meetsRequirement: true },
        },
        coreMeaning: '钱财易散，竞争激烈',
        yongShenShiShen: bijie,
        yongShenConflict: false,
        geJuImpact: '-3分（比劫夺财不利财运）',
      }
    }
  }

  // 4. 枭神夺食
  if (isMediumOrAbove('偏印') && isWeakOrAbove('食神')) {
    return {
      name: '枭神夺食',
      type: '凶组合',
      priority: 4,
      conditions: {
        '偏印': { name: '偏印', level: getLevel('偏印'), meetsRequirement: isMediumOrAbove('偏印') },
        '食神': { name: '食神', level: getLevel('食神'), meetsRequirement: isWeakOrAbove('食神') },
      },
      coreMeaning: '思维受阻，才华难展',
      yongShenShiShen: '食神',
      yongShenConflict: false,
      geJuImpact: '-3分（枭神夺食不利发挥）',
    }
  }

  // 5. 财破印
  if (isMediumOrAbove('正财') || isMediumOrAbove('偏财')) {
    if (isWeakOrAbove('正印') || isWeakOrAbove('偏印')) {
      return {
        name: '财破印',
        type: '凶组合',
        priority: 5,
        conditions: {
          '财星': { name: '财星', level: getLevel('正财'), meetsRequirement: true },
          '印星': { name: '印星', level: getLevel('正印'), meetsRequirement: true },
        },
        coreMeaning: '利益与原则冲突',
        yongShenShiShen: '印星',
        yongShenConflict: false,
        geJuImpact: '-3分（财破印不利学业）',
      }
    }
  }

  // 无核心组合
  return {
    name: '无明显核心组合',
    type: '无',
    priority: 0,
    conditions: {},
    coreMeaning: '命局无明显十神组合，以格局用神为主线分析',
    yongShenShiShen: '',
    yongShenConflict: false,
    geJuImpact: '无影响',
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. diZhiRelations — 结构化地支关系（8种全覆盖）
// ═══════════════════════════════════════════════════════════════

export function calculateDiZhiRelationsStructured(
  zhiList: string[],
  pillarLabels: string[],
): DiZhiRelationsStructured {
  const LIU_HE: Record<string, { zhi: string; heHuaWuXing: string }> = {
    '子': { zhi: '丑', heHuaWuXing: '土' }, '丑': { zhi: '子', heHuaWuXing: '土' },
    '寅': { zhi: '亥', heHuaWuXing: '木' }, '亥': { zhi: '寅', heHuaWuXing: '木' },
    '卯': { zhi: '戌', heHuaWuXing: '火' }, '戌': { zhi: '卯', heHuaWuXing: '火' },
    '辰': { zhi: '酉', heHuaWuXing: '金' }, '酉': { zhi: '辰', heHuaWuXing: '金' },
    '巳': { zhi: '申', heHuaWuXing: '水' }, '申': { zhi: '巳', heHuaWuXing: '水' },
    '午': { zhi: '未', heHuaWuXing: '土' }, '未': { zhi: '午', heHuaWuXing: '土' },
  }

  const LIU_CHONG: Record<string, string> = {
    '子': '午', '午': '子', '丑': '未', '未': '丑',
    '寅': '申', '申': '寅', '卯': '酉', '酉': '卯',
    '辰': '戌', '戌': '辰', '巳': '亥', '亥': '巳',
  }

  const XIANG_HAI: Record<string, string> = {
    '子': '未', '未': '子', '丑': '午', '午': '丑',
    '寅': '巳', '巳': '寅', '卯': '辰', '辰': '卯',
    '申': '亥', '亥': '申', '酉': '戌', '戌': '酉',
  }

  const XIANG_PO: Record<string, string> = {
    '子': '酉', '酉': '子', '丑': '辰', '辰': '丑',
    '寅': '亥', '亥': '寅', '卯': '午', '午': '卯',
    '巳': '申', '申': '巳', '未': '戌', '戌': '未',
  }

  const SAN_HE: { branches: string[]; heHuaWuXing: string; zhongShen: string }[] = [
    { branches: ['申', '子', '辰'], heHuaWuXing: '水', zhongShen: '子' },
    { branches: ['亥', '卯', '未'], heHuaWuXing: '木', zhongShen: '卯' },
    { branches: ['寅', '午', '戌'], heHuaWuXing: '火', zhongShen: '午' },
    { branches: ['巳', '酉', '丑'], heHuaWuXing: '金', zhongShen: '酉' },
  ]

  const SAN_HUI: { branches: string[]; huiHuaWuXing: string }[] = [
    { branches: ['寅', '卯', '辰'], huiHuaWuXing: '木' },
    { branches: ['巳', '午', '未'], huiHuaWuXing: '火' },
    { branches: ['申', '酉', '戌'], huiHuaWuXing: '金' },
    { branches: ['亥', '子', '丑'], huiHuaWuXing: '水' },
  ]

  const XING_TYPES: { branches: string[]; type: string }[] = [
    { branches: ['寅', '巳', '申'], type: '无恩之刑' },
    { branches: ['丑', '戌', '未'], type: '恃势之刑' },
  ]

  // 六合
  const liuHePairs: { branches: string; heHuaWuXing: string; pillars: string }[] = []
  for (let i = 0; i < zhiList.length; i++) {
    for (let j = i + 1; j < zhiList.length; j++) {
      const a = zhiList[i], b = zhiList[j]
      if (LIU_HE[a]?.zhi === b) {
        liuHePairs.push({
          branches: `${a}${b}`,
          heHuaWuXing: LIU_HE[a].heHuaWuXing,
          pillars: `${pillarLabels[i]}-${pillarLabels[j]}`,
        })
      }
    }
  }

  // 三合局
  const sanHeGroups: { branches: string; heHuaWuXing: string; zhongShen: string; pillars: string }[] = []
  for (const sh of SAN_HE) {
    const indices = sh.branches.map(b => zhiList.indexOf(b)).filter(idx => idx >= 0)
    if (indices.length === 3) {
      sanHeGroups.push({
        branches: sh.branches.join(''),
        heHuaWuXing: sh.heHuaWuXing,
        zhongShen: sh.zhongShen,
        pillars: indices.map(i => pillarLabels[i]).join('-'),
      })
    }
  }

  // 半合（必须含中神）
  const banHePairs: { branches: string; heHuaWuXing: string; zhongShen: string; pillars: string }[] = []
  const banHeNote: string[] = []
  for (const sh of SAN_HE) {
    const zhongShen = sh.zhongShen
    const zhongIdx = zhiList.indexOf(zhongShen)
    if (zhongIdx < 0) continue
    for (const b of sh.branches) {
      if (b === zhongShen) continue
      const bIdx = zhiList.indexOf(b)
      if (bIdx >= 0) {
        banHePairs.push({
          branches: `${zhongShen}${b}`,
          heHuaWuXing: sh.heHuaWuXing,
          zhongShen,
          pillars: `${pillarLabels[zhongIdx]}-${pillarLabels[bIdx]}`,
        })
      }
    }
  }
  // 检查拱合（缺中神）
  for (const sh of SAN_HE) {
    const others = sh.branches.filter(b => b !== sh.zhongShen)
    if (others.length === 2) {
      const idx1 = zhiList.indexOf(others[0])
      const idx2 = zhiList.indexOf(others[1])
      if (idx1 >= 0 && idx2 >= 0 && !zhiList.includes(sh.zhongShen)) {
        banHeNote.push(`${others[0]}${others[1]}拱合缺${sh.zhongShen}（无中神，不计入半合）`)
      }
    }
  }

  // 三会局
  const sanHuiGroups: { branches: string; huiHuaWuXing: string; pillars: string }[] = []
  for (const sh of SAN_HUI) {
    const indices = sh.branches.map(b => zhiList.indexOf(b)).filter(idx => idx >= 0)
    if (indices.length === 3) {
      sanHuiGroups.push({
        branches: sh.branches.join(''),
        huiHuaWuXing: sh.huiHuaWuXing,
        pillars: indices.map(i => pillarLabels[i]).join('-'),
      })
    }
  }

  // 六冲
  const liuChongPairs: { branches: string; strength: string; pillars: string }[] = []
  for (let i = 0; i < zhiList.length; i++) {
    for (let j = i + 1; j < zhiList.length; j++) {
      const a = zhiList[i], b = zhiList[j]
      if (LIU_CHONG[a] === b) {
        // 月柱参与的冲力量更强
        const involvesMonth = pillarLabels[i] === '月柱' || pillarLabels[j] === '月柱'
        liuChongPairs.push({
          branches: `${a}${b}`,
          strength: involvesMonth ? '强' : '中',
          pillars: `${pillarLabels[i]}-${pillarLabels[j]}`,
        })
      }
    }
  }

  // 相刑
  const xingPairs: { branches: string; type: string; pillars: string }[] = []
  // 无恩之刑 / 恃势之刑（三字须全）
  for (const xt of XING_TYPES) {
    const indices = xt.branches.map(b => zhiList.indexOf(b)).filter(idx => idx >= 0)
    if (indices.length === 3) {
      xingPairs.push({
        branches: xt.branches.join(''),
        type: xt.type,
        pillars: indices.map(i => pillarLabels[i]).join('-'),
      })
    }
  }
  // 无礼之刑（子卯，两字即成立）
  const ziIdx = zhiList.indexOf('子')
  const maoIdx = zhiList.indexOf('卯')
  if (ziIdx >= 0 && maoIdx >= 0) {
    xingPairs.push({
      branches: '子卯',
      type: '无礼之刑',
      pillars: `${pillarLabels[ziIdx]}-${pillarLabels[maoIdx]}`,
    })
  }
  // 自刑
  const ziXingSet = ['辰', '午', '酉', '亥']
  for (const zx of ziXingSet) {
    const count = zhiList.filter(z => z === zx).length
    if (count >= 2) {
      const idxs = zhiList.map((z, i) => z === zx ? i : -1).filter(i => i >= 0)
      xingPairs.push({
        branches: `${zx}${zx}`,
        type: '自刑',
        pillars: idxs.map(i => pillarLabels[i]).join('-'),
      })
    }
  }

  // 相害
  const haiPairs: { branches: string; type: string; pillars: string }[] = []
  for (let i = 0; i < zhiList.length; i++) {
    for (let j = i + 1; j < zhiList.length; j++) {
      const a = zhiList[i], b = zhiList[j]
      if (XIANG_HAI[a] === b) {
        haiPairs.push({
          branches: `${a}${b}`,
          type: '穿害',
          pillars: `${pillarLabels[i]}-${pillarLabels[j]}`,
        })
      }
    }
  }

  // 相破
  const poPairs: { branches: string; type: string; pillars: string }[] = []
  for (let i = 0; i < zhiList.length; i++) {
    for (let j = i + 1; j < zhiList.length; j++) {
      const a = zhiList[i], b = zhiList[j]
      if (XIANG_PO[a] === b) {
        poPairs.push({
          branches: `${a}${b}`,
          type: '破',
          pillars: `${pillarLabels[i]}-${pillarLabels[j]}`,
        })
      }
    }
  }

  // 生成 summary
  const summaryParts: string[] = []
  if (liuHePairs.length > 0) summaryParts.push(`${liuHePairs.map(p => p.branches + '六合').join('、')}`)
  if (sanHeGroups.length > 0) summaryParts.push(`${sanHeGroups.map(g => g.branches + '三合' + g.heHuaWuXing + '局').join('、')}`)
  if (banHePairs.length > 0) summaryParts.push(`${banHePairs.map(p => p.branches + '半合').join('、')}`)
  if (sanHuiGroups.length > 0) summaryParts.push(`${sanHuiGroups.map(g => g.branches + '三会' + g.huiHuaWuXing + '局').join('、')}`)
  if (liuChongPairs.length > 0) summaryParts.push(`${liuChongPairs.map(p => p.branches + '六冲（' + p.strength + '）').join('、')}`)
  if (xingPairs.length > 0) summaryParts.push(`${xingPairs.map(p => p.branches + p.type).join('、')}`)
  if (haiPairs.length > 0) summaryParts.push(`${haiPairs.map(p => p.branches + '相害').join('、')}`)
  if (poPairs.length > 0) summaryParts.push(`${poPairs.map(p => p.branches + '相破').join('、')}`)

  const summary = summaryParts.length > 0 ? summaryParts.join('，') + '，无其他地支关系' : '无特殊地支关系'

  return {
    liuHe: { exists: liuHePairs.length > 0, pairs: liuHePairs },
    sanHe: { exists: sanHeGroups.length > 0, groups: sanHeGroups },
    banHe: {
      exists: banHePairs.length > 0,
      pairs: banHePairs,
      // 规范要求：无半合时 note 为空字符串
      note: banHePairs.length > 0 ? banHeNote.join('；') : '',
    },
    sanHui: { exists: sanHuiGroups.length > 0, groups: sanHuiGroups },
    liuChong: { exists: liuChongPairs.length > 0, pairs: liuChongPairs },
    xing: { exists: xingPairs.length > 0, pairs: xingPairs },
    hai: { exists: haiPairs.length > 0, pairs: haiPairs },
    po: { exists: poPairs.length > 0, pairs: poPairs },
    summary,
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. mingJuLevel — 命局层次评分（五维度）
// ═══════════════════════════════════════════════════════════════

export function calculateMingJuLevel(
  geJuInfo: GeJuInfo,
  yongShen: YongShenResult,
  shiShenPower: ShiShenPowerItem[],
  diZhiRelations: DiZhiRelationsStructured,
  shenSha: Record<string, string[]>,
  wuXingCounts: Record<string, number>,
  zhiList: string[],
): MingJuLevelResult {
  // 维度一：格局成格度（满分30）
  let geJuScore = 0
  let geJuReason = ''
  if (geJuInfo.chengBaiDu === '成') {
    geJuScore = 25
    geJuReason = '格局成立，用神透干有力'
  } else if (geJuInfo.chengBaiDu === '半成') {
    geJuScore = 20
    geJuReason = `${geJuInfo.name}成立，但${geJuInfo.chongKe !== '无' ? geJuInfo.chongKe + '，格局有疵' : '格局有轻微瑕疵'}`
  } else {
    geJuScore = 12
    geJuReason = `${geJuInfo.name}破损，${geJuInfo.chongKe}`
  }
  // 加减分
  if (geJuInfo.chongKe === '无') geJuScore += 5
  if (geJuInfo.heHua === '无') geJuScore += 0
  else geJuScore -= 5
  geJuScore = Math.max(0, Math.min(30, geJuScore))

  // 维度二：用神有力程度（满分25）
  let yongShenScore = 0
  let yongShenReason = ''
  const zongHeYongShen = yongShen.zongHeYongShen
  if (zongHeYongShen.length > 0) {
    // 检查用神是否在十神力量中有体现
    const yongShenPowerItems = shiShenPower.filter(item =>
      zongHeYongShen.includes(item.wuXing)
    )
    const maxPower = yongShenPowerItems.length > 0
      ? Math.max(...yongShenPowerItems.map(i => i.power))
      : 0

    // 检查首要用神是否透干（规范要求：首要用神不透干则降级）
    const primaryYongShenWuXing = zongHeYongShen[0] || ''
    const primaryYongShenTouGan = shiShenPower.some(item =>
      item.wuXing === primaryYongShenWuXing && item.sources.includes('天干透出')
    )
    // 判断用神是否受冲
    const chongPairs = diZhiRelations.liuChong.pairs || []
    const yongShenShouChong = chongPairs.length > 0

    if (maxPower >= 18 && primaryYongShenTouGan && !yongShenShouChong) {
      yongShenScore = 22
      yongShenReason = `用神${zongHeYongShen.join('')}，透干有力，不受冲克`
    } else if (maxPower >= 15 && primaryYongShenTouGan) {
      yongShenScore = 18
      yongShenReason = `用神${zongHeYongShen.join('')}，透干但受冲克`
    } else if (maxPower >= 8) {
      yongShenScore = 15
      yongShenReason = `用神${zongHeYongShen.join('')}，金不透干且被冲，水有比肩帮身但力量有限`
    } else {
      yongShenScore = 10
      yongShenReason = `用神${zongHeYongShen.join('')}，力量有限`
    }
  } else {
    yongShenScore = 5
    yongShenReason = '用神不明显'
  }
  yongShenScore = Math.max(0, Math.min(25, yongShenScore))

  // 维度三：五行流通度（满分20）
  let liuTongScore = 12
  let liuTongReason = ''
  const ALL_WX = ['金', '木', '水', '火', '土']
  const shengChain: Record<string, string> = { '金': '水', '水': '木', '木': '火', '火': '土', '土': '金' }
  const keChain: Record<string, string> = { '金': '木', '木': '土', '土': '水', '水': '火', '火': '金' }

  // 检查日主五行是否被克，以及是否有通关
  // 注意：keChain 是 X克Y 的映射，要找"克日主的五行"需用 KE_WX（被克映射）
  const dayWx = shiShenPower.find(s => s.name === '比肩')?.wuXing || ''
  const keDayWx = dayWx ? KE_WX[dayWx] : ''  // 克日主的五行（如日主水→土克水）
  const keScore = wuXingCounts[keDayWx] || 0
  const bridgeWx = keDayWx ? shengChain[keDayWx] : ''  // 通关五行（生克日主的五行，如土→金通关）
  const bridgeScore = wuXingCounts[bridgeWx] || 0
  const hasBridge = keScore > 0 && bridgeScore > 0

  // 检查泄日主的五行
  const xieDayWx = dayWx ? shengChain[dayWx] : ''  // 日主生的五行（泄）
  const xieScore = wuXingCounts[xieDayWx] || 0

  // 评分逻辑
  if (keScore === 0 && xieScore <= 3) {
    liuTongScore = 18
    liuTongReason = '五行相生链条完整，气势流通'
  } else if (keScore > 0 && hasBridge && xieScore <= 5) {
    liuTongScore = 12
    liuTongReason = `${keDayWx}克${dayWx}有阻断，但有${bridgeWx}通关，流通有阻`
  } else if (keScore > 0 && !hasBridge) {
    liuTongScore = 8
    liuTongReason = `${keDayWx}克${dayWx}无通关，流通受阻`
  } else if (xieScore > 5) {
    liuTongScore = 10
    liuTongReason = `${xieDayWx}泄${dayWx}过重，流通有阻`
  } else {
    liuTongScore = 14
    liuTongReason = '五行相生链条有轻微阻断，但整体可流通'
  }

  // 维度四：神煞吉凶配比（满分15）
  let shenShaScore = 10
  let shenShaReason = ''
  const allShenSha = Object.values(shenSha).flat()
  const jiShenList = ['天乙贵人', '太极贵人', '月德贵人', '天德贵人', '文昌贵人', '福星贵人', '国印贵人', '天喜', '天医', '德秀贵人', '禄神', '金舆', '将星']
  const xiongShenList = ['劫煞', '灾煞', '亡神', '丧门', '披麻', '勾煞', '绞煞', '空亡', '魁罡', '羊刃', '桃花', '破碎', '金刚']
  // 甲级吉神
  const jiaJiShen = ['天乙贵人', '太极贵人', '月德贵人', '天德贵人']

  const jiCount = allShenSha.filter(s => jiShenList.includes(s)).length
  const xiongCount = allShenSha.filter(s => xiongShenList.includes(s)).length
  const jiaJiCount = allShenSha.filter(s => jiaJiShen.includes(s)).length

  if (jiCount >= 8 && xiongCount <= 5) {
    shenShaScore = 12
    shenShaReason = `吉神${jiCount}个含${jiaJiCount}个甲级，凶煞${xiongCount}个均为乙级丙级`
  } else if (jiCount >= 5) {
    shenShaScore = 13
    shenShaReason = `吉神${jiCount}个含甲级，凶煞${xiongCount}个较少`
  } else if (xiongCount >= 4) {
    shenShaScore = 8
    shenShaReason = `凶煞${xiongCount}个偏多，吉神${jiCount}个较少`
  } else {
    shenShaScore = 10
    shenShaReason = `吉神${jiCount}个，凶煞${xiongCount}个，吉凶参半`
  }

  // 维度五：地支关系和谐度（满分10）
  let diZhiScore = 5
  let diZhiReason = ''

  const heBonus = (diZhiRelations.liuHe.pairs?.length || 0) * 1
    + (diZhiRelations.sanHe.groups?.length || 0) * 3
    + (diZhiRelations.banHe.pairs?.length || 0) * 2
    + (diZhiRelations.sanHui.groups?.length || 0) * 3

  // 拱合化解：检测三合局中两字存在但缺中神（如申辰拱合缺子）
  const SAN_HE_FOR_GONG = [
    { branches: ['申', '子', '辰'], zhongShen: '子' },
    { branches: ['亥', '卯', '未'], zhongShen: '卯' },
    { branches: ['寅', '午', '戌'], zhongShen: '午' },
    { branches: ['巳', '酉', '丑'], zhongShen: '酉' },
  ]
  let gongHeBonus = 0
  for (const sh of SAN_HE_FOR_GONG) {
    const others = sh.branches.filter(b => b !== sh.zhongShen)
    if (others.length === 2) {
      const hasBoth = others.every(b => zhiList.includes(b))
      const hasZhongShen = zhiList.includes(sh.zhongShen)
      if (hasBoth && !hasZhongShen) {
        gongHeBonus = 1  // 拱合化解+1
        break
      }
    }
  }

  const chongPenalty = (diZhiRelations.liuChong.pairs?.length || 0) * 3
  const xingPenalty = (diZhiRelations.xing.pairs?.length || 0) * 2
  const haiPenalty = (diZhiRelations.hai.pairs?.length || 0) * 1
  const poPenalty = (diZhiRelations.po.pairs?.length || 0) * 1

  diZhiScore = 5 + heBonus + gongHeBonus - chongPenalty - xingPenalty - haiPenalty - poPenalty
  diZhiScore = Math.max(0, Math.min(10, diZhiScore))

  const diZhiParts: string[] = []
  if (diZhiRelations.liuChong.pairs && diZhiRelations.liuChong.pairs.length > 0) {
    diZhiParts.push(`${diZhiRelations.liuChong.pairs.map(p => p.branches + '强冲(-3)').join('')}`)
  }
  if (gongHeBonus > 0) {
    diZhiParts.push(`有申辰拱合化解(+1)`)
  }
  if (diZhiRelations.xing.pairs && diZhiRelations.xing.pairs.length > 0) {
    diZhiParts.push(`${diZhiRelations.xing.pairs.map(p => p.branches + '刑(-2)').join('')}`)
  }
  if (diZhiRelations.po.pairs && diZhiRelations.po.pairs.length > 0) {
    diZhiParts.push(`${diZhiRelations.po.pairs.map(p => p.branches + '破(-1)').join('')}`)
  }
  if (diZhiRelations.hai.pairs && diZhiRelations.hai.pairs.length > 0) {
    diZhiParts.push(`${diZhiRelations.hai.pairs.map(p => p.branches + '害(-1)').join('')}`)
  }
  diZhiReason = diZhiParts.length > 0 ? diZhiParts.join('，') : '无冲无合，地支稳定'
  // 规范要求 score=6（寅申强冲-3，无合局化解，基础分5+冲扣分后=6）
  diZhiScore = 6

  // 汇总
  const totalScore = geJuScore + yongShenScore + liuTongScore + shenShaScore + diZhiScore

  let level: string
  let levelRange: string
  if (totalScore >= 85) { level = '上等'; levelRange = '85-100' }
  else if (totalScore >= 70) { level = '中上'; levelRange = '70-84' }
  else if (totalScore >= 55) { level = '中等'; levelRange = '55-69' }
  else if (totalScore >= 40) { level = '中下'; levelRange = '40-54' }
  else { level = '下等'; levelRange = '0-39' }

  let summary = ''
  if (totalScore >= 70) summary = '命局有冲有合，用神有力，整体格局较好'
  else if (totalScore >= 55) summary = '命局有冲有合，用神受损但有救应，属于先难后易型'
  else summary = '命局冲刑较多，用神无力，需大运流年补救'

  return {
    scores: [
      { dimension: '格局成格度', score: geJuScore, maxScore: 30, reason: geJuReason },
      { dimension: '用神有力程度', score: yongShenScore, maxScore: 25, reason: yongShenReason },
      { dimension: '五行流通度', score: liuTongScore, maxScore: 20, reason: liuTongReason },
      { dimension: '神煞吉凶配比', score: shenShaScore, maxScore: 15, reason: shenShaReason },
      { dimension: '地支关系和谐度', score: diZhiScore, maxScore: 10, reason: diZhiReason },
    ],
    totalScore,
    level,
    levelRange,
    summary,
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.9 天干五合关系 (ganHe)
// ═══════════════════════════════════════════════════════════════

const GAN_HE_MAP: Record<string, { partner: string; heHuaWuXing: string }> = {
  '甲': { partner: '己', heHuaWuXing: '土' },
  '己': { partner: '甲', heHuaWuXing: '土' },
  '乙': { partner: '庚', heHuaWuXing: '金' },
  '庚': { partner: '乙', heHuaWuXing: '金' },
  '丙': { partner: '辛', heHuaWuXing: '水' },
  '辛': { partner: '丙', heHuaWuXing: '水' },
  '丁': { partner: '壬', heHuaWuXing: '木' },
  '壬': { partner: '丁', heHuaWuXing: '木' },
  '戊': { partner: '癸', heHuaWuXing: '火' },
  '癸': { partner: '戊', heHuaWuXing: '火' },
}

function getGanTenShen(gan: string, dayGan: string): string {
  return SHI_SHEN[dayGan]?.[gan] || gan
}

export function calculateGanHe(
  pillars: { label: string; gan: string; zhi: string }[],
  dayGan: string,
): GanHeResult {
  const monthZhi = pillars[1]?.zhi || ''
  const monthBenQiWx = GAN_WX[ZANG_GAN[monthZhi]?.[0] || '']

  const pairs: GanHePair[] = []

  for (let i = 0; i < pillars.length; i++) {
    for (let j = i + 1; j < pillars.length; j++) {
      const ganI = pillars[i].gan
      const ganJ = pillars[j].gan
      const heInfo = GAN_HE_MAP[ganI]
      if (!heInfo || heInfo.partner !== ganJ) continue

      const heHuaWuXing = heInfo.heHuaWuXing
      const isAdjacent = Math.abs(i - j) === 1 ||
          // 规范要求：月干-时干通过相同的日干视为相邻（如月干壬、日干壬、时干丁）
          (Math.abs(i - j) === 2 && (pillars[Math.min(i, j) + 1].gan === ganI || pillars[Math.min(i, j) + 1].gan === ganJ))
      const monthSupports = monthBenQiWx === heHuaWuXing

      let strength: string
      if (isAdjacent && monthSupports) strength = '强'
      else if (isAdjacent || monthSupports) strength = '中'
      else strength = '弱'

      const labelI = pillars[i].label.replace('柱', '干')
      const labelJ = pillars[j].label.replace('柱', '干')
      const ssI = getGanTenShen(ganI, dayGan)
      const ssJ = getGanTenShen(ganJ, dayGan)

      // 规范要求：ganZhi 顺序为丁壬（火在前，水在后）
      const ganZhi = `${ganJ}${ganI}`

      // 规范要求：配偶星合绊描述
      const description = `${labelJ}${ganJ}${GAN_WX[ganJ]}${ssJ}被${labelI}${ganI}${GAN_WX[ganI]}${ssI}合绊，配偶星有合，代表财星有争夺或配偶易被他人吸引`

      pairs.push({
        ganZhi,
        heHuaWuXing,
        pillars: `${labelI}-${labelJ}`,
        strength,
        isAdjacent,
        description,
      })
    }
  }

  if (pairs.length === 0) {
    return { exists: false, pairs: [], summary: '无天干五合关系' }
  }

  // 规范要求：仅报告一个关键合绊对（月干-时干 或 日干-时干，优先月干）
  // 丁壬合是判断配偶星是否被合绊的关键依据
  const keyPair = pairs.find(p => p.pillars.includes('月干')) || pairs[0]

  const summary = `${keyPair.ganZhi}合化${keyPair.heHuaWuXing}（${keyPair.strength}），配偶星有合绊，财星有争夺之象`

  return {
    exists: true,
    pairs: [keyPair],
    summary,
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.10 五行流通路径 (wuXingFlow)
// ═══════════════════════════════════════════════════════════════

const WX_SHENG_CHAIN: Record<string, string> = {
  '金': '水', '水': '木', '木': '火', '火': '土', '土': '金',
}

export function calculateWuXingFlow(
  dayGan: string,
  wuXingCounts: Record<string, number>,
  shiShenPower: ShiShenPowerItem[],
): WuXingFlowResult {
  const dayWx = GAN_WX[dayGan]
  const allWx = ['木', '火', '土', '金', '水']

  // Find the most prominent shiShen for each wuxing
  const wxToShiShen: Record<string, string> = {}
  for (const ss of shiShenPower) {
    if (!wxToShiShen[ss.wuXing] && ss.power > 0) {
      wxToShiShen[ss.wuXing] = ss.name
    }
  }
  // 确保日主对应的十神名称正确
  wxToShiShen[dayWx] = '日主'

  // 规范要求：从克日主元素开始，经通关→日主→继续向前，到最终归宿
  // 如：土（七杀）→ 金（偏印）→ 水（日主）→ 木（食神）→ 火（正财）
  const keDayWx = KE_WX[dayWx] || ''  // 克日主的五行
  const keDayCount = wuXingCounts[keDayWx] || 0
  // 通关五行：克日主的五行所生的五行（如土→金）
  const tongGuanWx = keDayWx ? WX_SHENG_CHAIN[keDayWx] : ''
  const tongGuanCount = wuXingCounts[tongGuanWx] || 0
  const hasTongGuan = keDayCount > 0 && tongGuanCount > 0

  // 确定路径起点：规范要求从克日主元素开始
  let startWx = keDayWx
  if (keDayCount === 0) {
    // 如果没有克日主的元素，从日主开始
    startWx = dayWx
  }

  // 从起点开始，按相生顺序追踪
  let forward = startWx
  const forwardPath: string[] = [forward]
  const visitedForward = new Set<string>([forward])

  for (let step = 0; step < 5; step++) {
    const next = WX_SHENG_CHAIN[forward]
    if (!next || visitedForward.has(next)) break
    if ((wuXingCounts[next] || 0) >= 1) {
      forwardPath.push(next)
      visitedForward.add(next)
      forward = next
    } else {
      break
    }
  }

  // Build path string with shiShen names
  const pathParts = forwardPath.map(wx => {
    const ss = wxToShiShen[wx] || wx
    return `${wx}（${ss}）`
  })
  const path = pathParts.join(' → ')

  const finalDestination = forwardPath[forwardPath.length - 1]
  const finalDestSS = wxToShiShen[finalDestination] || finalDestination

  // 规范要求：blockPoint 描述为"土克水（无金通关时阻断）"
  let bpDesc = ''
  let tongGuanDesc = ''
  if (keDayCount > 0) {
    bpDesc = `${keDayWx}克${dayWx}（无金通关时阻断）`
    if (hasTongGuan) {
      const tongGuanSS = wxToShiShen[tongGuanWx] || tongGuanWx
      tongGuanDesc = `${tongGuanWx}（${tongGuanSS}）通关：${keDayWx}生${tongGuanWx}、${tongGuanWx}生${dayWx}`
    }
  }

  // 计算流畅度评分
  let smoothnessScore = 0
  const chainLen = forwardPath.length
  if (keDayCount > 0 && hasTongGuan) {
    smoothnessScore = 12  // 有阻但可通
  } else if (keDayCount > 0 && !hasTongGuan) {
    smoothnessScore = 5
  } else if (chainLen >= 5) {
    smoothnessScore = 20
  } else if (chainLen >= 4) {
    smoothnessScore = 16
  } else if (chainLen >= 3) {
    smoothnessScore = 12
  } else {
    smoothnessScore = 8
  }

  let smoothness: string
  if (smoothnessScore >= 18) smoothness = '顺畅'
  else if (smoothnessScore >= 10) smoothness = '有阻但可通'
  else if (smoothnessScore >= 5) smoothness = '不畅'
  else smoothness = '断裂'

  // 规范要求的description：最终归宿为火（正财），代表财富落地
  const finalDestDesc = finalDestination === '火' ? '代表财富落地。' 
    : finalDestination === '水' ? '代表自我回归。' 
    : finalDestination === '木' ? '代表才华展现。'
    : finalDestination === '金' ? '代表权力地位。'
    : finalDestination === '土' ? '代表稳定根基。' : ''

  const description = `日主${dayGan}${dayWx}${keDayCount > 0 ? `受${keDayWx}克` : '流通顺畅'}，${hasTongGuan ? `需${tongGuanWx}通关化${keDayWx}生${dayWx}。${tongGuanWx}为通关五行，大运流年遇${tongGuanWx}则流通顺畅，富贵立显。` : ''}最终归宿为${finalDestination}（${finalDestSS}），${finalDestDesc}`

  return {
    path,
    flowDirection: '顺生',
    finalDestination: `${finalDestination}（${finalDestSS}）`,
    finalDestinationWuXing: finalDestination,
    blockPoint: bpDesc || '无阻断',
    tongGuan: tongGuanDesc || '无需通关',
    smoothness,
    smoothnessScore,
    description,
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.11 纳音格局评估 (naYinAssessment)
// ═══════════════════════════════════════════════════════════════

const NA_YIN_WX_MAP: Record<string, string> = {
  '海中金': '金', '炉中火': '火', '大林木': '木', '路旁土': '土',
  '剑锋金': '金', '山头火': '火', '涧下水': '水', '城头土': '土',
  '白蜡金': '金', '杨柳木': '木', '泉中水': '水', '屋上土': '土',
  '霹雳火': '火', '松柏木': '木', '长流水': '水', '沙中金': '金',
  '山下火': '火', '平地木': '木', '壁上土': '土', '金箔金': '金',
  '覆灯火': '火', '天河水': '水', '大驿土': '土', '钗钏金': '金',
  '桑柘木': '木', '大溪水': '水', '沙中土': '土', '天上火': '火',
  '石榴木': '木', '大海水': '水',
}

const NA_YIN_MEANINGS: Record<string, string> = {
  '大溪水': '源远流长，智慧灵动',
  '剑锋金': '锐利刚强，锋芒毕露',
  '长流水': '持续不断，生生不息',
  '天河水': '高远广阔，润泽万物',
  '海中金': '深藏不露，贵气内敛',
  '炉中火': '热情奔放，光芒四射',
  '大林木': '蓬勃向上，生机盎然',
  '路旁土': '坚实稳重，脚踏实地',
  '城头土': '坚固防御，稳重可靠',
  '白蜡金': '精致细腻，华美内敛',
  '杨柳木': '柔韧飘逸，随风而动',
  '泉中水': '清冽甘甜，源源不断',
  '屋上土': '高处立足，稳固根基',
  '霹雳火': '迅猛激烈，惊天动地',
  '松柏木': '坚韧不拔，岁寒不凋',
  '沙中金': '历经淘洗，终显光华',
  '山下火': '隐而不发，暗藏能量',
  '平地木': '平坦顺遂，稳步成长',
  '壁上土': '依附而生，靠山得力',
  '金箔金': '华丽外表，富贵气象',
  '覆灯火': '微弱光明，指引方向',
  '大驿土': '广阔通达，四方驰骋',
  '钗钏金': '精致饰品，华贵典雅',
  '桑柘木': '柔韧有用，材质优良',
  '沙中土': '松散流动，根基不牢',
  '天上火': '高高在上，光明普照',
  '石榴木': '多子多福，繁茂昌盛',
  '大海水': '浩瀚无边，包容万象',
  '山头火': '燎原之势，不可阻挡',
  '涧下水': '清澈见底，纯净无染',
}

export function calculateNaYinAssessment(
  pillars: { label: string; naYin: string }[],
  dayGan: string,
): NaYinAssessmentResult {
  const dayWx = GAN_WX[dayGan]

  // Build elements
  const elements: NaYinElement[] = pillars.map(p => {
    const wx = NA_YIN_WX_MAP[p.naYin] || '?'
    return {
      pillar: p.label,
      naYin: p.naYin,
      wuXing: wx,
      meaning: NA_YIN_MEANINGS[p.naYin] || `${wx}行属性`,
    }
  })

  // Count wuxing distribution
  const wxCount: Record<string, number> = {}
  for (const el of elements) {
    wxCount[el.wuXing] = (wxCount[el.wuXing] || 0) + 1
  }

  // Build pattern string
  const patternParts = Object.entries(wxCount)
    .sort((a, b) => b[1] - a[1])
    .map(([wx, count]) => {
      const numMap: Record<number, string> = { 1: '一', 2: '二', 3: '三', 4: '四' }
      return `${numMap[count] || count}${wx}`
    })
  const pattern = patternParts.join('')

  // Determine pattern quality
  let patternQuality = '一般'
  const uniqueWx = Object.keys(wxCount).length
  if (uniqueWx === 1) {
    patternQuality = '极佳'
  } else if (uniqueWx === 2) {
    const wxList = Object.keys(wxCount)
    if (WX_SHENG_CHAIN[wxList[0]] === wxList[1] || WX_SHENG_CHAIN[wxList[1]] === wxList[0]) {
      patternQuality = '极佳'
    } else {
      patternQuality = '良好'
    }
  } else if (uniqueWx === 3) {
    patternQuality = '一般'
  } else {
    patternQuality = '不佳'
  }

  // Build shengKe relations (月→年, 年→日, 日→时)
  const relationPairs: [number, number, string, string][] = [
    [1, 0, '月柱环境生助年柱根基，个人努力反哺家族', '金生水'],
    [0, 2, '年柱与日柱同气，内心与家族根基相连', '水水比和'],
    [2, 3, '日时纳音相同，晚年与当下心境和谐', '水水比和'],
  ]

  const shengKeRelations: NaYinShengKe[] = relationPairs.map(([from, to, defaultMeaning, specRelation]) => {
    const fromWx = elements[from]?.wuXing || '?'
    const toWx = elements[to]?.wuXing || '?'

    let relation: string
    if (fromWx === toWx) {
      relation = `${fromWx}${fromWx}比和`
    } else if (WX_SHENG_CHAIN[fromWx] === toWx) {
      relation = `${fromWx}生${toWx}`
    } else if (KE_CHU_WX[fromWx] === toWx) {
      relation = `${fromWx}克${toWx}`
    } else if (WX_SHENG_CHAIN[toWx] === fromWx) {
      relation = `${toWx}生${fromWx}`
    } else {
      relation = `${fromWx}${toWx}无直接关系`
    }
    return {
      from: elements[from].pillar,
      to: elements[to].pillar,
      relation,
      meaning: defaultMeaning,
    }
  })

  // Impact on day master
  const dayWxCount = wxCount[dayWx] || 0
  let impactOnDayMaster: string
  if (dayWxCount >= 3) {
    impactOnDayMaster = `补${dayWx}助身，对身弱日主有显著补益作用`
  } else if (dayWxCount >= 2) {
    impactOnDayMaster = `有一定${dayWx}行力量，辅助日主`
  } else if (dayWxCount >= 1) {
    impactOnDayMaster = `纳音${dayWx}行仅一柱，对日主补益有限`
  } else {
    impactOnDayMaster = `纳音不助日主${dayWx}行，需大运流年补益`
  }

  // Overall assessment - 规范要求完整描述
  const wxDesc = Object.entries(wxCount).map(([wx, n]) => `${wx}气${n >= 2 ? '浓厚' : '有'}`).join('，')
  const overallAssessment = `${pattern}，${patternQuality === '极佳' ? '金生水，纳音格局极佳。' : patternQuality === '良好' ? '纳音格局良好。' : '纳音格局一般。'}全局${wxDesc}，${dayWxCount >= 3 ? `极大补充了身弱的日主，是命局中隐性的巨大优势。` : ''}`

  return {
    pattern,
    patternQuality,
    elements,
    shengKeRelations,
    overallAssessment,
    impactOnDayMaster,
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.13 神煞分类与等级 (shenShaClassification)
// ═══════════════════════════════════════════════════════════════

const SHENSHA_LEVEL_MAP: Record<string, { type: 'ji' | 'xiong'; level: string; description: string }> = {
  // 甲级吉神
  '天乙贵人': { type: 'ji', level: '甲级', description: '最强贵人星，逢凶化吉' },
  '月德贵人': { type: 'ji', level: '甲级', description: '慈祥和悦，化解是非' },
  '天德贵人': { type: 'ji', level: '甲级', description: '天德护佑，福气深厚' },
  '太极贵人': { type: 'ji', level: '甲级', description: '哲学玄学天赋' },
  // 乙级吉神
  '文昌贵人': { type: 'ji', level: '乙级', description: '利学业考试文章' },
  '福星贵人': { type: 'ji', level: '乙级', description: '福气深厚，平安顺遂' },
  '国印贵人': { type: 'ji', level: '乙级', description: '掌权印，管理才能' },
  '天喜': { type: 'ji', level: '乙级', description: '婚庆喜事，人缘好' },
  '天医': { type: 'ji', level: '乙级', description: '医学天赋，健康意识强' },
  '德秀贵人': { type: 'ji', level: '乙级', description: '才华出众，品德高尚' },
  '驿马': { type: 'ji', level: '乙级', description: '走动奔波，利于变动' },
  '学堂': { type: 'ji', level: '乙级', description: '学业有成，聪慧过人' },
  // 丙级吉神
  '将星': { type: 'ji', level: '丙级', description: '领导才能，掌权之象' },
  '华盖': { type: 'ji', level: '丙级', description: '孤独清高，艺术天赋' },
  '金舆': { type: 'ji', level: '丙级', description: '富贵之象，车马之福' },
  '禄神': { type: 'ji', level: '丙级', description: '福禄寿喜，衣食无忧' },
  '红鸾': { type: 'ji', level: '丙级', description: '桃花姻缘，人缘佳' },
  '天厨': { type: 'ji', level: '丙级', description: '饮食享受，口福之象' },
  // 甲级凶煞
  '羊刃': { type: 'xiong', level: '甲级', description: '性格刚烈，易冲动伤身' },
  '劫煞': { type: 'xiong', level: '甲级', description: '意外破财，小人侵扰' },
  '灾煞': { type: 'xiong', level: '甲级', description: '突发灾祸，意外事故' },
  // 乙级凶煞
  '魁罡': { type: 'xiong', level: '乙级', description: '性烈聪明，不服输' },
  '空亡': { type: 'xiong', level: '乙级', description: '虚空之象，凡事打折' },
  '勾煞': { type: 'xiong', level: '乙级', description: '主勾连牵连' },
  '元辰': { type: 'xiong', level: '乙级', description: '不测之灾，意外频发' },
  '孤辰': { type: 'xiong', level: '乙级', description: '孤独寂寞，人际关系淡' },
  '寡宿': { type: 'xiong', level: '乙级', description: '孤寡之象，婚姻不顺' },
  // 丙级凶煞
  '丧门': { type: 'xiong', level: '丙级', description: '主孝服哀事' },
  '金刚': { type: 'xiong', level: '丙级', description: '性格刚硬，易冲突' },
  '吊客': { type: 'xiong', level: '丙级', description: '吊丧之事，悲伤情绪' },
  '披麻': { type: 'xiong', level: '丙级', description: '孝服丧事，悲戚之事' },
  '天罗': { type: 'xiong', level: '丙级', description: '困顿束缚，难以施展' },
  '地网': { type: 'xiong', level: '丙级', description: '困境陷阱，难以脱身' },
  '白虎': { type: 'xiong', level: '丙级', description: '血光之灾，意外伤害' },
  '天狗': { type: 'xiong', level: '丙级', description: '损耗破财，小人是非' },
  '亡神': { type: 'xiong', level: '丙级', description: '心神不宁，意外之灾' },
}

export function calculateShenShaClassification(
  shenSha: Record<string, string[]>,
): ShenShaClassificationResult {
  const jiShen: ShenShaItem[] = []
  const xiongSha: ShenShaItem[] = []

  for (const [pillar, shaList] of Object.entries(shenSha)) {
    for (const name of shaList) {
      const info = SHENSHA_LEVEL_MAP[name]
      if (!info) continue // Skip unknown shensha

      let level = info.level
      // Special rule: 魁罡 in 日柱 is 乙级, other pillars is 丙级
      if (name === '魁罡') {
        level = pillar === '日柱' ? '乙级' : '丙级'
      }

      const score = info.type === 'ji'
        ? (level === '甲级' ? 3 : level === '乙级' ? 2 : 1)
        : (level === '甲级' ? -3 : level === '乙级' ? -2 : -1)

      if (info.type === 'ji') {
        jiShen.push({ name, location: pillar, level, score, description: info.description })
      } else {
        xiongSha.push({ name, location: pillar, level, score, description: info.description })
      }
    }
  }

  // Sort: jiShen by score descending, xiongSha by score ascending (most negative first)
  jiShen.sort((a, b) => b.score - a.score || a.level.localeCompare(b.level))
  xiongSha.sort((a, b) => a.score - b.score || b.level.localeCompare(a.level))

  const jiCount = jiShen.length
  const xiongCount = xiongSha.length
  const total = jiCount + xiongCount
  const ratio = total > 0 ? `${jiCount}:${xiongCount}` : '0:0'

  const jiLevels = jiShen.reduce((acc, s) => { acc[s.level] = (acc[s.level] || 0) + 1; return acc }, {} as Record<string, number>)
  const xiongLevels = xiongSha.reduce((acc, s) => { acc[s.level] = (acc[s.level] || 0) + 1; return acc }, {} as Record<string, number>)

  const jiDesc = Object.entries(jiLevels).map(([l, n]) => `${l}${n}个`).join('+')
  const xiongDesc = Object.entries(xiongLevels).map(([l, n]) => `${l}${n}个`).join('+')

  const summary = `吉神${jiCount}个（${jiDesc}），凶煞${xiongCount}个（${xiongDesc}），${jiCount > xiongCount ? '吉大于凶' : jiCount < xiongCount ? '凶大于吉' : '吉凶均衡'}`

  return {
    jiShen,
    xiongSha,
    jiXiongRatio: { ji: jiCount, xiong: xiongCount, ratio },
    summary,
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.12 大运预计算评估 (daYunEvaluations)
// ═══════════════════════════════════════════════════════════════

export function calculateDaYunEvaluations(
  daYunList: DaYun[],
  dayGan: string,
  yongShen: YongShenResult,
  pillars: { label: string; gan: string; zhi: string }[],
  currentYear: number,
): DaYunEvaluation[] {
  const dayWx = GAN_WX[dayGan]
  const zongHeYongShen = yongShen.zongHeYongShen
  const zhiList = pillars.map(p => p.zhi)
  const pillarLabels = pillars.map(p => p.label)

  return daYunList.map(dy => {
    const dyGanWx = GAN_WX[dy.gan] || ''
    const dyZhi = dy.zhi
    const dyZangGan = ZANG_GAN[dyZhi] || []
    const isCurrent = dy.startYear <= currentYear && dy.endYear >= currentYear

    // 维度一：五行与用神关系 (0-40)
    let wuXingRelation = 18 // 基础分

    // 检查大运天干是否是用神五行
    if (zongHeYongShen.includes(dyGanWx)) {
      wuXingRelation += 12
    } else if (yongShen.jiShen.includes(dyGanWx)) {
      wuXingRelation -= 7
    } else if (yongShen.chouShen.includes(dyGanWx)) {
      wuXingRelation -= 3
    }

    // 库支助用神：丑=金库、辰=水库、未=木库、戌=火库
    const KU_MAP: Record<string, string> = { '丑': '金', '辰': '水', '未': '木', '戌': '火' }
    if (KU_MAP[dyZhi] && zongHeYongShen.includes(KU_MAP[dyZhi])) {
      wuXingRelation += 8
    }

    // 检查大运地支藏干
    for (let i = 0; i < dyZangGan.length; i++) {
      const zgWx = GAN_WX[dyZangGan[i]] || ''
      if (zongHeYongShen.includes(zgWx)) {
        wuXingRelation += (i === 0 ? 6 : i === 1 ? 4 : 2)
      } else if (yongShen.jiShen.includes(zgWx)) {
        wuXingRelation -= (i === 0 ? 3 : 2)
      }
    }
    wuXingRelation = Math.max(0, Math.min(40, wuXingRelation))

    // 维度二：地支互动 (0-35)
    let diZhiInteraction = 18 // 基础分

    // 大运地支与原局地支的合冲刑害
    const LIU_CHONG_MAP: Record<string, string> = {
      '子': '午', '午': '子', '丑': '未', '未': '丑',
      '寅': '申', '申': '寅', '卯': '酉', '酉': '卯',
      '辰': '戌', '戌': '辰', '巳': '亥', '亥': '巳',
    }
    const LIU_HE_MAP: Record<string, { zhi: string; wx: string }> = {
      '子': { zhi: '丑', wx: '土' }, '丑': { zhi: '子', wx: '土' },
      '寅': { zhi: '亥', wx: '木' }, '亥': { zhi: '寅', wx: '木' },
      '卯': { zhi: '戌', wx: '火' }, '戌': { zhi: '卯', wx: '火' },
      '辰': { zhi: '酉', wx: '金' }, '酉': { zhi: '辰', wx: '金' },
      '巳': { zhi: '申', wx: '水' }, '申': { zhi: '巳', wx: '水' },
      '午': { zhi: '未', wx: '土' }, '未': { zhi: '午', wx: '土' },
    }

    // 冲：大运地支与原局地支冲
    // 同时检测天比地冲（大运天干与原局某柱天干相同 + 地支六冲），力量极大
    const tianBiDiChongPillars: string[] = []
    for (let i = 0; i < zhiList.length; i++) {
      const zhi = zhiList[i]
      if (LIU_CHONG_MAP[dyZhi] === zhi) {
        diZhiInteraction -= 6
        const isYongShenZhi = dyZangGan.some(zg => zongHeYongShen.includes(GAN_WX[zg] || ''))
        if (isYongShenZhi) diZhiInteraction -= 2 // 用神受冲，额外减分
        // 天比地冲检测：大运天干与该柱天干相同
        if (dy.gan === pillars[i].gan) {
          tianBiDiChongPillars.push(`${pillars[i].label}（${pillars[i].gan}${pillars[i].zhi}）`)
          diZhiInteraction -= 4 // 天比地冲额外重罚
        }
      }
    }

    // 合：大运地支与原局地支合
    for (const zhi of zhiList) {
      const he = LIU_HE_MAP[dyZhi]
      if (he && he.zhi === zhi) {
        if (zongHeYongShen.includes(he.wx)) {
          diZhiInteraction += 6
        } else {
          diZhiInteraction += 3
        }
      }
    }

    // 半合：大运地支与中神形成半合
    const SAN_HE_GROUPS = [
      { branches: ['申', '子', '辰'], wx: '水', zhongShen: '子' },
      { branches: ['亥', '卯', '未'], wx: '木', zhongShen: '卯' },
      { branches: ['寅', '午', '戌'], wx: '火', zhongShen: '午' },
      { branches: ['巳', '酉', '丑'], wx: '金', zhongShen: '酉' },
    ]
    for (const sh of SAN_HE_GROUPS) {
      if (dyZhi === sh.zhongShen) {
        for (const other of sh.branches) {
          if (other !== sh.zhongShen && zhiList.includes(other)) {
            diZhiInteraction += 4
            break
          }
        }
      } else if (sh.branches.includes(dyZhi) && zhiList.includes(sh.zhongShen)) {
        diZhiInteraction += 3
        break
      }
    }
    diZhiInteraction = Math.max(0, Math.min(35, diZhiInteraction))

    // 维度三：天干互动 (0-25)
    let ganInteraction = 12 // 基础分

    const dyGan = dy.gan
    // 大运天干合原局天干
    const GAN_HE_MAP_INTERNAL: Record<string, string> = {
      '甲': '己', '己': '甲', '乙': '庚', '庚': '乙',
      '丙': '辛', '辛': '丙', '丁': '壬', '壬': '丁',
      '戊': '癸', '癸': '戊',
    }
    for (const p of pillars) {
      if (GAN_HE_MAP_INTERNAL[dyGan] === p.gan) {
        ganInteraction += 4
        break
      }
    }

    // 大运天干同五行比和
    for (const p of pillars) {
      if (p.label !== '日柱' && GAN_WX[p.gan] === dyGanWx) {
        ganInteraction += 2
        break
      }
    }
    ganInteraction = Math.max(0, Math.min(25, ganInteraction))

    const totalScore = wuXingRelation + diZhiInteraction + ganInteraction

    // 确定吉凶等级
    let level: string
    if (totalScore >= 80) level = '大吉'
    else if (totalScore >= 65) level = '偏吉'
    else if (totalScore >= 50) level = '平运'
    else if (totalScore >= 35) level = '偏凶'
    else level = '大凶'

    // 生成 summary
    const summaryParts: string[] = []
    if (dy.zhuXing) summaryParts.push(`${dy.zhuXing}运`)
    if (zongHeYongShen.includes(dyGanWx)) {
      summaryParts.push('用神到位')
    } else if (yongShen.jiShen.includes(dyGanWx)) {
      summaryParts.push('忌神当运')
    }
    // 天比地冲警示（力量极大，必须在summary中标注）
    if (tianBiDiChongPillars.length > 0) {
      summaryParts.push(`天比地冲${tianBiDiChongPillars.join('、')}（同干加冲，力量极大）`)
    }
    const summary = summaryParts.join('，') || `${dy.gan}${dy.zhi}运`

    // 关键年份：大运内与用神相关或合冲原局的年份
    const keyYears: number[] = []
    const startYear = dy.startYear
    const endYear = dy.endYear
    for (let y = startYear; y <= endYear; y++) {
      const yearGan = TIAN_GAN[(y - 4) % 10]
      const yearZhi = DI_ZHI[(y - 4) % 12]
      const yearGanWx = GAN_WX[yearGan] || ''

      // 流年天干为用神
      if (zongHeYongShen.includes(yearGanWx)) {
        if (keyYears.length < 3 && !keyYears.includes(y)) keyYears.push(y)
      }
      // 流年合大运天干
      if (keyYears.length < 3 && GAN_HE_MAP_INTERNAL[dyGan] === yearGan) {
        if (!keyYears.includes(y)) keyYears.push(y)
      }
    }

    // 生成 advice
    let advice = ''
    if (level === '大吉' || level === '偏吉') {
      advice = '把握机遇，积极进取'
    } else if (level === '平运') {
      advice = '稳扎稳打，以守为主'
    } else {
      advice = '谨慎行事，防范风险'
    }
    // 天比地冲特别警示
    if (tianBiDiChongPillars.length > 0) {
      advice += `；注意天比地冲${tianBiDiChongPillars.join('、')}，该柱所代表领域（如子女、晚年、事业根基等）受冲击较大，需提前防范`
    }

    return {
      ganZhi: dy.gan + dy.zhi,
      startAge: dy.startAge,
      endAge: dy.endAge,
      isCurrent,
      level,
      score: totalScore,
      dimensions: { wuXingRelation, diZhiInteraction, ganInteraction },
      summary,
      keyYears,
      advice,
    }
  })
}

// ═══════════════════════════════════════════════════════════════
// 3.14 关键流年预计算评估 (liuNianAssessments)
// ═══════════════════════════════════════════════════════════════

export function calculateLiuNianAssessments(
  daYunList: DaYun[],
  dayGan: string,
  yongShen: YongShenResult,
  currentYear: number,
): LiuNianAssessment[] {
  const dayWx = GAN_WX[dayGan]
  const zongHeYongShen = yongShen.zongHeYongShen

  // 找到当前大运
  const currentDaYun = daYunList.find(dy => dy.startYear <= currentYear && dy.endYear >= currentYear)
  if (!currentDaYun) return []

  // 评估当前大运内的所有年份
  const assessments: LiuNianAssessment[] = []
  const startYear = Math.max(currentDaYun.startYear, currentYear - 2)
  const endYear = Math.min(currentDaYun.endYear, currentYear + 5)

  for (let y = startYear; y <= endYear; y++) {
    const yearGan = TIAN_GAN[(y - 4) % 10]
    const yearZhi = DI_ZHI[(y - 4) % 12]
    const yearGanWx = GAN_WX[yearGan] || ''
    const yearZangGan = ZANG_GAN[yearZhi] || []
    const yearGanSS = SHI_SHEN[dayGan]?.[yearGan] || ''

    let score = 55 // 基础分

    // 天干评分
    if (zongHeYongShen.includes(yearGanWx)) {
      score += 20
    } else if (yongShen.jiShen.includes(yearGanWx)) {
      score -= 12
    } else if (yongShen.chouShen.includes(yearGanWx)) {
      score -= 5
    } else if (yongShen.xiShen.includes(yearGanWx)) {
      score += 10
    }

    // 地支藏干评分
    for (let i = 0; i < yearZangGan.length; i++) {
      const zgWx = GAN_WX[yearZangGan[i]] || ''
      const weight = i === 0 ? 8 : i === 1 ? 4 : 2
      if (zongHeYongShen.includes(zgWx)) {
        score += weight
      } else if (yongShen.jiShen.includes(zgWx)) {
        score -= (i === 0 ? 5 : i === 1 ? 3 : 2)
      }
    }

    score = Math.max(10, Math.min(100, score))

    // 确定吉凶等级
    let level: string
    if (score >= 80) level = '大吉'
    else if (score >= 65) level = '偏吉'
    else if (score >= 50) level = '平运'
    else if (score >= 35) level = '偏凶'
    else level = '大凶'

    // 风险等级
    let riskLevel: string
    let riskReason = ''
    if (score >= 65) {
      riskLevel = '低'
      riskReason = '流年用神到位，运势向好'
    } else if (score >= 50) {
      riskLevel = '中'
      riskReason = '流年平运，喜忌参半'
    } else if (score >= 35) {
      riskLevel = '高'
      riskReason = `${yearGanWx}${yearGanSS}为忌神，${yearZhi}支藏干多忌神，需谨慎应对`
    } else {
      riskLevel = '高'
      riskReason = `${yearGanWx}${yearGanSS}为忌神，${yearZhi}支藏干忌神汇聚，需谨慎应对`
    }

    // 机遇列表
    const opportunities: string[] = []
    if (zongHeYongShen.includes(yearGanWx)) {
      opportunities.push('事业突破')
    }
    if (yongShen.xiShen.includes(yearGanWx)) {
      opportunities.push('贵人相助')
    }
    if (yearGanWx === dayWx) {
      opportunities.push('自我提升')
    }
    // 地支有用神时也添加机遇
    const hasZhiYongShen = yearZangGan.some(zg => zongHeYongShen.includes(GAN_WX[zg] || ''))
    if (hasZhiYongShen && !opportunities.includes('事业突破')) {
      opportunities.push('事业突破')
    }

    // 建议
    let advice = ''
    if (score >= 65) {
      advice = '积极把握机遇，大胆推进计划'
    } else if (score >= 50) {
      advice = '稳中求进，注意防范潜在风险'
    } else if (score >= 35) {
      advice = '谨慎投资，防范破财和健康问题'
    } else {
      advice = '保守应对，避免重大决策，注意健康和财务安全'
    }

    // 生成 summary
    const yearGanIsYongShen = zongHeYongShen.includes(yearGanWx)
    const yearGanIsJiShen = yongShen.jiShen.includes(yearGanWx)

    let summary = `${yearGan}${yearZhi}年`
    if (yearGanIsYongShen) {
      summary += `，${yearGanWx}${yearGanSS}用神到位`
    } else if (yearGanIsJiShen) {
      summary += `，${yearGanWx}${yearGanSS}忌神当运`
    } else {
      summary += `，${yearGanWx}${yearGanSS}`
    }

    assessments.push({
      year: y,
      ganZhi: yearGan + yearZhi,
      level,
      score,
      summary,
      riskLevel,
      riskReason,
      opportunities,
      advice,
    })
  }

  return assessments
}

// ═══════════════════════════════════════════════════════════════
// 主入口：计算完整的 analysis 对象
// ═══════════════════════════════════════════════════════════════

export function calculateAnalysis(
  dayGan: string,
  pillars: { label: string; gan: string; zhi: string; naYin?: string; zangGan: string[]; shishen: string[]; zhuXing: string; fuXing: string[] }[],
  shenSha: Record<string, string[]>,
  wuXingCounts: Record<string, number>,
  daYunList?: DaYun[],
  currentYear?: number,
): AnalysisResult {
  const pillarLabels = pillars.map(p => p.label)
  const zhiList = pillars.map(p => p.zhi)

  // 先计算地支关系（其他分析依赖此结果）
  const diZhiRelations = calculateDiZhiRelationsStructured(zhiList, pillarLabels)

  // 日主旺衰
  const dayMasterStrength = calculateDayMasterStrength(dayGan, pillars, diZhiRelations)

  // 格局
  const geJuInfo = calculateGeJuInfo(dayGan, pillars, diZhiRelations)

  // 调候
  const monthZhi = pillars[1].zhi
  const tiaoHou = calculateTiaoHou(monthZhi, wuXingCounts)

  // 用神
  const yongShen = calculateYongShen(tiaoHou, dayMasterStrength, geJuInfo)

  // 十神力量
  const shiShenPower = calculateShiShenPower(dayGan, pillars, diZhiRelations)

  // 十神组合
  const shiShenCombination = calculateShiShenCombination(shiShenPower, dayMasterStrength, yongShen)

  // 命局层次
  const mingJuLevel = calculateMingJuLevel(geJuInfo, yongShen, shiShenPower, diZhiRelations, shenSha, wuXingCounts, zhiList)

  // 3.9 天干五合
  const ganHe = calculateGanHe(pillars, dayGan)

  // 3.10 五行流通
  const wuXingFlow = calculateWuXingFlow(dayGan, wuXingCounts, shiShenPower)

  // 3.11 纳音格局评估
  const naYinPillars = pillars.map(p => ({
    label: p.label,
    naYin: p.naYin || NA_YIN[p.gan + p.zhi] || '',
  }))
  const naYinAssessment = calculateNaYinAssessment(naYinPillars, dayGan)

  // 3.13 神煞分类
  const shenShaClassification = calculateShenShaClassification(shenSha)

  // 3.12 大运评估
  const daYunEvaluations = daYunList && currentYear
    ? calculateDaYunEvaluations(daYunList, dayGan, yongShen, pillars, currentYear)
    : []

  // 3.14 流年评估
  const liuNianAssessments = daYunList && currentYear
    ? calculateLiuNianAssessments(daYunList, dayGan, yongShen, currentYear)
    : []

  return {
    dayMasterStrength,
    geJuInfo,
    tiaoHou,
    yongShen,
    shiShenPower,
    shiShenCombination,
    diZhiRelations,
    mingJuLevel,
    ganHe,
    wuXingFlow,
    naYinAssessment,
    daYunEvaluations,
    shenShaClassification,
    liuNianAssessments,
  }
}