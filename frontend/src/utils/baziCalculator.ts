/**
 * 八字计算器
 * 使用 lunar-javascript（6tail）作为核心计算引擎
 * 有日期的场景全部使用 EightChar 原生方法；大运和四柱输入模式（无日期）保留必要映射表
 */
import { Solar } from 'lunar-javascript'
import type { EightChar } from 'lunar-javascript'
import { calculateAnalysis, calculateDiZhiRelationsStructured, getSimpleDayMasterStrength, type AnalysisResult } from './baziAnalysis'

// 命理基础常量统一从 core/mingli 导入并 re-export，保持向后兼容
import {
  TIAN_GAN,
  DI_ZHI,
  GAN_YIN_YANG,
  ZHI_YIN_YANG,
  GAN_WX,
  ZHI_WX,
  WU_XING_COLOR,
  WX_SHENG,
  WX_SHENG_BY,
  WX_KE,
  ZANG_GAN,
  ZHI_BEN_QI,
  NA_YIN,
  CHANG_SHENG_MAP,
  STRONG_CHANG_SHENG,
  MEDIUM_CHANG_SHENG,
  SHENG_XIAO,
} from '../core/mingli'
export {
  TIAN_GAN,
  DI_ZHI,
  GAN_YIN_YANG,
  ZHI_YIN_YANG,
  GAN_WX,
  ZHI_WX,
  WU_XING_COLOR,
  WX_SHENG,
  WX_SHENG_BY,
  WX_KE,
  ZANG_GAN,
  ZHI_BEN_QI,
  NA_YIN,
  CHANG_SHENG_MAP,
  STRONG_CHANG_SHENG,
  MEDIUM_CHANG_SHENG,
  SHENG_XIAO,
}

export const SHI_SHEN: Record<string, Record<string, string>> = {
  '甲': { '甲': '比肩', '乙': '劫财', '丙': '食神', '丁': '伤官', '戊': '偏财', '己': '正财', '庚': '七杀', '辛': '正官', '壬': '偏印', '癸': '正印' },
  '乙': { '甲': '劫财', '乙': '比肩', '丙': '伤官', '丁': '食神', '戊': '正财', '己': '偏财', '庚': '正官', '辛': '七杀', '壬': '正印', '癸': '偏印' },
  '丙': { '甲': '偏印', '乙': '正印', '丙': '比肩', '丁': '劫财', '戊': '食神', '己': '伤官', '庚': '偏财', '辛': '正财', '壬': '七杀', '癸': '正官' },
  '丁': { '甲': '正印', '乙': '偏印', '丙': '劫财', '丁': '比肩', '戊': '伤官', '己': '食神', '庚': '正财', '辛': '偏财', '壬': '正官', '癸': '七杀' },
  '戊': { '甲': '七杀', '乙': '正官', '丙': '偏印', '丁': '正印', '戊': '比肩', '己': '劫财', '庚': '食神', '辛': '伤官', '壬': '偏财', '癸': '正财' },
  '己': { '甲': '正官', '乙': '七杀', '丙': '正印', '丁': '偏印', '戊': '劫财', '己': '比肩', '庚': '伤官', '辛': '食神', '壬': '正财', '癸': '偏财' },
  '庚': { '甲': '偏财', '乙': '正财', '丙': '七杀', '丁': '正官', '戊': '偏印', '己': '正印', '庚': '比肩', '辛': '劫财', '壬': '食神', '癸': '伤官' },
  '辛': { '甲': '正财', '乙': '偏财', '丙': '正官', '丁': '七杀', '戊': '正印', '己': '偏印', '庚': '劫财', '辛': '比肩', '壬': '伤官', '癸': '食神' },
  '壬': { '甲': '食神', '乙': '伤官', '丙': '偏财', '丁': '正财', '戊': '七杀', '己': '正官', '庚': '偏印', '辛': '正印', '壬': '比肩', '癸': '劫财' },
  '癸': { '甲': '伤官', '乙': '食神', '丙': '正财', '丁': '偏财', '戊': '正官', '己': '七杀', '庚': '正印', '辛': '偏印', '壬': '劫财', '癸': '比肩' },
}

// 旬空亡：六十甲子每旬10个干支，缺少的2个地支即为该旬空亡
// 旬首地支 = (地支索引 - 天干索引 + 12) % 12，空亡为旬首地支前两个
function calculateXunKong(ganZhi: string): string[] {
  const gan = ganZhi.slice(0, -1)
  const zhi = ganZhi.slice(-1)
  const ganIdx = TIAN_GAN.indexOf(gan)
  const zhiIdx = DI_ZHI.indexOf(zhi)
  if (ganIdx < 0 || zhiIdx < 0) return []
  const xunStartZhi = (zhiIdx - ganIdx + 12) % 12
  const kong1 = DI_ZHI[(xunStartZhi - 2 + 12) % 12]
  const kong2 = DI_ZHI[(xunStartZhi - 1 + 12) % 12]
  return [kong1, kong2]
}

// 十二长生名称（传统命理规则，lunar 无独立 gan-zhi 接口）
const CHANG_SHENG_NAMES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']

// 十二长生起始索引（传统命理规则）
const CHANG_SHENG_START: Record<string, number> = {
  '甲': 2, '乙': 6,
  '丙': 3, '丁': 9,
  '戊': 3, '己': 9,
  '庚': 6, '辛': 0,
  '壬': 8, '癸': 4,
}

// 十二长生计算（用于自坐 zizuo，EightChar 仅提供日干地势，无独立干支地势接口）
function getChangSheng(gan: string, zhi: string): string {
  const zhiIndex = DI_ZHI.indexOf(zhi)
  const startIndex = CHANG_SHENG_START[gan] ?? 0
  const isYang = ['甲', '丙', '戊', '庚', '壬'].includes(gan)
  let step: number
  if (isYang) {
    step = (zhiIndex - startIndex + 12) % 12
  } else {
    step = (startIndex - zhiIndex + 12) % 12
  }
  return CHANG_SHENG_NAMES[step]
}

export interface PillarInfo {
  gan: string
  zhi: string
  naYin: string
  wuXing: string
  zangGan: string[]
  shishen: string[]
  zhuXing: string
  fuXing: string[]
  xingYun: string
  zizuo: string
  kongWang: string[]
}

export interface DaYun {
  index: number
  gan: string
  zhi: string
  startYear: number
  endYear: number
  startAge: number
  endAge: number
  zhuXing: string
  fuXing: string[]
}

export interface LiuNian {
  year: number
  gan: string
  zhi: string
  naYin: string
  wuXing: string
  zhuXing: string
  fuXing: string[]
}

export interface LiuYue {
  month: number
  gan: string
  zhi: string
  naYin: string
  wuXing: string
  zhuXing: string
  fuXing: string[]
}

export interface LiuRi {
  day: number
  gan: string
  zhi: string
  naYin: string
  wuXing: string
  zhuXing: string
  fuXing: string[]
  weekday: number
  isToday: boolean
}

export interface LiuShi {
  hourIndex: number
  gan: string
  zhi: string
  naYin: string
  wuXing: string
  zhuXing: string
  fuXing: string[]
}

export interface BaziResult {
  name: string
  gender: '男' | '女'
  year: number
  month: number
  day: number
  hour: number
  minute: number
  birthplace?: string
  solarDate: string
  trueSolarTime: number
  trueSolarTimeStr: string
  birthYear: number
  birthMonth: number
  birthDay: number
  birthHour: number
  birthMinute: number
  yearPillar: PillarInfo
  monthPillar: PillarInfo
  dayPillar: PillarInfo
  hourPillar: PillarInfo
  shenSha: Record<string, string[]>
  daYunList: DaYun[]
  liuNianList: LiuNian[]
  liuYueList: LiuYue[]
  diZhiRelations: string[]
  lunarMonthZhi: string
  qiYunInfo: {
    years: number
    months: number
    days: number
    startAge: number
    totalDays: number
  }
  /** 命宫干支（如 "丙午"） */
  mingGong: string
  /** 身宫干支（如 "戊申"） */
  shenGong: string
  /** 胎元干支（如 "乙卯"） */
  taiYuan: string
  /** 农历日期字符串（如 "甲寅年七月初二日 未时"） */
  lunarDate: string
  /** 预计算分析结果 */
  analysis?: AnalysisResult
}

/**
 * 真太阳时计算（天文算法，lunar-javascript 不提供此功能）
 * 真太阳时 = 平太阳时 + 均时差 + (经度 - 时区经度) × 4分钟/度
 * 中国标准时区经度为120°E（东八区）
 */
export function getTrueSolarTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0,
  longitude: number = 120,
): number {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
    daysInMonth[1] = 29
  }
  let dayOfYear = day
  for (let i = 0; i < month - 1; i++) {
    dayOfYear += daysInMonth[i]
  }

  const B = (2 * Math.PI * (dayOfYear - 1)) / 365
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(B) - 0.032077 * Math.sin(B)
    - 0.014615 * Math.cos(2 * B) - 0.040849 * Math.sin(2 * B))

  const standardLongitude = 120
  const longitudeAdjust = (longitude - standardLongitude) * 4

  const clockMinutes = hour * 60 + minute
  const trueSolarMinutes = clockMinutes + eot + longitudeAdjust

  return trueSolarMinutes / 60
}

/**
 * 年柱计算（使用 lunar-javascript）
 * 以立春为分界
 */
export function getYearGanZhi(year: number, month: number, day: number): { gan: string; zhi: string } {
  const solar = Solar.fromYmdHms(year, month, day, 12, 0, 0)
  const eightChar = solar.getLunar().getEightChar()
  return {
    gan: eightChar.getYearGan(),
    zhi: eightChar.getYearZhi(),
  }
}

/**
 * 月柱计算（使用 lunar-javascript）
 * 以节为分界
 */
