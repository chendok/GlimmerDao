/**
 * 八字命理算法 —— 全项目唯一权威来源
 *
 * 十神、日主强弱、格局、五行分布等八字核心算法，
 * 从 BaziResult.tsx / BaziInfoModal.tsx / FeatureContent.tsx 中收敛而来，
 * 消除三处重复实现。
 */
import {
  GAN_YIN_YANG,
  GAN_WX,
  ZHI_WX,
  WX_SHENG,
  WX_SHENG_BY,
  YUE_LING_WANG_SHUAI,
  ZHI_BEN_QI,
  ZANG_GAN,
  WANG_LEVEL_SCORE,
  CHANG_SHENG_MAP,
  STRONG_CHANG_SHENG,
  MEDIUM_CHANG_SHENG,
} from './mingli'

export interface BaziPillar {
  gan: string
  zhi: string
  /** 藏干（可选） */
  zangGan?: string[]
}

export interface BaziFourPillars {
  yearPillar: BaziPillar
  monthPillar: BaziPillar
  dayPillar: BaziPillar
  hourPillar: BaziPillar
}

/** 计算十神：otherGan 相对于 dayGan 的十神关系 */
export function getShiShen(dayGan: string, otherGan: string): string {
  const dayWx = GAN_WX[dayGan]
  const otherWx = GAN_WX[otherGan]
  const dayYY = GAN_YIN_YANG[dayGan]
  const otherYY = GAN_YIN_YANG[otherGan]
  const sameYY = dayYY === otherYY
  if (dayWx === otherWx) return sameYY ? '比肩' : '劫财'
  if (WX_SHENG_BY[dayWx] === otherWx) return sameYY ? '偏印' : '正印'
  if (WX_SHENG[dayWx] === otherWx) return sameYY ? '食神' : '伤官'
  if (WX_SHENG[otherWx] === dayWx) return sameYY ? '偏财' : '正财'
  return sameYY ? '七杀' : '正官'
}

/** 日主强弱结果 */
export interface StrengthResult {
  level: string   // 身强 / 身弱 / 从强 / 从弱 / 中和
  score: number   // 0-100
  detail: string  // 简要说明
}

/**
 * 计算日主强弱（完整版算法，含藏干印星加分）
 *
 * 评分构成：月令旺衰(40) + 天干帮扶(25) + 地支通根(25) + 藏干印星(10)
 */
export function calcDayMasterStrength(
  dayGan: string,
  monthZhi: string,
  yearPillar: BaziPillar,
  monthPillar: BaziPillar,
  hourPillar: BaziPillar,
): StrengthResult {
  const dayWx = GAN_WX[dayGan]
  let score = 0

  // 1. 月令旺衰 (40分)
  const monthState = YUE_LING_WANG_SHUAI[monthZhi]?.[dayWx] || '休'
  score += WANG_LEVEL_SCORE[monthState] || 20

  // 2. 天干帮扶 (25分) - 年干/月干/时干中的比劫和印星
  const otherGans = [yearPillar.gan, monthPillar.gan, hourPillar.gan]
  for (const gan of otherGans) {
    if (!gan) continue
    const ss = getShiShen(dayGan, gan)
    if (ss === '比肩' || ss === '劫财') score += 8
    else if (ss === '正印' || ss === '偏印') score += 5
  }

  // 3. 地支通根 (25分) - 年支/月支/时支
  const otherZhis = [yearPillar.zhi, monthPillar.zhi, hourPillar.zhi]
  for (const zhi of otherZhis) {
    if (!zhi) continue
    // 地支五行与日干同五行
    if (ZHI_WX[zhi] === dayWx) score += 8
    // 十二长生状态加分
    const cs = CHANG_SHENG_MAP[dayGan]?.[zhi]
    if (cs && STRONG_CHANG_SHENG.has(cs)) score += 5
    else if (cs && MEDIUM_CHANG_SHENG.has(cs)) score += 3
  }

  // 4. 藏干印星 (10分) - 月支藏干中的印星和比劫
  const monthZangGan = ZANG_GAN[monthZhi] || []
  for (const zg of monthZangGan) {
    const ss = getShiShen(dayGan, zg)
    if (ss === '正印' || ss === '偏印') score += 4
    else if (ss === '比肩' || ss === '劫财') score += 3
  }

  // 判定强弱等级
  let level: string
  let detail: string
  if (score >= 75) {
    level = '身强'
    detail = score >= 85 ? '日主极旺，得令得地' : '日主偏强，得令有助'
  } else if (score >= 55) {
    level = '中和'
    detail = '日主中和，不弱不强'
  } else if (score >= 30) {
    level = '身弱'
    detail = '日主偏弱，失令少助'
  } else {
    level = '身弱'
    detail = '日主衰弱，急需生扶'
  }

  return { level, score, detail }
}

/** 计算格局名称（月令本气十神格） */
export function calcPattern(dayGan: string, monthZhi: string): string {
  const benQi = ZHI_BEN_QI[monthZhi]
  if (!benQi) return '—'
  return getShiShen(dayGan, benQi) + '格'
}

/** 统计五行分布（天干 + 地支本气 + 藏干） */
export function countWuXing(pillars: BaziFourPillars): Record<string, number> {
  const counts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  const list = [pillars.yearPillar, pillars.monthPillar, pillars.dayPillar, pillars.hourPillar]
  for (const p of list) {
    if (GAN_WX[p.gan]) counts[GAN_WX[p.gan]]++
    if (ZHI_WX[p.zhi]) counts[ZHI_WX[p.zhi]]++
    for (const cg of (p.zangGan || [])) {
      if (GAN_WX[cg]) counts[GAN_WX[cg]]++
    }
  }
  return counts
}