export function getMonthGanZhi(year: number, month: number, day: number): { gan: string; zhi: string } {
  const solar = Solar.fromYmdHms(year, month, day, 12, 0, 0)
  const eightChar = solar.getLunar().getEightChar()
  return {
    gan: eightChar.getMonthGan(),
    zhi: eightChar.getMonthZhi(),
  }
}

/**
 * 日柱计算（使用 lunar-javascript）
 */
export function getDayGanZhi(year: number, month: number, day: number): { gan: string; zhi: string } {
  const solar = Solar.fromYmdHms(year, month, day, 12, 0, 0)
  const eightChar = solar.getLunar().getEightChar()
  return {
    gan: eightChar.getDayGan(),
    zhi: eightChar.getDayZhi(),
  }
}

/**
 * 时柱计算（使用 lunar-javascript）
 * 23:00 属于次日早子时，自动使用次日日期
 */
export function getHourGanZhi(year: number, month: number, day: number, hour: number, minute: number = 0): { gan: string; zhi: string } {
  let useYear = year, useMonth = month, useDay = day
  if (hour >= 23) {
    const nextDay = new Date(year, month - 1, day + 1)
    useYear = nextDay.getFullYear()
    useMonth = nextDay.getMonth() + 1
    useDay = nextDay.getDate()
  }
  const solar = Solar.fromYmdHms(useYear, useMonth, useDay, hour, minute, 0)
  const eightChar = solar.getLunar().getEightChar()
  return {
    gan: eightChar.getTimeGan(),
    zhi: eightChar.getTimeZhi(),
  }
}

/**
 * 四柱干支 → 公历日期反推结果
 */
export interface FourPillarSolarMatch {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * 根据四柱干支（年柱/月柱/日柱/时柱）反推公历日期。
 *
 * 四柱干支与公历日期并非一一对应（干支按 60 循环），
 * 因此本函数在 [startYear, endYear] 范围内遍历所有候选日期，
 * 返回所有同时满足四柱干支的匹配结果（通常唯一）。
 *
 * 匹配口径与 calculateBazi 保持一致：使用 EightChar 的
 * getYearGan/getMonthGan/getDayGan/getTimeGan（节气月、立春年界）。
 */
export function resolveFourPillarsToSolar(
  yearGan: string,
  yearZhi: string,
  monthGan: string,
  monthZhi: string,
  dayGan: string,
  dayZhi: string,
  hourGan: string,
  hourZhi: string,
  startYear = 1900,
  endYear = 2100,
): FourPillarSolarMatch[] {
  const matches: FourPillarSolarMatch[] = []

  // 1. 确定候选年份：年柱干支按 60 年循环，在范围内约 3~4 个候选年份。
  //    注意：年柱以立春分界，可能跨越两个公历年份（如年柱「己卯」覆盖
  //    1999 立春后 ~ 2000 立春前）。因此同时检查「年中 7 月 1 日」与
  //    「年初 1 月 1 日」两个时点的年柱，避免漏掉跨年边界年份。
  const candidateYears: number[] = []
  for (let y = startYear; y <= endYear; y++) {
    const ecMid = Solar.fromYmdHms(y, 7, 1, 12, 0, 0).getLunar().getEightChar()
    const ecStart = Solar.fromYmdHms(y, 1, 1, 12, 0, 0).getLunar().getEightChar()
    const midMatch = ecMid.getYearGan() === yearGan && ecMid.getYearZhi() === yearZhi
    const startMatch = ecStart.getYearGan() === yearGan && ecStart.getYearZhi() === yearZhi
    if (midMatch || startMatch) {
      candidateYears.push(y)
    }
  }

  // 2. 对每个候选年份，遍历全年每天，匹配日柱 + 月柱；再匹配时柱。
  //    月柱严格匹配失败时降级为「忽略月柱」（月柱按节气/五虎遁推导，
  //    用户手动输入可能产生不存在的组合），保证尽量反推出日期。
  const collectMatches = (strictMonth: boolean): FourPillarSolarMatch[] => {
    const result: FourPillarSolarMatch[] = []
    for (const y of candidateYears) {
      // 年柱边界：立春前后，某天的实际年柱可能属于相邻年份。
      // 因此扫描范围扩展到上一年 12 月 1 日到下一年 1 月 31 日，
      // 用每天的实际年柱精确过滤。
      const scanStart = new Date(y - 1, 11, 1) // 上一年 12 月 1 日
      const scanEnd = new Date(y + 1, 0, 31) // 下一年 1 月 31 日

      for (let t = scanStart.getTime(); t <= scanEnd.getTime(); t += 24 * 3600 * 1000) {
        const dt = new Date(t)
        const Y = dt.getFullYear()
        const M = dt.getMonth() + 1
        const D = dt.getDate()

        // 日柱干支
        const dayEc = Solar.fromYmdHms(Y, M, D, 12, 0, 0).getLunar().getEightChar()
        if (dayEc.getDayGan() !== dayGan || dayEc.getDayZhi() !== dayZhi) continue
        // 年柱干支（精确过滤，处理立春边界）
        if (dayEc.getYearGan() !== yearGan || dayEc.getYearZhi() !== yearZhi) continue
        // 月柱干支（节气月；降级时忽略）
        if (strictMonth && (dayEc.getMonthGan() !== monthGan || dayEc.getMonthZhi() !== monthZhi)) continue

        // 时柱：遍历 24 小时匹配（时柱由日干 + 时辰决定）
        for (let h = 0; h < 24; h++) {
          const hourEc = Solar.fromYmdHms(Y, M, D, h, 0, 0).getLunar().getEightChar()
          if (hourEc.getTimeGan() === hourGan && hourEc.getTimeZhi() === hourZhi) {
            result.push({ year: Y, month: M, day: D, hour: h, minute: 0 })
          }
        }
      }
    }
    return result
  }

  // 优先严格匹配（含月柱）；无结果时降级忽略月柱
  let result = collectMatches(true)
  if (result.length === 0) {
    result = collectMatches(false)
  }

  // 去重：相邻候选年份的扫描范围重叠，可能产生重复匹配
  const seen = new Set<string>()
  return result.filter((m) => {
    const key = `${m.year}-${m.month}-${m.day}-${m.hour}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── 神煞映射表（传统命理规则） ──
// 八字神煞基于天干地支之间的关系计算，采用传统命理规则和国际标准

// 天乙贵人（仅日干，子平法标准）
const SHENSHA_TIANYI: Record<string, string[]> = {
  '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'],
  '乙': ['子', '申'], '己': ['子', '申'],
  '丙': ['亥', '酉'], '丁': ['亥', '酉'],
  '壬': ['卯', '巳'], '癸': ['卯', '巳'],
  '辛': ['午', '寅'],
}

// 太极贵人（日干+年干）
const SHENSHA_TAIJI: Record<string, string[]> = {
  '甲': ['子', '午'], '乙': ['子', '午'],
  '丙': ['酉', '卯'], '丁': ['酉', '卯'],
  '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'],
  '庚': ['寅', '亥'], '辛': ['寅', '亥'],
  '壬': ['巳', '申'], '癸': ['巳', '申'],
}

// 文昌贵人（日干+年干）
const SHENSHA_WENCHANG: Record<string, string[]> = {
  '甲': ['巳', '午'], '乙': ['巳', '午'],
  '丙': ['申'], '戊': ['申'],
  '丁': ['酉'], '己': ['酉'],
  '庚': ['亥'], '辛': ['子'],
  '壬': ['寅'], '癸': ['卯'],
}

// 禄神（日干）
const SHENSHA_LU: Record<string, string> = {
  '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午',
  '戊': '巳', '己': '午', '庚': '申', '辛': '酉',
  '壬': '亥', '癸': '子',
}

// 羊刃（日干）
const SHENSHA_YANGREN: Record<string, string> = {
  '甲': '卯', '乙': '寅', '丙': '午', '丁': '巳',
  '戊': '午', '己': '巳', '庚': '酉', '辛': '申',
  '壬': '子', '癸': '亥',
}

// 桃花/咸池（日支+年支）
const SHENSHA_TAOHUA: Record<string, string> = {
  '申': '酉', '子': '酉', '辰': '酉',
  '亥': '子', '卯': '子', '未': '子',
  '寅': '卯', '午': '卯', '戌': '卯',
  '巳': '午', '酉': '午', '丑': '午',
}

// 将星（日支+年支）
const SHENSHA_JIANGXING: Record<string, string> = {
  '寅': '午', '午': '午', '戌': '午',
  '亥': '卯', '卯': '卯', '未': '卯',
  '申': '子', '子': '子', '辰': '子',
  '巳': '酉', '酉': '酉', '丑': '酉',
}

// 华盖（日支+年支）
const SHENSHA_HUAGAI: Record<string, string> = {
  '寅': '戌', '午': '戌', '戌': '戌',
  '亥': '未', '卯': '未', '未': '未',
  '申': '辰', '子': '辰', '辰': '辰',
  '巳': '丑', '酉': '丑', '丑': '丑',
}

// 驿马（日支+年支）
const SHENSHA_YIMA: Record<string, string> = {
  '申': '寅', '子': '寅', '辰': '寅',
  '亥': '巳', '卯': '巳', '未': '巳',
  '寅': '申', '午': '申', '戌': '申',
  '巳': '亥', '酉': '亥', '丑': '亥',
}

// 天德贵人（月支 → 天干）
const SHENSHA_TIANDDE: Record<string, string> = {
  '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛',
  '午': '亥', '未': '甲', '申': '癸', '酉': '寅',
  '戌': '丙', '亥': '乙', '子': '丙', '丑': '庚',
}

// 月德贵人（月支 → 天干）
const SHENSHA_YUEDE: Record<string, string> = {
  '寅': '丙', '卯': '甲', '辰': '壬', '巳': '庚',
  '午': '丙', '未': '甲', '申': '壬', '酉': '庚',
  '戌': '丙', '亥': '甲', '子': '壬', '丑': '庚',
}

// 福星贵人（日干）——《渊海子平》标准查法
// 甲丙见寅或子，乙癸见卯或丑，戊见申，己见未，丁见亥，庚见午，辛见巳，壬见辰
const SHENSHA_FUXINGGUIREN: Record<string, string[]> = {
  '甲': ['寅', '子'], '乙': ['卯', '丑'], '丙': ['寅', '子'], '丁': ['亥', '酉'],
  '戊': ['申'], '己': ['未'], '庚': ['午'], '辛': ['巳'],
  '壬': ['辰'], '癸': ['卯', '丑'],
}

// 亡神（日支+年支）
const SHENSHA_WANGSHEN: Record<string, string> = {
  '寅': '巳', '午': '巳', '戌': '巳',
  '亥': '申', '卯': '申', '未': '申',
  '申': '亥', '子': '亥', '辰': '亥',
  '巳': '寅', '酉': '寅', '丑': '寅',
}

// 劫煞（日支+年支）
const SHENSHA_JIESHA: Record<string, string> = {
  '寅': '亥', '午': '亥', '戌': '亥',
  '亥': '寅', '卯': '寅', '未': '寅',
  '申': '巳', '子': '巳', '辰': '巳',
  '巳': '申', '酉': '申', '丑': '申',
}

// 灾煞（日支+年支）
const SHENSHA_ZAISHA: Record<string, string> = {
  '寅': '子', '午': '子', '戌': '子',
  '亥': '卯', '卯': '卯', '未': '卯',
  '申': '午', '子': '午', '辰': '午',
  '巳': '酉', '酉': '酉', '丑': '酉',
}

// 勾煞（日支）
const SHENSHA_GOUSHA: Record<string, string> = {
  '子': '卯', '寅': '巳', '辰': '未', '午': '酉', '申': '亥', '戌': '丑',
}

// 绞煞（日支）
const SHENSHA_JIAOSHA: Record<string, string> = {
  '子': '酉', '寅': '亥', '辰': '丑', '午': '卯', '申': '巳', '戌': '未',
}

// 孤辰（日支+年支）
const SHENSHA_GUCHEN: Record<string, string> = {
  '寅': '巳', '午': '巳', '戌': '巳',
  '亥': '申', '卯': '申', '未': '申',
  '申': '亥', '子': '亥', '辰': '亥',
  '巳': '寅', '酉': '寅', '丑': '寅',
}

// 寡宿（日支+年支）
const SHENSHA_GUASU: Record<string, string> = {
  '寅': '丑', '午': '丑', '戌': '丑',
  '亥': '辰', '卯': '辰', '未': '辰',
  '申': '未', '子': '未', '辰': '未',
  '巳': '戌', '酉': '戌', '丑': '戌',
}

// 红鸾（日支）
const SHENSHA_HONGLUAN: Record<string, string> = {
  '子': '卯', '丑': '寅', '寅': '丑', '卯': '子',
  '辰': '亥', '巳': '戌', '午': '酉', '未': '申',
  '申': '未', '酉': '午', '戌': '巳', '亥': '辰',
}

// 天喜（日支）
const SHENSHA_TIANXI: Record<string, string> = {
  '子': '酉', '丑': '申', '寅': '未', '卯': '午',
  '辰': '巳', '巳': '辰', '午': '卯', '未': '寅',
  '申': '丑', '酉': '子', '戌': '亥', '亥': '戌',
}

// 破碎（日支）
const SHENSHA_POSUI: Record<string, string> = {
  '子': '酉', '丑': '辰', '寅': '亥', '卯': '午',
  '辰': '丑', '巳': '申', '午': '卯', '未': '戌',
  '申': '巳', '酉': '子', '戌': '未', '亥': '寅',
}

// 金刚
const SHENSHA_JINGANG: Record<string, boolean> = { '庚辰': true, '庚戌': true, '壬辰': true, '戊戌': true }

// 金舆（日干）
const SHENSHA_JINYU: Record<string, string> = {
  '甲': '辰', '乙': '巳', '丙': '午', '丁': '未',
  '戊': '午', '己': '未', '庚': '申', '辛': '酉',
  '壬': '亥', '癸': '子',
}

// ── 新增神煞映射表 ──

// 红艳煞（日干 → 地支）
const SHENSHA_HONGYAN: Record<string, string> = {
  '甲': '午', '乙': '申', '丙': '寅', '丁': '未',
  '戊': '辰', '己': '辰', '庚': '戌', '辛': '酉',
  '壬': '子', '癸': '申',
}

// 天厨贵人（日干 → 地支）
const SHENSHA_TIANCHU: Record<string, string> = {
  '甲': '巳', '乙': '午', '丙': '子', '丁': '巳',
  '戊': '午', '己': '申', '庚': '寅', '辛': '午',
  '壬': '酉', '癸': '亥',
}

// 德秀贵人（月支 → 天干）
// 寅卯辰月: 丙丁为德, 戊己为秀; 巳午未月: 庚辛为德, 壬癸为秀
// 申酉戌月: 壬癸为德, 甲乙为秀; 亥子丑月: 甲乙为德, 丙丁为秀
const SHENSHA_DEXIU_DE: Record<string, string[]> = {
  '寅': ['丙', '丁'], '卯': ['丙', '丁'], '辰': ['丙', '丁'],
  '巳': ['庚', '辛'], '午': ['庚', '辛'], '未': ['庚', '辛'],
  '申': ['壬', '癸'], '酉': ['壬', '癸'], '戌': ['壬', '癸'],
  '亥': ['甲', '乙'], '子': ['甲', '乙'], '丑': ['甲', '乙'],
}
const SHENSHA_DEXIU_XIU: Record<string, string[]> = {
  '寅': ['戊', '己'], '卯': ['戊', '己'], '辰': ['戊', '己'],
  '巳': ['壬', '癸'], '午': ['壬', '癸'], '未': ['壬', '癸'],
  '申': ['甲', '乙'], '酉': ['甲', '乙'], '戌': ['甲', '乙'],
  '亥': ['丙', '丁'], '子': ['丙', '丁'], '丑': ['丙', '丁'],
}

// 国印贵人（日干 → 地支）
const SHENSHA_GUOYIN: Record<string, string> = {
  '甲': '戌', '乙': '亥', '丙': '丑', '丁': '寅',
  '戊': '丑', '己': '寅', '庚': '辰', '辛': '巳',
  '壬': '未', '癸': '申',
}

// 披麻（年支 → 地支）
const SHENSHA_PIMA: Record<string, string> = {
  '子': '酉', '丑': '戌', '寅': '亥', '卯': '子',
  '辰': '丑', '巳': '寅', '午': '卯', '未': '辰',
  '申': '巳', '酉': '午', '戌': '未', '亥': '申',
}

// 丧门（年支 → 地支）
const SHENSHA_SANGMEN: Record<string, string> = {
  '子': '寅', '丑': '卯', '寅': '辰', '卯': '巳',
  '辰': '午', '巳': '未', '午': '申', '未': '酉',
  '申': '戌', '酉': '亥', '戌': '子', '亥': '丑',
}

// 天医（月支 → 地支，前一位）
const SHENSHA_TIANYI_MONTH: Record<string, string> = {
  '寅': '丑', '卯': '寅', '辰': '卯', '巳': '辰',
  '午': '巳', '未': '午', '申': '未', '酉': '申',
  '戌': '酉', '亥': '戌', '子': '亥', '丑': '子',
}

// 十灵日（特定日柱干支）
const SHENGSHA_SHILING: Record<string, boolean> = {
  '甲辰': true, '乙亥': true, '丙辰': true, '丁酉': true,
  '戊午': true, '庚戌': true, '庚寅': true, '辛亥': true,
  '壬寅': true, '癸未': true,
}

// 九丑日（特定日柱干支）
const SHENGSHA_JIUCHOU: Record<string, boolean> = {
  '戊子': true, '戊午': true, '壬子': true, '壬午': true,
  '丁酉': true, '丁卯': true, '己酉': true, '己卯': true,
  '辛酉': true, '辛卯': true,
}

// 魁罡（特定日柱干支）
const SHENGSHA_KUIGANG: Record<string, boolean> = {
  '庚辰': true, '壬辰': true, '戊戌': true, '庚戌': true,
}

// 童子煞（农历月支 → 时支）
const SHENSHA_TONGZI_MONTH: Record<string, string> = {
  '寅': '巳', '卯': '午', '辰': '未', '巳': '申',
  '午': '酉', '未': '戌', '申': '亥', '酉': '子',
  '戌': '丑', '亥': '寅', '子': '卯', '丑': '辰',
}

// 天德合（月支 → 天干，天德合干）
const SHENSHA_TIANDDE_HE: Record<string, string> = {
  '寅': '壬', '卯': '巳', '辰': '丁', '巳': '丙',
  '午': '寅', '未': '己', '申': '戊', '酉': '亥',
  '戌': '辛', '亥': '庚', '子': '辛', '丑': '乙',
}

// 月德合（月支 → 天干，月德合干）
const SHENSHA_YUEDE_HE: Record<string, string> = {
  '寅': '辛', '卯': '己', '辰': '丁', '巳': '乙',
  '午': '辛', '未': '己', '申': '丁', '酉': '乙',
  '戌': '辛', '亥': '己', '子': '丁', '丑': '乙',
}

/**
 * 神煞计算（传统命理规则映射表）
 * 全面覆盖八字常用神煞类型
 * @param lunarMonthZhi 农历月支（用于童子煞等月支类神煞）
 */
function getShenSha(
  yearGan: string, yearZhi: string,
  monthGan: string, monthZhi: string,
  dayGan: string, dayZhi: string,
  hourGan: string, hourZhi: string,
  _month: number = 1,
  lunarMonthZhi: string = monthZhi,
): Record<string, string[]> {
  const shenSha: Record<string, string[]> = { '年柱': [], '月柱': [], '日柱': [], '时柱': [] }

  const addShenSha = (pillar: string, name: string) => {
    if (!shenSha[pillar].includes(name)) {
      shenSha[pillar].push(name)
    }
  }

  const pillars = [
    { key: '年柱', gan: yearGan, zhi: yearZhi },
    { key: '月柱', gan: monthGan, zhi: monthZhi },
    { key: '日柱', gan: dayGan, zhi: dayZhi },
    { key: '时柱', gan: hourGan, zhi: hourZhi },
  ]

  for (const p of pillars) {
    // ── 天干类神煞 ──
    // 天乙贵人（仅日干 → 地支，子平法标准）
    if (SHENSHA_TIANYI[dayGan]?.includes(p.zhi)) addShenSha(p.key, '天乙贵人')
    // 太极贵人（日干+年干 → 地支）
    if (SHENSHA_TAIJI[dayGan]?.includes(p.zhi)) addShenSha(p.key, '太极贵人')
    if (SHENSHA_TAIJI[yearGan]?.includes(p.zhi)) addShenSha(p.key, '太极贵人')
    // 文昌贵人（日干+年干 → 地支）
    if (SHENSHA_WENCHANG[dayGan]?.includes(p.zhi)) addShenSha(p.key, '文昌贵人')
    if (SHENSHA_WENCHANG[yearGan]?.includes(p.zhi)) addShenSha(p.key, '文昌贵人')
    // 禄神（日干 → 临官位）
    if (SHENSHA_LU[dayGan] === p.zhi) addShenSha(p.key, '禄神')
    // 羊刃（日干 → 帝旺位）
    if (SHENSHA_YANGREN[dayGan] === p.zhi) addShenSha(p.key, '羊刃')
    // 福星贵人（日干 → 地支）
    if (SHENSHA_FUXINGGUIREN[dayGan]?.includes(p.zhi)) addShenSha(p.key, '福星贵人')
    // 金舆（日干 → 地支）
    if (SHENSHA_JINYU[dayGan] === p.zhi) addShenSha(p.key, '金舆')
    // 红艳煞（日干 → 地支）
    if (SHENSHA_HONGYAN[dayGan] === p.zhi) addShenSha(p.key, '红艳煞')
    // 天厨贵人（日干 → 地支）
    if (SHENSHA_TIANCHU[dayGan] === p.zhi) addShenSha(p.key, '天厨贵人')
    // 国印贵人（日干 → 地支）
    if (SHENSHA_GUOYIN[dayGan] === p.zhi) addShenSha(p.key, '国印贵人')
    // ── 地支类神煞（年支为基准） ──
    if (SHENSHA_TAOHUA[yearZhi] === p.zhi) addShenSha(p.key, '桃花')
    if (SHENSHA_JIANGXING[yearZhi] === p.zhi) addShenSha(p.key, '将星')
    if (SHENSHA_YIMA[yearZhi] === p.zhi) addShenSha(p.key, '驿马')
    if (SHENSHA_WANGSHEN[yearZhi] === p.zhi) addShenSha(p.key, '亡神')
    if (SHENSHA_JIESHA[yearZhi] === p.zhi) addShenSha(p.key, '劫煞')
    if (SHENSHA_ZAISHA[yearZhi] === p.zhi) addShenSha(p.key, '灾煞')
    if (SHENSHA_GOUSHA[dayZhi] === p.zhi) addShenSha(p.key, '勾煞')
    if (SHENSHA_JIAOSHA[dayZhi] === p.zhi) addShenSha(p.key, '绞煞')
    if (SHENSHA_GUCHEN[yearZhi] === p.zhi) addShenSha(p.key, '孤辰')
    if (SHENSHA_GUASU[yearZhi] === p.zhi) addShenSha(p.key, '寡宿')
    if (SHENSHA_HONGLUAN[yearZhi] === p.zhi) addShenSha(p.key, '红鸾')
    if (SHENSHA_TIANXI[yearZhi] === p.zhi) addShenSha(p.key, '天喜')
    if (SHENSHA_POSUI[p.zhi] === yearZhi) addShenSha(p.key, '破碎')

    // ── 年支类神煞 ──
    if (SHENSHA_PIMA[yearZhi] === p.zhi) addShenSha(p.key, '披麻')
    if (SHENSHA_SANGMEN[yearZhi] === p.zhi) addShenSha(p.key, '丧门')

    // ── 月支类神煞 ──
    if (SHENSHA_TIANYI_MONTH[monthZhi] === p.zhi) addShenSha(p.key, '天医')

    // ── 德秀贵人（年支 → 天干） ──
    if (SHENSHA_DEXIU_DE[yearZhi]?.includes(p.gan)) addShenSha(p.key, '德秀贵人')
    if (SHENSHA_DEXIU_XIU[yearZhi]?.includes(p.gan)) addShenSha(p.key, '德秀贵人')

    // ── 特殊干支 ──
    if (SHENSHA_JINGANG[p.gan + p.zhi]) addShenSha(p.key, '金刚')
    if (SHENGSHA_KUIGANG[p.gan + p.zhi]) addShenSha(p.key, '魁罡')
  }

  // ── 月柱特殊：天德/月德贵人（月支 → 天干出现在月柱） ──
  if (SHENSHA_TIANDDE[monthZhi] === dayGan) addShenSha('月柱', '天德贵人')
  if (SHENSHA_TIANDDE[monthZhi] === yearGan) addShenSha('月柱', '天德贵人')
  if (SHENSHA_YUEDE[monthZhi] === dayGan) addShenSha('月柱', '月德贵人')
  if (SHENSHA_YUEDE[monthZhi] === yearGan) addShenSha('月柱', '月德贵人')
  // 天德合/月德合（月支 → 天干出现在月柱）
  if (SHENSHA_TIANDDE_HE[monthZhi] === monthGan) addShenSha('月柱', '天德合')
  if (SHENSHA_YUEDE_HE[monthZhi] === monthGan) addShenSha('月柱', '月德合')

  // ── 日柱特殊：十灵日、九丑日 ──
  if (SHENGSHA_SHILING[dayGan + dayZhi]) addShenSha('日柱', '十灵日')
  if (SHENGSHA_JIUCHOU[dayGan + dayZhi]) addShenSha('日柱', '九丑日')

  // ── 时柱特殊：童子煞（农历月支 → 时支） ──
  if (SHENSHA_TONGZI_MONTH[lunarMonthZhi] === hourZhi) addShenSha('时柱', '童子煞')

  // ── 空亡（仅以日柱旬空亡为准，子平法标准） ──
  const dayKongWang = calculateXunKong(dayGan + dayZhi)
  const kongWangSet = new Set(dayKongWang)
  for (const p of pillars) {
    if (kongWangSet.has(p.zhi)) {
      addShenSha(p.key, '空亡')
    }
  }

  return shenSha
}

export interface NatalContext {
  dayGan: string
  yearGan: string
  dayZhi: string
  yearZhi: string
  monthZhi: string
  monthGan: string
  lunarMonthZhi?: string
}

/**
 * 计算单个动态柱（大运/流年/流月/流日/流时）的神煞
 * 基于本命四柱信息查表
 */
export function getPillarShenSha(
  pillarGan: string,
  pillarZhi: string,
  natal: NatalContext,
): string[] {
  const result: string[] = []
  const add = (name: string) => {
    if (!result.includes(name)) result.push(name)
  }

  // ── 天干类神煞 ──
  if (SHENSHA_TIANYI[natal.dayGan]?.includes(pillarZhi)) add('天乙贵人')
  if (SHENSHA_TAIJI[natal.dayGan]?.includes(pillarZhi)) add('太极贵人')
  if (SHENSHA_TAIJI[natal.yearGan]?.includes(pillarZhi)) add('太极贵人')
  if (SHENSHA_WENCHANG[natal.dayGan]?.includes(pillarZhi)) add('文昌贵人')
  if (SHENSHA_WENCHANG[natal.yearGan]?.includes(pillarZhi)) add('文昌贵人')
  if (SHENSHA_LU[natal.dayGan] === pillarZhi) add('禄神')
  if (SHENSHA_YANGREN[natal.dayGan] === pillarZhi) add('羊刃')
  if (SHENSHA_FUXINGGUIREN[natal.dayGan]?.includes(pillarZhi)) add('福星贵人')
  if (SHENSHA_JINYU[natal.dayGan] === pillarZhi) add('金舆')
  if (SHENSHA_HONGYAN[natal.dayGan] === pillarZhi) add('红艳煞')
  if (SHENSHA_TIANCHU[natal.dayGan] === pillarZhi) add('天厨贵人')
  if (SHENSHA_GUOYIN[natal.dayGan] === pillarZhi) add('国印贵人')

  // ── 地支类神煞（年支为基准） ──
  if (SHENSHA_TAOHUA[natal.yearZhi] === pillarZhi) add('桃花')
  if (SHENSHA_JIANGXING[natal.yearZhi] === pillarZhi) add('将星')
  if (SHENSHA_HUAGAI[natal.yearZhi] === pillarZhi) add('华盖')
  if (SHENSHA_YIMA[natal.yearZhi] === pillarZhi) add('驿马')
  if (SHENSHA_WANGSHEN[natal.yearZhi] === pillarZhi) add('亡神')
  if (SHENSHA_JIESHA[natal.yearZhi] === pillarZhi) add('劫煞')
  if (SHENSHA_ZAISHA[natal.yearZhi] === pillarZhi) add('灾煞')
  if (SHENSHA_GOUSHA[natal.dayZhi] === pillarZhi) add('勾煞')
  if (SHENSHA_JIAOSHA[natal.dayZhi] === pillarZhi) add('绞煞')
  if (SHENSHA_GUCHEN[natal.yearZhi] === pillarZhi) add('孤辰')
  if (SHENSHA_GUASU[natal.yearZhi] === pillarZhi) add('寡宿')
  if (SHENSHA_HONGLUAN[natal.yearZhi] === pillarZhi) add('红鸾')
  if (SHENSHA_TIANXI[natal.yearZhi] === pillarZhi) add('天喜')

  // ── 年支类神煞 ──
  if (SHENSHA_PIMA[natal.yearZhi] === pillarZhi) add('披麻')
  if (SHENSHA_SANGMEN[natal.yearZhi] === pillarZhi) add('丧门')

  // ── 月支类神煞 ──
  if (SHENSHA_TIANYI_MONTH[natal.monthZhi] === pillarZhi) add('天医')

  // ── 德秀贵人（年支 → 天干） ──
  if (SHENSHA_DEXIU_DE[natal.yearZhi]?.includes(pillarGan)) add('德秀贵人')
  if (SHENSHA_DEXIU_XIU[natal.yearZhi]?.includes(pillarGan)) add('德秀贵人')

  // ── 空亡（仅以本命日柱旬空亡为准，子平法标准，与 getShenSha 保持一致） ──
  const natalDayKongWang = calculateXunKong(natal.dayGan + natal.dayZhi)
  if (natalDayKongWang.includes(pillarZhi)) {
    add('空亡')
  }

  return result
}

/**
 * 起运时间计算（使用 lunar-javascript）
 */
export function getQiYunInfo(
  _yearGZ: { gan: string; zhi: string },
  gender: '男' | '女',
  birthYear: number,
  birthMonth: number,
  birthDay: number,
): { years: number; months: number; days: number; startAge: number; totalDays: number } {
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, 12, 0, 0)
  const eightChar = solar.getLunar().getEightChar()
  const yun = eightChar.getYun(gender === '男' ? 1 : 0, 1)

  const years = yun.getStartYear()
  const months = yun.getStartMonth()
  const days = yun.getStartDay()
  const totalDays = years * 3 + Math.floor(months / 4) + Math.floor(days / 30)

  return {
    years,
    months,
    days,
    startAge: years + 1,
    totalDays,
  }
}

/**
 * 大运列表计算（使用 lunar-javascript）
 * 大运无具体日期，zhuXing/fuXing 使用映射表
 */
export function getDaYunList(
  yearGZ: { gan: string; zhi: string },
  _monthGZ: { gan: string; zhi: string },
  _dayGZ: { gan: string; zhi: string },
  gender: '男' | '女',
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  dayGan: string,
): { daYunList: DaYun[]; qiYun: ReturnType<typeof getQiYunInfo> } {
  const solar = Solar.fromYmdHms(birthYear, birthMonth, birthDay, 12, 0, 0)
  const eightChar = solar.getLunar().getEightChar()
  const yun = eightChar.getYun(gender === '男' ? 1 : 0, 1)
  const lunarDaYunList = yun.getDaYun(11)

  const qiYun = getQiYunInfo(yearGZ, gender, birthYear, birthMonth, birthDay)
  const result: DaYun[] = []

  for (let i = 1; i < lunarDaYunList.length && result.length < 10; i++) {
    const dy = lunarDaYunList[i]
    const ganZhi = dy.getGanZhi()
    if (!ganZhi) continue

    const gan = ganZhi[0]
    const zhi = ganZhi[1]

    result.push({
      index: result.length + 1,
      gan,
      zhi,
      startYear: dy.getStartYear(),
      endYear: dy.getEndYear(),
      startAge: dy.getStartAge(),
      endAge: dy.getEndAge(),
      zhuXing: SHI_SHEN[dayGan]?.[gan] || '',
      fuXing: (ZANG_GAN[zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '').filter(Boolean),
    })
  }

  return { daYunList: result, qiYun }
}

/**
 * 流年列表计算（使用 lunar-javascript）
 * naYin 使用 EightChar 原生方法；zhuXing/fuXin 相对本命日干，使用映射表
 */
export function getLiuNianList(startYear: number, dayGan: string): LiuNian[] {
  const result: LiuNian[] = []
  for (let year = startYear; year < startYear + 10; year++) {
    const solar = Solar.fromYmdHms(year, 6, 1, 12, 0, 0)
    const eightChar = solar.getLunar().getEightChar()
    const gan = eightChar.getYearGan()
    const zhi = eightChar.getYearZhi()
    result.push({
      year,
      gan,
      zhi,
      naYin: eightChar.getYearNaYin(),
      wuXing: GAN_WX[gan],
      zhuXing: SHI_SHEN[dayGan]?.[gan] || '',
      fuXing: (ZANG_GAN[zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '').filter(Boolean),
    })
  }
  return result
}

/**
 * 流月列表计算（使用 lunar-javascript）
 */
export function getLiuYueList(year: number, dayGan: string): LiuYue[] {
  const result: LiuYue[] = []
  for (let month = 1; month <= 12; month++) {
    const solar = Solar.fromYmdHms(year, month, 15, 12, 0, 0)
    const eightChar = solar.getLunar().getEightChar()
    const gan = eightChar.getMonthGan()
    const zhi = eightChar.getMonthZhi()
    result.push({
      month,
      gan,
      zhi,
      naYin: eightChar.getMonthNaYin(),
      wuXing: GAN_WX[gan],
      zhuXing: SHI_SHEN[dayGan]?.[gan] || '',
      fuXing: (ZANG_GAN[zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '').filter(Boolean),
    })
  }
  return result
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * 流日列表计算（使用 lunar-javascript）
 */
export function getLiuRiList(year: number, month: number, dayGan: string): LiuRi[] {
  const result: LiuRi[] = []
  const daysInMonthArr = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month === 2 && isLeapYear(year)) {
    daysInMonthArr[2] = 29
  }
  const daysInMonth = daysInMonthArr[month]

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month

  for (let day = 1; day <= daysInMonth; day++) {
    const solar = Solar.fromYmdHms(year, month, day, 12, 0, 0)
    const eightChar = solar.getLunar().getEightChar()
    const gan = eightChar.getDayGan()
    const zhi = eightChar.getDayZhi()
    const date = new Date(year, month - 1, day)
    result.push({
      day,
      gan,
      zhi,
      naYin: eightChar.getDayNaYin(),
      wuXing: GAN_WX[gan],
      zhuXing: SHI_SHEN[dayGan]?.[gan] || '',
      fuXing: (ZANG_GAN[zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '').filter(Boolean),
      weekday: date.getDay(),
      isToday: isCurrentMonth && today.getDate() === day,
    })
  }
  return result
}

/**
 * 流时列表计算（使用 lunar-javascript，逐时辰计算）
 */
export function getLiuShiList(year: number, month: number, day: number, dayGan: string): LiuShi[] {
  const result: LiuShi[] = []
  const hourMap = [23, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]

  for (let i = 0; i < 12; i++) {
    const hour = hourMap[i]
    let useYear = year, useMonth = month, useDay = day

    if (i === 0) {
      const nextDay = new Date(year, month - 1, day + 1)
      useYear = nextDay.getFullYear()
      useMonth = nextDay.getMonth() + 1
      useDay = nextDay.getDate()
    }

    const solar = Solar.fromYmdHms(useYear, useMonth, useDay, hour, 0, 0)
    const eightChar = solar.getLunar().getEightChar()
    const gan = eightChar.getTimeGan()
    const zhi = eightChar.getTimeZhi()

    result.push({
      hourIndex: i,
      gan,
      zhi,
      naYin: eightChar.getTimeNaYin(),
      wuXing: GAN_WX[gan],
      zhuXing: SHI_SHEN[dayGan]?.[gan] || '',
      fuXing: (ZANG_GAN[zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '').filter(Boolean),
    })
  }
  return result
}

/**
 * 从 EightChar 构建本命 PillarInfo（使用 lunar-javascript 原生方法）
 * 用于 calculateBazi，有完整日期
 */
function buildPillarFromEightChar(
  eightChar: EightChar,
  pillar: 'year' | 'month' | 'day' | 'time',
): PillarInfo {
  const gan = pillar === 'year' ? eightChar.getYearGan()
    : pillar === 'month' ? eightChar.getMonthGan()
    : pillar === 'day' ? eightChar.getDayGan()
    : eightChar.getTimeGan()

  const zhi = pillar === 'year' ? eightChar.getYearZhi()
    : pillar === 'month' ? eightChar.getMonthZhi()
    : pillar === 'day' ? eightChar.getDayZhi()
    : eightChar.getTimeZhi()

  const naYin = pillar === 'year' ? eightChar.getYearNaYin()
    : pillar === 'month' ? eightChar.getMonthNaYin()
    : pillar === 'day' ? eightChar.getDayNaYin()
    : eightChar.getTimeNaYin()

  const zangGan = pillar === 'year' ? eightChar.getYearHideGan()
    : pillar === 'month' ? eightChar.getMonthHideGan()
    : pillar === 'day' ? eightChar.getDayHideGan()
    : eightChar.getTimeHideGan()

  const shiShenGan = pillar === 'year' ? eightChar.getYearShiShenGan()
    : pillar === 'month' ? eightChar.getMonthShiShenGan()
    : pillar === 'day' ? eightChar.getDayShiShenGan()
    : eightChar.getTimeShiShenGan()

  const shiShenZhi = pillar === 'year' ? eightChar.getYearShiShenZhi()
    : pillar === 'month' ? eightChar.getMonthShiShenZhi()
    : pillar === 'day' ? eightChar.getDayShiShenZhi()
    : eightChar.getTimeShiShenZhi()

  const diShi = pillar === 'year' ? eightChar.getYearDiShi()
    : pillar === 'month' ? eightChar.getMonthDiShi()
    : pillar === 'day' ? eightChar.getDayDiShi()
    : eightChar.getTimeDiShi()

  const fuXing = (shiShenZhi || []).filter(Boolean)

  return {
    gan,
    zhi,
    naYin,
    wuXing: GAN_WX[gan],
    zangGan: zangGan || [],
    shishen: [shiShenGan, ...fuXing].filter(Boolean),
    zhuXing: shiShenGan || '',
    fuXing,
    xingYun: diShi || '',
    zizuo: getChangSheng(gan, zhi),
    kongWang: calculateXunKong(gan + zhi),
  }
}

/**
 * 从干支构建 PillarInfo（使用映射表）
 * 仅供大运动态列和 calculateBaziFromGZ 使用（无具体日期）
 */
export function buildPillarInfo(
  ganZhi: { gan: string; zhi: string },
  dayGan: string,
): PillarInfo {
  return {
    gan: ganZhi.gan,
    zhi: ganZhi.zhi,
    naYin: NA_YIN[ganZhi.gan + ganZhi.zhi] || '',
    wuXing: GAN_WX[ganZhi.gan],
    zangGan: ZANG_GAN[ganZhi.zhi] || [],
    shishen: [
      SHI_SHEN[dayGan]?.[ganZhi.gan] || '',
      ...(ZANG_GAN[ganZhi.zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '')
    ].filter(Boolean),
    zhuXing: SHI_SHEN[dayGan]?.[ganZhi.gan] || '',
    fuXing: (ZANG_GAN[ganZhi.zhi] || []).map(g => SHI_SHEN[dayGan]?.[g] || '').filter(Boolean),
    xingYun: getChangSheng(dayGan, ganZhi.zhi),
    zizuo: getChangSheng(ganZhi.gan, ganZhi.zhi),
    kongWang: calculateXunKong(ganZhi.gan + ganZhi.zhi),
  }
}

function getDiZhiRelations(zhiList: string[]): string[] {
  const relations: string[] = []
  const LIU_HE: Record<string, string> = {
    '子': '丑', '丑': '子', '寅': '亥', '亥': '寅',
    '卯': '戌', '戌': '卯', '辰': '酉', '酉': '辰',
    '巳': '申', '申': '巳', '午': '未', '未': '午',
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
  const SAN_HE: Record<string, string[]> = {
    '申子辰': ['申', '子', '辰'],
    '亥卯未': ['亥', '卯', '未'],
    '寅午戌': ['寅', '午', '戌'],
    '巳酉丑': ['巳', '酉', '丑'],
  }

  for (let i = 0; i < zhiList.length; i++) {
    for (let j = i + 1; j < zhiList.length; j++) {
      const a = zhiList[i], b = zhiList[j]
      if (LIU_HE[a] === b) relations.push(`${a}${b}六合`)
      if (LIU_CHONG[a] === b) relations.push(`${a}${b}六冲`)
      if (XIANG_HAI[a] === b) relations.push(`${a}${b}相害`)
    }
  }

  const sorted = [...zhiList].sort()
  for (const [name, san] of Object.entries(SAN_HE)) {
    if (san.every(s => sorted.includes(s))) {
      relations.push(`${name}三合局`)
    }
  }

  return relations
}

export function calculateBaziFromGZ(
  name: string,
  gender: '男' | '女',
  yearGan: string,
  yearZhi: string,
  monthGan: string,
  monthZhi: string,
  dayGan: string,
  dayZhi: string,
  hourGan: string,
  hourZhi: string,
  birthplace?: string,
): BaziResult {
  const yearGZ = { gan: yearGan, zhi: yearZhi }
  const monthGZ = { gan: monthGan, zhi: monthZhi }
  const dayGZ = { gan: dayGan, zhi: dayZhi }
  const hourGZ = { gan: hourGan, zhi: hourZhi }

  const shenSha = getShenSha(yearGZ.gan, yearGZ.zhi, monthGZ.gan, monthGZ.zhi, dayGZ.gan, dayGZ.zhi, hourGZ.gan, hourGZ.zhi, 1, monthZhi)

  const yearPillar = buildPillarInfo(yearGZ, dayGan)
  const monthPillar = buildPillarInfo(monthGZ, dayGan)
  const dayPillar = buildPillarInfo(dayGZ, dayGan)
  const hourPillar = buildPillarInfo(hourGZ, dayGan)

  // ── 空亡统一修正：kongWang 字段语义应为「该柱地支是否落于日柱旬空」，
  //    而非各柱自身的旬空（子平法标准）。此处用日柱旬空覆盖四柱。 ──
  const _dayKongWang = calculateXunKong(dayGZ.gan + dayGZ.zhi)
  for (const _p of [yearPillar, monthPillar, dayPillar, hourPillar]) {
    _p.kongWang = _dayKongWang.includes(_p.zhi) ? _dayKongWang : []
  }

  const defaultQiYun = { years: 1, months: 0, days: 0, startAge: 2, totalDays: 3 }
  const daYunList = getDaYunList(yearGZ, monthGZ, dayGZ, gender, new Date().getFullYear(), 1, 1, dayGan)
  const liuNianList = getLiuNianList(new Date().getFullYear(), dayGan)
  const liuYueList = getLiuYueList(new Date().getFullYear(), dayGan)

  const diZhiRelations = getDiZhiRelations([yearZhi, monthZhi, dayZhi, hourZhi])

  // ── 命宫 / 身宫 / 胎元（传统公式，四柱输入模式无日期故自行计算）──
  // 月支序数：寅=1, 卯=2, ..., 丑=12
  const MONTH_ORDER_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑']
  // 时支序数：子=1, 丑=2, ..., 亥=12
  const HOUR_ORDER_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

  // 五虎遁（年上起月）：寅月天干索引
  const WU_HU_DUN: Record<string, number> = {
    '甲': 2, '己': 2,  // 丙寅
    '乙': 4, '庚': 4,  // 戊寅
    '丙': 6, '辛': 6,  // 庚寅
    '丁': 8, '壬': 8,  // 壬寅
    '戊': 0, '癸': 0,  // 甲寅
  }

  function calcMingShenGong(monthZhi: string, hourZhi: string, yearGan: string): { mingGong: string; shenGong: string } {
    const monthIdx = MONTH_ORDER_ZHI.indexOf(monthZhi) + 1  // 寅=1
    const hourIdx = HOUR_ORDER_ZHI.indexOf(hourZhi) + 1     // 子=1

    // 命宫地支
    let mingZhiIdx = (14 - monthIdx - hourIdx) % 12
    if (mingZhiIdx <= 0) mingZhiIdx += 12
    const mingZhi = MONTH_ORDER_ZHI[mingZhiIdx - 1]

    // 身宫地支
    let shenZhiIdx = (monthIdx + hourIdx) % 12
    if (shenZhiIdx > 12) shenZhiIdx -= 12
    if (shenZhiIdx === 0) shenZhiIdx = 12
    const shenZhi = MONTH_ORDER_ZHI[shenZhiIdx - 1]

    // 五虎遁：命宫/身宫天干
    const startGanIdx = WU_HU_DUN[yearGan] ?? 0
    const mingGanIdx = (startGanIdx + mingZhiIdx - 1) % 10
    const shenGanIdx = (startGanIdx + shenZhiIdx - 1) % 10

    return {
      mingGong: TIAN_GAN[mingGanIdx] + mingZhi,
      shenGong: TIAN_GAN[shenGanIdx] + shenZhi,
    }
  }

  function calcTaiYuan(monthGan: string, monthZhi: string): string {
    const ganIdx = (TIAN_GAN.indexOf(monthGan) + 1) % 10
    const zhiIdx = (DI_ZHI.indexOf(monthZhi) + 3) % 12
    return TIAN_GAN[ganIdx] + DI_ZHI[zhiIdx]
  }

  const { mingGong, shenGong } = calcMingShenGong(monthZhi, hourZhi, yearGan)
  const taiYuan = calcTaiYuan(monthGan, monthZhi)

  // ── 与公历模式对齐：构建标准 pillars 结构并计算 analysis ──
  // 四柱输入模式此前缺失 analysis（日主旺衰/格局/用神等），导致报告「数据缺失」。
  const _pillars = [
    { label: '年柱', gan: yearPillar.gan, zhi: yearPillar.zhi, naYin: yearPillar.naYin, zangGan: yearPillar.zangGan, shishen: yearPillar.shishen, zhuXing: yearPillar.zhuXing, fuXing: yearPillar.fuXing },
    { label: '月柱', gan: monthPillar.gan, zhi: monthPillar.zhi, naYin: monthPillar.naYin, zangGan: monthPillar.zangGan, shishen: monthPillar.shishen, zhuXing: monthPillar.zhuXing, fuXing: monthPillar.fuXing },
    { label: '日柱', gan: dayPillar.gan, zhi: dayPillar.zhi, naYin: dayPillar.naYin, zangGan: dayPillar.zangGan, shishen: dayPillar.shishen, zhuXing: dayPillar.zhuXing, fuXing: dayPillar.fuXing },
    { label: '时柱', gan: hourPillar.gan, zhi: hourPillar.zhi, naYin: hourPillar.naYin, zangGan: hourPillar.zangGan, shishen: hourPillar.shishen, zhuXing: hourPillar.zhuXing, fuXing: hourPillar.fuXing },
  ]

  // 五行分布（规范算法：天干=1，地支本气=2，中气=1，余气=1）
  const _wxCounts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  for (const p of _pillars) {
    if (GAN_WX[p.gan]) _wxCounts[GAN_WX[p.gan]] += 1
    const zangGan = ZANG_GAN[p.zhi] || []
    const zangWeights = [2, 1, 1]
    for (let i = 0; i < zangGan.length; i++) {
      if (GAN_WX[zangGan[i]]) {
        _wxCounts[GAN_WX[zangGan[i]]] += zangWeights[i] || 1
      }
    }
  }

  const _analysis = calculateAnalysis(dayGan, _pillars, shenSha, _wxCounts, daYunList.daYunList, new Date().getFullYear())

  return {
    name,
    gender,
    year: 0,
    month: 0,
    day: 0,
    hour: 0,
    minute: 0,
    birthplace,
    solarDate: `${yearGan}${yearZhi}年${monthGan}${monthZhi}月${dayGan}${dayZhi}日${hourGan}${hourZhi}时`,
    trueSolarTime: 0,
    trueSolarTimeStr: '--',
    birthYear: 0,
    birthMonth: 0,
    birthDay: 0,
    birthHour: 0,
    birthMinute: 0,
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    shenSha,
    daYunList: daYunList.daYunList,
    liuNianList,
    liuYueList,
    diZhiRelations,
    lunarMonthZhi: monthZhi,
    qiYunInfo: defaultQiYun,
    mingGong,
    shenGong,
    taiYuan,
    lunarDate: '',
    analysis: _analysis,
  }
}

export function calculateBazi(
  name: string,
  gender: '男' | '女',
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0,
  birthplace?: string,
  longitude: number = 120,
): BaziResult {
  const trueSolarHour = getTrueSolarTime(year, month, day, hour, minute, longitude)
  
  const tsDisplayHour = Math.floor(trueSolarHour)
  const tsDisplayMinute = Math.round((trueSolarHour - tsDisplayHour) * 60)
  
  // 子时（23:00+）属于次日，日期需要顺延，时柱按次日子时计算
  const tsDate = new Date(year, month - 1, day, tsDisplayHour, tsDisplayMinute, 0)
  if (tsDisplayHour >= 23) {
    tsDate.setDate(tsDate.getDate() + 1)
    tsDate.setHours(0)
  }
  
  const tsYear = tsDate.getFullYear()
  const tsMonth = tsDate.getMonth() + 1
  const tsDay = tsDate.getDate()
  const tsHour = tsDate.getHours()
  const tsMinute = tsDate.getMinutes()
  
  const solar = Solar.fromYmdHms(tsYear, tsMonth, tsDay, tsHour, tsMinute, 0)
  const lunar = solar.getLunar()
  const eightChar = lunar.getEightChar()

  const yearGZ = { gan: eightChar.getYearGan(), zhi: eightChar.getYearZhi() }
  const monthGZ = { gan: eightChar.getMonthGan(), zhi: eightChar.getMonthZhi() }
  const dayGZ = { gan: eightChar.getDayGan(), zhi: eightChar.getDayZhi() }
  const hourGZ = { gan: eightChar.getTimeGan(), zhi: eightChar.getTimeZhi() }

  const lunarMonth = (lunar as any).getMonth()
  const lunarMonthZhi = DI_ZHI[(lunarMonth - 1 + 2) % 12] // 农历月 → 月支（正月=寅）

  // 农历日期
  const lunarYearGan = eightChar.getYearGan()
  const lunarYearZhi = eightChar.getYearZhi()
  const lunarMonthName = (lunar as any).getMonthInChinese()
  const lunarDayName = (lunar as any).getDayInChinese()
  const shichenNames = ['子时', '丑时', '丑时', '寅时', '寅时', '卯时', '卯时', '辰时', '辰时', '巳时', '巳时', '午时', '午时', '未时', '未时', '申时', '申时', '酉时', '酉时', '戌时', '戌时', '亥时', '亥时', '子时']
  const shichenName = shichenNames[tsHour] || '子时'
  const lunarDate = `${lunarYearGan}${lunarYearZhi}年${lunarMonthName}月${lunarDayName}日 ${shichenName}`

  const shenSha = getShenSha(yearGZ.gan, yearGZ.zhi, monthGZ.gan, monthGZ.zhi, dayGZ.gan, dayGZ.zhi, hourGZ.gan, hourGZ.zhi, tsMonth, lunarMonthZhi)

  const yearPillar = buildPillarFromEightChar(eightChar, 'year')
  const monthPillar = buildPillarFromEightChar(eightChar, 'month')
  const dayPillar = buildPillarFromEightChar(eightChar, 'day')
  const hourPillar = buildPillarFromEightChar(eightChar, 'time')

  // ── 空亡统一修正：kongWang 字段语义应为「该柱地支是否落于日柱旬空」，
  //    而非各柱自身的旬空（子平法标准）。此处用日柱旬空覆盖四柱。 ──
  const _dayKongWang = calculateXunKong(dayGZ.gan + dayGZ.zhi)
  for (const _p of [yearPillar, monthPillar, dayPillar, hourPillar]) {
    _p.kongWang = _dayKongWang.includes(_p.zhi) ? _dayKongWang : []
  }

  const { daYunList, qiYun } = getDaYunList(yearGZ, monthGZ, dayGZ, gender, tsYear, tsMonth, tsDay, dayGZ.gan)
  const liuNianList = getLiuNianList(tsYear + qiYun.startAge, dayGZ.gan)
  // 流月使用当前年份（非出生年份），因为流月天干由当年年干通过五虎遁推算
  const liuYueList = getLiuYueList(new Date().getFullYear(), dayGZ.gan)

  const diZhiRelations = getDiZhiRelations([yearGZ.zhi, monthGZ.zhi, dayGZ.zhi, hourGZ.zhi])

  // 命宫 / 身宫 / 胎元（lunar-javascript 原生支持）
  const mingGong = eightChar.getMingGong()
  const shenGong = eightChar.getShenGong()
  const taiYuan = eightChar.getTaiYuan()

  // 预计算分析结果
  const pillars = [
    { label: '年柱', gan: yearPillar.gan, zhi: yearPillar.zhi, naYin: yearPillar.naYin, zangGan: yearPillar.zangGan, shishen: yearPillar.shishen, zhuXing: yearPillar.zhuXing, fuXing: yearPillar.fuXing },
    { label: '月柱', gan: monthPillar.gan, zhi: monthPillar.zhi, naYin: monthPillar.naYin, zangGan: monthPillar.zangGan, shishen: monthPillar.shishen, zhuXing: monthPillar.zhuXing, fuXing: monthPillar.fuXing },
    { label: '日柱', gan: dayPillar.gan, zhi: dayPillar.zhi, naYin: dayPillar.naYin, zangGan: dayPillar.zangGan, shishen: dayPillar.shishen, zhuXing: dayPillar.zhuXing, fuXing: dayPillar.fuXing },
    { label: '时柱', gan: hourPillar.gan, zhi: hourPillar.zhi, naYin: hourPillar.naYin, zangGan: hourPillar.zangGan, shishen: hourPillar.shishen, zhuXing: hourPillar.zhuXing, fuXing: hourPillar.fuXing },
  ]

  // 五行分布（规范算法：天干=1，地支本气=2，中气=1，余气=1）
  const wxCounts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  for (const p of pillars) {
    if (GAN_WX[p.gan]) wxCounts[GAN_WX[p.gan]] += 1
    const zangGan = ZANG_GAN[p.zhi] || []
    const zangWeights = [2, 1, 1]  // 本气=2, 中气=1, 余气=1
    for (let i = 0; i < zangGan.length; i++) {
      if (GAN_WX[zangGan[i]]) {
        wxCounts[GAN_WX[zangGan[i]]] += zangWeights[i] || 1
      }
    }
  }

  const analysis = calculateAnalysis(dayGZ.gan, pillars, shenSha, wxCounts, daYunList, new Date().getFullYear())

  return {
    name,
    gender,
    year: tsYear,
    month: tsMonth,
    day: tsDay,
    hour: tsHour,
    minute: tsMinute,
    birthplace,
    solarDate: `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    trueSolarTime: trueSolarHour,
    trueSolarTimeStr: `${tsYear}-${String(tsMonth).padStart(2, '0')}-${String(tsDay).padStart(2, '0')} ${String(tsHour).padStart(2, '0')}:${String(tsMinute).padStart(2, '0')}`,
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    birthHour: hour,
    birthMinute: minute,
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    shenSha,
    daYunList,
    liuNianList,
    liuYueList,
    diZhiRelations,
    lunarMonthZhi,
    qiYunInfo: {
      years: qiYun.years,
      months: qiYun.months,
      days: qiYun.days,
      startAge: qiYun.startAge,
      totalDays: qiYun.totalDays,
    },
    mingGong,
    shenGong,
    taiYuan,
    lunarDate,
    analysis,
  }
}

// ── JSON 序列化（用于注入 LLM 提示词，提升解盘准确性）──

/** 用户在排盘界面选中的动态分析焦点（大运/流年/流月/流日/流时） */
export interface BaziSelectedFocus {
  daYun?: DaYun | null
  liuNian?: LiuNian | null
  liuYue?: LiuYue | null
  liuRi?: LiuRi | null
  liuShi?: LiuShi | null
}

/**
 * 将八字排盘结果序列化为结构化 JSON，注入大模型提示词
 * 包含命宫、身宫、胎元等全部确定性计算结果
 * selectedFocus：用户选中的运限焦点，选中流年时流月列表按所选流年计算
 */
export function serializeBaziJson(
  result: BaziResult,
  extra?: {
    strengthLevel?: string
    strengthScore?: number
    strengthDetail?: string
    patternName?: string
  },
  selectedFocus?: BaziSelectedFocus,
): string {
  const pillars = [
    { label: '年柱', ...result.yearPillar },
    { label: '月柱', ...result.monthPillar },
    { label: '日柱', ...result.dayPillar },
    { label: '时柱', ...result.hourPillar },
  ]

  // 五行分布（规范算法：天干=1，地支本气=2，中气=1，余气=1）
  const wxCounts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  // 分项明细（供报告 1.2 节五行力量分布表直接引用，避免 LLM 自行拆解出错）
  const wxGan: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  const wxZhiBenQi: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  const wxZhiCangGan: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
  for (const p of pillars) {
    if (GAN_WX[p.gan]) {
      wxCounts[GAN_WX[p.gan]] += 1
      wxGan[GAN_WX[p.gan]] += 1
    }
    const zg = ZANG_GAN[p.zhi] || []
    const zangWeights = [2, 1, 1]  // 本气=2, 中气=1, 余气=1
    for (let i = 0; i < zg.length; i++) {
      if (GAN_WX[zg[i]]) {
        const wx = GAN_WX[zg[i]]
        wxCounts[wx] += zangWeights[i] || 1
        if (i === 0) wxZhiBenQi[wx] += 2
        else wxZhiCangGan[wx] += 1
      }
    }
  }
  const wxElements = ['金', '木', '水', '火', '土'] as const
  const wuXingBreakdown: Record<string, unknown> = {}
  for (const wx of wxElements) {
    wuXingBreakdown[wx] = {
      gan: wxGan[wx],
      zhiBenQi: wxZhiBenQi[wx],
      zhiCangGan: wxZhiCangGan[wx],
      total: wxCounts[wx],
    }
  }

  // 当前大运
  const nowYear = new Date().getFullYear()
  const currentDaYun = result.daYunList.find(dy => dy.startYear <= nowYear && dy.endYear >= nowYear)
  const currentDaYunObj = currentDaYun ? {
    startAge: currentDaYun.startAge,
    endAge: currentDaYun.endAge,
    startYear: currentDaYun.startYear,
    endYear: currentDaYun.endYear,
    ganZhi: currentDaYun.gan + currentDaYun.zhi,
    zhuXing: currentDaYun.zhuXing,
    fuXing: currentDaYun.fuXing,
    wuXing: GAN_WX[currentDaYun.gan] || '',
  } : null

  // 当前流年（直接通过 lunar-javascript 计算当前年份的流年，不依赖 liuNianList 范围）
  const currentLiuNian = (() => {
    // 先尝试从已有列表中查找
    const ln = result.liuNianList?.find((ln) => ln.year === nowYear)
    if (ln) {
      return {
        year: ln.year,
        ganZhi: ln.gan + ln.zhi,
        zhuXing: ln.zhuXing,
        fuXing: ln.fuXing,
        wuXing: GAN_WX[ln.gan] || '',
      }
    }
    // 列表中没有，直接通过 lunar-javascript 计算当前年份的流年
    try {
      const solar = Solar.fromYmdHms(nowYear, 6, 1, 12, 0, 0)
      const eightChar = solar.getLunar().getEightChar()
      const gan = eightChar.getYearGan()
      const zhi = eightChar.getYearZhi()
      return {
        year: nowYear,
        ganZhi: gan + zhi,
        zhuXing: SHI_SHEN[result.dayPillar.gan]?.[gan] || '',
        fuXing: (ZANG_GAN[zhi] || []).map(g => SHI_SHEN[result.dayPillar.gan]?.[g] || '').filter(Boolean),
        wuXing: GAN_WX[gan] || '',
      }
    } catch {
      return null
    }
  })()

  // 流月列表（供 LLM 进行流月分析）
  // 必须指定年份计算，因为流月天干由当年年干通过五虎遁推算（甲己之年丙作首...）
  // 用户选中流年时按所选流年计算，否则用当前年份（与页面选中结果保持一致）
  const currentYearForLiuYue = selectedFocus?.liuNian?.year ?? new Date().getFullYear()
  const currentLiuYueList = getLiuYueList(currentYearForLiuYue, result.dayPillar.gan)
  const liuYueOutput = currentLiuYueList.map(ly => ({
    month: ly.month,
    ganZhi: ly.gan + ly.zhi,
    zhuXing: ly.zhuXing,
    wuXing: ly.wuXing,
  }))

  // dayMaster strength（使用简化版函数，与 analysis 分离）
  const simplePillars = pillars.map(p => ({ label: p.label, gan: p.gan, zhi: p.zhi, zangGan: p.zangGan }))
  const simpleDiZhiRelations = calculateDiZhiRelationsStructured(
    pillars.map(p => p.zhi),
    pillars.map(p => p.label)
  )
  const simpleStrength = getSimpleDayMasterStrength(result.dayPillar.gan, simplePillars, simpleDiZhiRelations)

  // 空亡信息（明确基准：日柱旬空亡为主，年柱旬空亡为辅）
  const dayPillarKongWang = calculateXunKong(result.dayPillar.gan + result.dayPillar.zhi)
  const yearPillarKongWang = calculateXunKong(result.yearPillar.gan + result.yearPillar.zhi)

  // 天乙贵人信息（明确基准：日干为主，年干为辅）
  const tianYiDayGan = SHENSHA_TIANYI[result.dayPillar.gan] || []
  const tianYiYearGan = SHENSHA_TIANYI[result.yearPillar.gan] || []

  return JSON.stringify({
    chartType: '八字',
    basicInfo: {
      name: result.name,
      gender: result.gender,
      genderLabel: result.gender === '男' ? '乾造' : '坤造',
      solarDate: result.solarDate,
      lunarDate: result.lunarDate || '',
      trueSolarTime: result.trueSolarTimeStr,
      birthplace: result.birthplace || '',
    },
    fourPillars: pillars.map((p) => ({
      label: p.label,
      gan: p.gan,
      zhi: p.zhi,
      naYin: p.naYin,
      wuXing: p.wuXing,
      zhuXing: p.zhuXing,
      fuXing: p.fuXing,
      zangGan: p.zangGan,
      xingYun: p.xingYun,
      zizuo: p.zizuo,
      // kongWang 已在四柱构建时统一为「该柱是否落于日柱旬空」语义
      kongWang: p.kongWang,
      shishen: p.shishen,
    })),
    dayMaster: {
      gan: result.dayPillar.gan,
      wuXing: GAN_WX[result.dayPillar.gan] || '',
      yinYang: GAN_YIN_YANG[result.dayPillar.gan] || '',
      strength: {
        level: simpleStrength.level,
        score: simpleStrength.score,
        detail: simpleStrength.detail,
      },
    },
    pattern: extra?.patternName || result.analysis?.geJuInfo?.name || '',
    monthOrder: result.monthPillar.zhi + '（' + (ZHI_WX[result.monthPillar.zhi] || '') + '行）',
    wuXingDistribution: wxCounts,
    wuXingBreakdown: {
      ...wuXingBreakdown,
      algorithm: '综合力量 = 天干×1 + 地支本气×2 + 藏干（中气/余气）×1',
      tableNote: '报告五行力量分布表必须直接引用此数据：天干列=gan、地支列=zhiBenQi（本气权重值）、藏干列=zhiCangGan（中气余气权重值）、综合力量列=total；三列之和等于 total，禁止自行拆解计算',
    },
    shenSha: result.shenSha || {},
    kongWangInfo: {
      primaryBasis: '日柱旬空亡（子平法标准，报告分析以此为准）',
      dayPillarKongWang,
      yearPillarKongWang,
      note: '空亡分析以日柱旬空亡为唯一基准；年柱旬空亡仅供参考，不得在报告中作为主要空亡依据',
    },
    tianYiGuiRenInfo: {
      primaryBasis: '日干（子平法标准，报告分析以此为准）',
      dayGanGuiRenZhi: tianYiDayGan,
      yearGanGuiRenZhi: tianYiYearGan,
      note: '天乙贵人以日干为唯一查法基准；年干查法为古法，仅供辅助参考，不得在报告中作为主要贵人依据',
    },
    mingGong: result.mingGong,
    shenGong: result.shenGong,
    taiYuan: result.taiYuan,
    qiYun: result.qiYunInfo,
    daYun: result.daYunList.map((dy) => ({
      startAge: dy.startAge,
      endAge: dy.endAge,
      startYear: dy.startYear,
      endYear: dy.endYear,
      ganZhi: dy.gan + dy.zhi,
      zhuXing: dy.zhuXing,
      fuXing: dy.fuXing,
      wuXing: GAN_WX[dy.gan] || '',
      isCurrent: dy.startYear <= nowYear && dy.endYear >= nowYear,
    })),
    currentDaYun: currentDaYunObj,
    currentLiuNian,
    liuYueYear: currentYearForLiuYue,
    liuYueList: liuYueOutput,
    selectedFocus: selectedFocus && (selectedFocus.daYun || selectedFocus.liuNian || selectedFocus.liuYue || selectedFocus.liuRi || selectedFocus.liuShi)
      ? {
        ...(selectedFocus.daYun ? {
          daYun: {
            startAge: selectedFocus.daYun.startAge,
            endAge: selectedFocus.daYun.endAge,
            startYear: selectedFocus.daYun.startYear,
            endYear: selectedFocus.daYun.endYear,
            ganZhi: selectedFocus.daYun.gan + selectedFocus.daYun.zhi,
            zhuXing: selectedFocus.daYun.zhuXing,
            fuXing: selectedFocus.daYun.fuXing,
            wuXing: GAN_WX[selectedFocus.daYun.gan] || '',
          },
        } : {}),
        ...(selectedFocus.liuNian ? {
          liuNian: {
            year: selectedFocus.liuNian.year,
            ganZhi: selectedFocus.liuNian.gan + selectedFocus.liuNian.zhi,
            zhuXing: selectedFocus.liuNian.zhuXing,
            fuXing: selectedFocus.liuNian.fuXing,
            wuXing: selectedFocus.liuNian.wuXing,
          },
        } : {}),
        ...(selectedFocus.liuYue ? {
          liuYue: {
            month: selectedFocus.liuYue.month,
            ganZhi: selectedFocus.liuYue.gan + selectedFocus.liuYue.zhi,
            zhuXing: selectedFocus.liuYue.zhuXing,
            fuXing: selectedFocus.liuYue.fuXing,
            wuXing: selectedFocus.liuYue.wuXing,
          },
        } : {}),
        ...(selectedFocus.liuRi ? {
          liuRi: {
            day: selectedFocus.liuRi.day,
            ganZhi: selectedFocus.liuRi.gan + selectedFocus.liuRi.zhi,
            zhuXing: selectedFocus.liuRi.zhuXing,
            fuXing: selectedFocus.liuRi.fuXing,
            wuXing: selectedFocus.liuRi.wuXing,
          },
        } : {}),
        ...(selectedFocus.liuShi ? {
          liuShi: {
            zhi: selectedFocus.liuShi.zhi,
            ganZhi: selectedFocus.liuShi.gan + selectedFocus.liuShi.zhi,
            zhuXing: selectedFocus.liuShi.zhuXing,
            fuXing: selectedFocus.liuShi.fuXing,
            wuXing: selectedFocus.liuShi.wuXing,
          },
        } : {}),
        note: '用户在排盘界面选中的动态时间节点，分析时以此焦点为准（currentDaYun/currentLiuNian 仅表示当前客观时间所处运程）',
      }
      : undefined,
    analysis: result.analysis || undefined,
  }, null, 2)
}
