// ── 紫微斗数排盘算法 (iztro 适配层) ──
// 重构日期：2026-07-11
// 将自研排盘算法替换为 iztro 开源库，保持导出接口不变

import { astro } from 'iztro'
import { Solar, Lunar } from 'lunar-javascript'
import { getTrueSolarTime, getQiYunInfo, getYearGanZhi, getMonthGanZhi, getDayGanZhi, getHourGanZhi, getDaYunList } from './baziCalculator'
import { GAN_YIN_YANG } from '../core/mingli'

type FunctionalAstrolabe = ReturnType<typeof astro.bySolar>
type IFunctionalPalace = FunctionalAstrolabe['palaces'][number]

// 宫位地支 (iztro 的 palaces 数组顺序也是以此为准：寅=索引0)
const GONG_ZHI = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑']

// iztro 宫名 → 项目宫名映射
const IZTRO_GONG_NAME_MAP: Record<string, string> = {
  '仆役': '交友',
}

// iztro StarType → 项目 StarType
const IZTRO_TYPE_MAP: Record<string, StarType> = {
  'major': '主星',
  'soft': '辅星',
  'tough': '煞星',
  'lucun': '辅星',
  'tianma': '辅星',
  'helper': '吉星',
  'flower': '杂星',
  'adjective': '杂星',
}

// 特殊星名类型覆盖 (与当前项目一致)
const STAR_TYPE_OVERRIDE: Record<string, StarType> = {
  '禄存': '吉星',
  '天魁': '吉星',
  '天钺': '吉星',
}

// iztro Brightness → 项目 StarStatus
const BRIGHTNESS_MAP: Record<string, StarStatus> = {
  '庙': '庙',
  '旺': '旺',
  '得': '得地',
  '利': '平',
  '平': '平',
  '不': '陷',
  '陷': '陷',
}

// iztro 星名 → 项目星名映射
const IZTRO_STAR_NAME_MAP: Record<string, string> = {
  '月解': '解神',
  '截路': '截空',
}

// 杂耀强弱补充表
// iztro 的 getAdjectiveStar() 不调用 getBrightness()，杂耀 brightness 为 undefined。
// 传统紫微斗数中杂耀无统一庙旺平陷标准，此处按星性分类补充：
// 吉杂曜 → 旺、凶杂曜 → 陷、中性/桃花杂曜 → 平
const ADJACENT_STAR_BRIGHTNESS: Record<string, StarStatus> = {
  // 吉杂曜 → 旺
  '三台': '旺', '八座': '旺', '恩光': '旺', '天贵': '旺',
  '龙池': '旺', '凤阁': '旺', '天才': '旺', '天寿': '旺',
  '台辅': '旺', '封诰': '旺', '天官': '旺', '天福': '旺',
  '天厨': '旺', '天德': '旺', '月德': '旺', '解神': '旺', '年解': '旺',
  // 凶杂曜 → 陷
  '天刑': '陷', '阴煞': '陷', '天哭': '陷', '天虚': '陷',
  '孤辰': '陷', '寡宿': '陷', '蜚廉': '陷', '破碎': '陷',
  '天空': '陷', '旬空': '陷', '截空': '陷', '空亡': '陷',
  '天伤': '陷', '天使': '陷', '天月': '陷',
  // 中性/桃花杂曜 → 平
  '红鸾': '平', '天喜': '平', '天姚': '平', '咸池': '平',
  '华盖': '平', '天巫': '平',
}

// 中文数字映射 (用于解析 iztro 农历日期)
const CHINESE_NUM_MAP: Record<string, number> = {
  '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}

// ── 类型定义 (保持不变) ──

export type StarType = '主星' | '辅星' | '吉星' | '煞星' | '四化' | '杂星'

export interface StarInfo {
  name: string
  type: StarType
  siHua?: string
  status?: StarStatus
}

export const GONG_NAMES = [
  '命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
  '迁移', '交友', '官禄', '田宅', '福德', '父母',
]

export type StarStatus = '旺' | '平' | '陷' | '庙' | '得地' | '落陷'

export type ChangSheng = '长生' | '沐浴' | '冠带' | '临官' | '帝旺' | '衰' | '病' | '死' | '墓' | '绝' | '胎' | '养'

export interface GongInfo {
  name: string
  zhi: string
  gan: string
  stars: StarInfo[]
  bodyGong: boolean
  changSheng: ChangSheng
  ageRange: string
  daXian: string
  liuNian: string
  xiaoXian: string
  shenSha: string[]
}

export interface QiYunInfo {
  years: number
  months: number
  days: number
  startAge: number
  daYunList: { age: number; gan: string; zhi: string; shishen: string; year: number }[]
}

export interface ZiweiResult {
  name: string
  gender: '男' | '女'
  birthYear: number
  solarDate: string
  lunarDate: string
  clockTime: string
  trueSolarTime: string
  yearGanZhi: string
  monthGanZhi: string
  dayGanZhi: string
  hourGanZhi: string
  mingGongIndex: number
  shenGongIndex: number
  wuXingJu: string
  wuXingJuNum: number
  mingZhu: string
  shenZhu: string
  douZhi: string
  gongs: GongInfo[]
  siHuaMap: Record<string, string>
  qiYunInfo: QiYunInfo
  // 出生参数 (用于重建 iztro 星盘以查询运限)
  _birth: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    isLunar: boolean
    longitude: number
  }
}

// ── 紫微斗数大限/流年/流月/流日类型 ──

export interface ZiweiDaXian {
  index: number
  gongIndex: number
  gongName: string
  zhi: string
  gan: string
  startAge: number
  endAge: number
  startYear: number
  endYear: number
  stars: StarInfo[]
}

export interface ZiweiLiuNian {
  year: number
  gan: string
  zhi: string
  gongIndex: number
  gongName: string
  stars: StarInfo[]
  siHuaMap: Record<string, string>
}

export interface ZiweiLiuYue {
  month: number
  gongIndex: number
  gongName: string
  zhi: string
  gan: string
  stars: StarInfo[]
  siHuaMap: Record<string, string>
}

export interface ZiweiLiuRi {
  day: number
  weekday: number
  isToday: boolean
  gongIndex: number
  gongName: string
  zhi: string
  gan: string
  stars: StarInfo[]
  siHuaMap: Record<string, string>
}

export interface ZiweiLiuShi {
  hour: number
  zhi: string
  gan: string
  gongIndex: number
  gongName: string
  stars: StarInfo[]
  siHuaMap: Record<string, string>
}

// ── 辅助函数 ──

// 真太阳时小时数 → iztro timeIndex (0=早子时, 1=丑时, ..., 12=晚子时)
function hourToTimeIndex(trueSolarHour: number): number {
  const hour = Math.floor(trueSolarHour)
  if (hour === 23) return 12  // 晚子时
  if (hour === 0) return 0   // 早子时
  return Math.floor((hour + 1) / 2)
}

// iztro StarType → 项目 StarType
function mapStarType(iztroType: string, starName: string): StarType {
  return STAR_TYPE_OVERRIDE[starName] || IZTRO_TYPE_MAP[iztroType] || '杂星'
}

// iztro Brightness → 项目 StarStatus
function mapBrightness(brightness: string | undefined): StarStatus | undefined {
  if (!brightness || brightness === '') return undefined
  return BRIGHTNESS_MAP[brightness]
}

// iztro 星名 → 项目星名
function mapStarName(name: string): string {
  return IZTRO_STAR_NAME_MAP[name] || name
}

// iztro 配置 (中州派四化 + 辅星亮度注入)
// iztro 的 STARS_INFO 仅含20颗星的亮度数据，以下8颗辅星/煞星通过
// iztro 原生 astro.config({ brightness }) API 注入传统紫微斗数亮度值
// 亮度数组按宫位地支排序，从寅(0)到丑(11)，值用 iztro i18n 拼音 key
const WANG_12 = Array(12).fill('wang')
const MIAO_12 = Array(12).fill('miao')
const XIAN_12 = Array(12).fill('xian')
// 天马: 四长生位(寅申巳亥)旺、四正(子午卯酉)平、四墓(辰戌丑未)陷
const TIANMA_BRIGHTNESS = ['wang', 'ping', 'xian', 'wang', 'ping', 'xian', 'wang', 'ping', 'xian', 'wang', 'ping', 'xian']

let iztroConfigured = false
function ensureIztroConfig(): void {
  if (iztroConfigured) return
  astro.config({
    mutagens: {
      '庚': ['太阳', '武曲', '天同', '天相'],
    },
    brightness: {
      zuofuMin: WANG_12,    // 左辅: 吉星，传统各宫皆旺
      youbiMin: WANG_12,    // 右弼: 吉星，传统各宫皆旺
      tiankuiMin: WANG_12,  // 天魁: 贵人星，传统各宫皆旺
      tianyueMin: WANG_12,  // 天钺: 贵人星，传统各宫皆旺
      lucunMin: MIAO_12,    // 禄存: 真财星，传统各宫皆庙
      tianmaMin: TIANMA_BRIGHTNESS, // 天马: 四长生旺、四正平、四墓陷
      dikongMin: XIAN_12,   // 地空: 煞星，传统各宫皆陷
      dijieMin: XIAN_12,    // 地劫: 煞星，传统各宫皆陷
    },
  } as any)
  iztroConfigured = true
}

// 解析 iztro 中文农历日期 → 数字格式 "2000年7月17日"
function parseLunarDate(lunarDateStr: string): string {
  // iztro 格式示例: "二〇〇〇年七月十七" 或 "二〇〇〇年十二月廿九"
  const match = lunarDateStr.match(/^(.+?)年(.+?)月(.+?)日?$/)
  if (!match) return lunarDateStr

  const [, yearStr, monthStr, dayStr] = match
  const year = parseChineseYear(yearStr)
  const month = parseChineseMonth(monthStr)
  const day = parseChineseDay(dayStr)

  if (year > 0 && month > 0 && day > 0) {
    return `${year}年${month}月${day}日`
  }
  return lunarDateStr
}

// 解析中文年份 "二〇〇〇" → 2000
function parseChineseYear(str: string): number {
  let result = 0
  for (const char of str) {
    const digit = CHINESE_NUM_MAP[char]
    if (digit === undefined) return 0
    result = result * 10 + digit
  }
  return result
}

// 解析中文月份 "七" → 7, "十二" → 12, "正" → 1, "冬" → 11, "腊" → 12
function parseChineseMonth(str: string): number {
  if (str === '正') return 1
  if (str === '冬') return 11
  if (str === '腊') return 12
  if (str === '十') return 10
  if (str.startsWith('十') && str.length === 2) return 10 + (CHINESE_NUM_MAP[str[1]] ?? 0)
  return CHINESE_NUM_MAP[str] ?? 0
}

// 解析中文日 "十七" → 17, "廿九" → 29, "三十" → 30, "初二" → 2
function parseChineseDay(str: string): number {
  if (str.startsWith('初') && str.length === 2) {
    return CHINESE_NUM_MAP[str[1]] ?? 0
  }
  if (str === '初') return 0
  if (str === '十') return 10
  if (str === '二十') return 20
  if (str === '三十') return 30
  if (str.startsWith('廿')) {
    return 20 + (CHINESE_NUM_MAP[str.slice(1)] ?? 0)
  }
  if (str.startsWith('十') && str.length === 2) {
    return 10 + (CHINESE_NUM_MAP[str[1]] ?? 0)
  }
  if (str.startsWith('卅')) {
    return 30 + (CHINESE_NUM_MAP[str.slice(1)] ?? 0)
  }
  return CHINESE_NUM_MAP[str] ?? 0
}

// ── 重建 iztro 星盘 (用于运限查询) ──

function createAstrolabe(birth: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  isLunar: boolean
  longitude: number
}, gender: '男' | '女'): FunctionalAstrolabe {
  ensureIztroConfig()
  const trueSolarHour = getTrueSolarTime(birth.year, birth.month, birth.day, birth.hour, birth.minute, birth.longitude)

  let adjustedHour = trueSolarHour
  let adjustedYear = birth.year
  let adjustedMonth = birth.month
  let adjustedDay = birth.day

  if (!birth.isLunar) {
    if (adjustedHour >= 24) {
      adjustedHour -= 24
      const nextDay = new Date(birth.year, birth.month - 1, birth.day + 1)
      adjustedYear = nextDay.getFullYear()
      adjustedMonth = nextDay.getMonth() + 1
      adjustedDay = nextDay.getDate()
    } else if (adjustedHour < 0) {
      adjustedHour += 24
      const prevDay = new Date(birth.year, birth.month - 1, birth.day - 1)
      adjustedYear = prevDay.getFullYear()
      adjustedMonth = prevDay.getMonth() + 1
      adjustedDay = prevDay.getDate()
    }
  }

  const timeIndex = hourToTimeIndex(adjustedHour)
  const dateStr = birth.isLunar
    ? `${birth.year}-${birth.month}-${birth.day}`
    : `${adjustedYear}-${adjustedMonth}-${adjustedDay}`

  return birth.isLunar
    ? astro.byLunar(dateStr, timeIndex, gender, false, true, 'zh-CN')
    : astro.bySolar(dateStr, timeIndex, gender, true, 'zh-CN')
}

// ── 宫位转换 (iztro Palace → 项目 GongInfo) ──

function convertPalaces(
  astrolabe: FunctionalAstrolabe,
  yearGZ: { gan: string; zhi: string },
  birthYear: number,
): GongInfo[] {
  // 构建 宫名 → iztro palace 的映射
  const palaceMap = new Map<string, IFunctionalPalace>()
  for (const palace of astrolabe.palaces) {
    const mappedName = IZTRO_GONG_NAME_MAP[palace.name] || palace.name
    palaceMap.set(mappedName, palace)
  }

  // 按 GONG_NAMES 顺序组装 gongs 数组
  const gongs: GongInfo[] = []
  for (let i = 0; i < 12; i++) {
    const gongName = GONG_NAMES[i]
    const palace = palaceMap.get(gongName)
    if (!palace) continue

    // 转换星耀 (合并 major + minor + adjective，只取本命盘星耀)
    const stars: StarInfo[] = []
    const allStars = [
      ...palace.majorStars,
      ...palace.minorStars,
      ...palace.adjectiveStars,
    ]
    const gongZhi = palace.earthlyBranch
    for (const star of allStars) {
      if (star.scope !== 'origin') continue

      const starName = mapStarName(star.name)
      const status = mapBrightness(star.brightness) || ADJACENT_STAR_BRIGHTNESS[starName]
      const starInfo: StarInfo = {
        name: starName,
        type: mapStarType(star.type, starName),
        status,
      }
      if (star.mutagen) {
        starInfo.siHua = '化' + star.mutagen
      }
      stars.push(starInfo)
    }

    // 按类型排序: 主星 → 辅星/吉星/煞星 → 杂星
    const TYPE_PRIORITY: Record<string, number> = {
      '主星': 0,
      '辅星': 1,
      '吉星': 1,
      '煞星': 1,
      '四化': 1,
      '杂星': 2,
    }
    stars.sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9))

    // 大限信息 (iztro palace.decadal)
    const range = palace.decadal?.range
    const ageStart = range?.[0] ?? 0
    const ageEnd = range?.[1] ?? 0
    const startYear = birthYear + ageStart - 1
    const ageRange = range ? `${ageStart}-${ageEnd}岁 (${startYear})` : ''

    // 小限 (iztro palace.ages)
    const xiaoXian = palace.ages?.length ? palace.ages.join(',') : ''

    // 流年太岁显示 (地支12年周期，非紫微算法)
    const yearZhiIdx = GONG_ZHI.indexOf(yearGZ.zhi)
    const gongZhiIdx = GONG_ZHI.indexOf(gongZhi)
    const liuNian = (yearZhiIdx >= 0 && gongZhiIdx >= 0)
      ? [((gongZhiIdx - yearZhiIdx + 12) % 12) + 1].flatMap(b => [b, b + 12, b + 24, b + 36, b + 48]).join(',')
      : ''

    // 神煞 (iztro palace.boshi12/jiangqian12/suiqian12)
    const shenSha: string[] = []
    if (palace.boshi12) shenSha.push(palace.boshi12)
    if (palace.jiangqian12) shenSha.push(palace.jiangqian12)
    if (palace.suiqian12) shenSha.push(palace.suiqian12)

    gongs.push({
      name: gongName,
      zhi: gongZhi,
      gan: palace.heavenlyStem,
      stars,
      bodyGong: palace.isBodyPalace,
      changSheng: palace.changsheng12 as ChangSheng,
      ageRange,
      daXian: `${gongName}大限`,
      liuNian,
      xiaoXian,
      shenSha,
    })
  }

  return gongs
}

// ── 主排盘函数 ──

export function calculateZiwei(
  name: string,
  gender: '男' | '女',
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0,
  isLunar: boolean = false,
  longitude: number = 120,
): ZiweiResult {
  // 1. 配置 iztro
  ensureIztroConfig()

  // 2. 计算真太阳时
  const trueSolarHour = getTrueSolarTime(year, month, day, hour, minute, longitude)

  // 3. 真太阳时跨日调整
  let adjustedHour = trueSolarHour
  let adjustedYear = year
  let adjustedMonth = month
  let adjustedDay = day

  if (isLunar) {
    // 农历日期 → 公历日期（正确方向：用 Lunar.fromYmdHms 构造农历，再转公历）
    const lunar = Lunar.fromYmdHms(year, month, day, hour, minute, 0)
    const solar = lunar.getSolar()
    const solarYear = solar.getYear()
    const solarMonth = solar.getMonth()
    const solarDay = solar.getDay()

    // 用公历日期计算真太阳时
    const solarTsHour = getTrueSolarTime(solarYear, solarMonth, solarDay, hour, minute, longitude)
    adjustedHour = solarTsHour

    if (adjustedHour >= 24) {
      adjustedHour -= 24
      // 真太阳时跨日：公历加一天，再转回农历用于 byLunar 排盘
      const nextLunar = solar.next(1).getLunar()
      adjustedYear = nextLunar.getYear()
      adjustedMonth = nextLunar.getMonth()
      adjustedDay = nextLunar.getDay()
    } else if (adjustedHour < 0) {
      adjustedHour += 24
      const prevLunar = solar.next(-1).getLunar()
      adjustedYear = prevLunar.getYear()
      adjustedMonth = prevLunar.getMonth()
      adjustedDay = prevLunar.getDay()
    } else {
      // 未跨日：保持原始农历日期
      adjustedYear = year
      adjustedMonth = month
      adjustedDay = day
    }
  } else {
    if (adjustedHour >= 24) {
      adjustedHour -= 24
      const nextDay = new Date(year, month - 1, day + 1)
      adjustedYear = nextDay.getFullYear()
      adjustedMonth = nextDay.getMonth() + 1
      adjustedDay = nextDay.getDate()
    } else if (adjustedHour < 0) {
      adjustedHour += 24
      const prevDay = new Date(year, month - 1, day - 1)
      adjustedYear = prevDay.getFullYear()
      adjustedMonth = prevDay.getMonth() + 1
      adjustedDay = prevDay.getDate()
    }
  }

  // 4. 转换为 iztro timeIndex
  const timeIndex = hourToTimeIndex(adjustedHour)

  // 5. 调用 iztro 排盘
  const dateStr = `${adjustedYear}-${adjustedMonth}-${adjustedDay}`

  const astrolabe = isLunar
    ? astro.byLunar(dateStr, timeIndex, gender, false, true, 'zh-CN')
    : astro.bySolar(dateStr, timeIndex, gender, true, 'zh-CN')

  // 6. 使用 baziCalculator 计算四柱 (使用真太阳时调整后的日期)
  const yearGZ = getYearGanZhi(adjustedYear, adjustedMonth, adjustedDay)
  const monthGZ = getMonthGanZhi(adjustedYear, adjustedMonth, adjustedDay)
  const dayGZ = getDayGanZhi(adjustedYear, adjustedMonth, adjustedDay)
  const hourTsHour = Math.floor(trueSolarHour)
  const hourTsMinute = Math.round((trueSolarHour - hourTsHour) * 60)
  const hourGZ = getHourGanZhi(adjustedYear, adjustedMonth, adjustedDay, hourTsHour, hourTsMinute)

  // 7. 起运信息 (使用真太阳时调整后的日期)
  const qiYunInfoCalc = getQiYunInfo(yearGZ, gender, adjustedYear, adjustedMonth, adjustedDay)
  const daYunResult = getDaYunList(yearGZ, monthGZ, dayGZ, gender, adjustedYear, adjustedMonth, adjustedDay, dayGZ.gan)
  const daYunList = daYunResult.daYunList.map(dy => ({
    age: dy.startAge,
    gan: dy.gan,
    zhi: dy.zhi,
    shishen: dy.zhuXing,
    year: dy.startYear,
  }))

  // 8. 从 iztro 星盘提取核心信息
  const mingGongIndex = GONG_ZHI.indexOf(astrolabe.earthlyBranchOfSoulPalace)
  const shenGongIndex = GONG_ZHI.indexOf(astrolabe.earthlyBranchOfBodyPalace)

  // 9. 解析五行局 (如 "木三局" → 木, 3)
  const fiveElementsClass = astrolabe.fiveElementsClass
  // 提取五行：第一个中文字符（木/火/土/金/水）
  const wuXingJuMatch = fiveElementsClass.match(/[\u4e00-\u9fa5]/)
  const wuXingJu = wuXingJuMatch ? wuXingJuMatch[0] : ''
  // 提取局数：支持中文数字（一二三四六）和阿拉伯数字
  const CHINESE_NUM_TO_INT: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
  }
  const arabicMatch = fiveElementsClass.match(/\d/)
  const chineseMatch = fiveElementsClass.match(/[一二三四五六]/)
  const wuXingJuNum = arabicMatch
    ? parseInt(arabicMatch[0])
    : (chineseMatch ? CHINESE_NUM_TO_INT[chineseMatch[0]] : 0)

  // 10. 命主/身主 (iztro astrolabe.soul / astrolabe.body)
  const mingZhu = astrolabe.soul || ''
  const shenZhu = astrolabe.body || ''
  const douZhi = GONG_ZHI[mingGongIndex]

  // 11. 转换十二宫
  const gongs = convertPalaces(astrolabe, yearGZ, year)

  // 12. 构建四化 Map
  const siHuaMap: Record<string, string> = {}
  for (const gong of gongs) {
    for (const star of gong.stars) {
      if (star.siHua) {
        siHuaMap[star.name] = star.siHua
      }
    }
  }

  // 13. 格式化日期字符串
  const solarDateStr = `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const lunarDateStr = parseLunarDate(astrolabe.lunarDate)
  const clockTimeStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  // 真太阳时格式化 (使用真太阳时调整后的日期)
  const tsHour = Math.floor(trueSolarHour)
  const tsMinute = Math.round((trueSolarHour - tsHour) * 60)
  const trueSolarTimeStr = `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')} ${String(tsHour).padStart(2, '0')}:${String(tsMinute).padStart(2, '0')}`

  // 14. 起运信息
  const qiYunInfo = {
    years: qiYunInfoCalc.years,
    months: qiYunInfoCalc.months,
    days: qiYunInfoCalc.days,
    startAge: qiYunInfoCalc.startAge,
    daYunList,
  }

  return {
    name,
    gender,
    birthYear: year,
    solarDate: solarDateStr,
    lunarDate: lunarDateStr,
    clockTime: clockTimeStr,
    trueSolarTime: trueSolarTimeStr,
    yearGanZhi: yearGZ.gan + yearGZ.zhi,
    monthGanZhi: monthGZ.gan + monthGZ.zhi,
    dayGanZhi: dayGZ.gan + dayGZ.zhi,
    hourGanZhi: hourGZ.gan + hourGZ.zhi,
    mingGongIndex,
    shenGongIndex,
    wuXingJu,
    wuXingJuNum,
    mingZhu,
    shenZhu,
    douZhi,
    gongs,
    siHuaMap,
    qiYunInfo,
    _birth: { year, month, day, hour, minute, isLunar, longitude },
  }
}

// ── 紫微斗数大限/流年/流月/流日计算 (全部使用 iztro horoscope API) ──

const SI_HUA_NAMES = ['化禄', '化权', '化科', '化忌']

function isLeapYearLocal(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
}

function getMainStars(gong: GongInfo): StarInfo[] {
  return gong.stars.filter(s => s.type === '主星' || s.siHua)
}

// iztro 宫位索引(地支序) → 项目宫位索引(GONG_NAMES序)
function iztroPalaceIndexToGongIndex(astrolabe: FunctionalAstrolabe, iztroIndex: number, result: ZiweiResult): number {
  const palace = astrolabe.palaces[iztroIndex]
  if (!palace) return -1
  const palaceName = IZTRO_GONG_NAME_MAP[palace.name] || palace.name
  return result.gongs.findIndex(g => g.name === palaceName)
}

// 从 iztro mutagen 数组构建四化 Map
function buildSiHuaMap(mutagen: string[]): Record<string, string> {
  const siHuaMap: Record<string, string> = {}
  mutagen.forEach((starName, i) => {
    if (starName && SI_HUA_NAMES[i]) {
      siHuaMap[starName] = SI_HUA_NAMES[i]
    }
  })
  return siHuaMap
}

// 给本命主星标注运限四化
function tagStarsWithSiHua(stars: StarInfo[], siHuaMap: Record<string, string>): StarInfo[] {
  return stars.map(s => {
    if (siHuaMap[s.name]) {
      return { ...s, siHua: siHuaMap[s.name] }
    }
    return s
  })
}

export interface DaXianHoroscope {
  siHuaMap: Record<string, string>
  starsByGong: Record<number, StarInfo[]>
  palaceNamesByGong: Record<number, string>
  changShengByGong: Record<number, ChangSheng>
  shenShaByGong: Record<number, string[]>
}

// 通用运限盘信息 (流年/流月/流日/流时复用)
export interface TimeHoroscope {
  siHuaMap: Record<string, string>
  starsByGong: Record<number, StarInfo[]>
  palaceNamesByGong: Record<number, string>
  changShengByGong: Record<number, ChangSheng>
  shenShaByGong: Record<number, string[]>
}

// 十二长生顺序
const CHANG_SHENG_STARS: ChangSheng[] = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']

// 天干 → 禄存地支索引 (寅=0)
const GAN_LU_ZHI: Record<string, number> = {
  '甲': 0, '乙': 1, '丙': 3, '丁': 4, '戊': 3,
  '己': 4, '庚': 6, '辛': 7, '壬': 9, '癸': 10,
}

// 地支 → 将星起始索引 (寅=0)
const ZHI_JIANG_START: Record<string, number> = {
  '寅': 4, '午': 4, '戌': 4,  // 寅午戌 → 午
  '申': 10, '子': 10, '辰': 10, // 申子辰 → 子
  '巳': 7, '酉': 7, '丑': 7,   // 巳酉丑 → 酉
  '亥': 1, '卯': 1, '未': 1,   // 亥卯未 → 卯
}

// 博士12神 (按顺序)
const BOSHI_12_NAMES = ['博士', '力士', '青龙', '小耗', '将军', '奏书', '飞廉', '喜神', '病符', '大耗', '伏兵', '官府']

// 岁前12神 (按顺序)
const SUIQIAN_12_NAMES = ['岁建', '晦气', '丧门', '贯索', '官符', '小耗', '大耗', '龙德', '白虎', '天德', '吊客', '病符']

// 将前12神 (按顺序)
const JIANGQIAN_12_NAMES = ['将星', '攀鞍', '岁驿', '息神', '华盖', '劫煞', '灾煞', '天煞', '指背', '咸池', '月煞', '亡神']

// 运限星名 → 本命星名映射 (iztro 为不同 scope 使用不同星名)
// 覆盖所有 scope: decadal(运), yearly(流), monthly(月), daily(日), hourly(时)
const SCOPED_STAR_TO_ORIGIN: Record<string, string> = {
  // ── decadal (大限) ──
  '运魁': '天魁', '运钺': '天钺', '运昌': '文昌', '运曲': '文曲',
  '运禄': '禄存', '运羊': '擎羊', '运陀': '陀罗', '运马': '天马',
  '运鸾': '红鸾', '运喜': '天喜',
  // ── yearly (流年) ──
  '流魁': '天魁', '流钺': '天钺', '流昌': '文昌', '流曲': '文曲',
  '流禄': '禄存', '流羊': '擎羊', '流陀': '陀罗', '流马': '天马',
  '流鸾': '红鸾', '流喜': '天喜',
  // ── monthly (流月) ──
  '月魁': '天魁', '月钺': '天钺', '月昌': '文昌', '月曲': '文曲',
  '月禄': '禄存', '月羊': '擎羊', '月陀': '陀罗', '月马': '天马',
  '月鸾': '红鸾', '月喜': '天喜',
  // ── daily (流日) ──
  '日魁': '天魁', '日钺': '天钺', '日昌': '文昌', '日曲': '文曲',
  '日禄': '禄存', '日羊': '擎羊', '日陀': '陀罗', '日马': '天马',
  '日鸾': '红鸾', '日喜': '天喜',
  // ── hourly (流时) ──
  '时魁': '天魁', '时钺': '天钺', '时昌': '文昌', '时曲': '文曲',
  '时禄': '禄存', '时羊': '擎羊', '时陀': '陀罗', '时马': '天马',
  '时鸾': '红鸾', '时喜': '天喜',
}

/**
 * 计算自定义干支的博士12神分布
 * @param gan 天干 (如 '己')
 * @param zhi 地支 (如 '酉')
 * @param gender 性别
 * @param yearGan 年干 (用于判定顺逆行)
 */
function calcBoShi12(gan: string, _zhi: string, gender: '男' | '女', yearGan: string): (string | undefined)[] {
  const luIndex = GAN_LU_ZHI[gan] ?? 0
  const genderYinYang = gender === '男' ? '阳' : '阴'
  const yearGanYinYang = GAN_YIN_YANG[yearGan] || '阳'
  const forward = genderYinYang === yearGanYinYang

  const result: (string | undefined)[] = new Array(12).fill(undefined)
  for (let i = 0; i < BOSHI_12_NAMES.length; i++) {
    const idx = forward
      ? ((luIndex + i) % 12 + 12) % 12
      : ((luIndex - i) % 12 + 12) % 12
    result[idx] = BOSHI_12_NAMES[i]
  }
  return result
}

/**
 * 计算自定义地支的岁前12神分布
 * @param zhi 地支 (如 '酉')
 */
function calcSuiQian12(zhi: string): (string | undefined)[] {
  const zhiIndex = GONG_ZHI.indexOf(zhi)
  if (zhiIndex < 0) return new Array(12).fill(undefined)

  const result: (string | undefined)[] = new Array(12).fill(undefined)
  for (let i = 0; i < SUIQIAN_12_NAMES.length; i++) {
    const idx = ((zhiIndex + i) % 12 + 12) % 12
    result[idx] = SUIQIAN_12_NAMES[i]
  }
  return result
}

// ── JSON 序列化（用于注入 LLM 提示词，提升解盘准确性）──

/**
 * 将紫微斗数排盘结果序列化为结构化 JSON，注入大模型提示词
 */
export function serializeZiweiJson(
  result: ZiweiResult,
  daXianList: ZiweiDaXian[],
  selectedFocus?: {
    daXian?: { startAge: number; endAge: number; gan: string; zhi: string; gongName: string } | null
    liuNian?: { year: number; gan: string; zhi: string; gongName: string } | null
    liuYue?: { month: number; gan: string; zhi: string; gongName: string } | null
    liuRi?: { day: number; gan: string; zhi: string; gongName: string } | null
    liuShi?: { zhi: string; gan: string; gongName: string } | null
  },
): string {
  return JSON.stringify({
    chartType: '紫微斗数',
    basicInfo: {
      name: result.name,
      gender: result.gender,
      solarDate: result.solarDate,
      lunarDate: result.lunarDate,
      trueSolarTime: result.trueSolarTime,
      fourPillars: {
        year: result.yearGanZhi,
        month: result.monthGanZhi,
        day: result.dayGanZhi,
        hour: result.hourGanZhi,
      },
    },
    mingGong: result.gongs[result.mingGongIndex]?.name || '未知',
    shenGong: result.gongs[result.shenGongIndex]?.name || '未知',
    wuXingJu: result.wuXingJu,
    mingZhu: result.mingZhu,
    shenZhu: result.shenZhu,
    siHuaMap: result.siHuaMap,
    palaces: result.gongs.map((g) => ({
      name: g.name,
      zhi: g.zhi,
      gan: g.gan,
      ageRange: g.ageRange,
      changSheng: g.changSheng,
      bodyGong: g.bodyGong,
      mainStars: g.stars.filter((s) => s.type === '主星').map((s) => ({ name: s.name, siHua: s.siHua || undefined, status: s.status || undefined })),
      auspiciousStars: g.stars.filter((s) => s.type === '吉星').map((s) => ({ name: s.name, siHua: s.siHua || undefined })),
      inauspiciousStars: g.stars.filter((s) => s.type === '煞星').map((s) => s.name),
      shenSha: g.shenSha,
    })),
    daXian: daXianList.map((dx) => ({
      startAge: dx.startAge,
      endAge: dx.endAge,
      startYear: dx.startYear,
      endYear: dx.endYear,
      ganZhi: dx.gan + dx.zhi,
      gongName: dx.gongName,
      mainStars: dx.stars?.filter((s) => s.type === '主星').map((s) => s.name) || [],
    })),
    selectedFocus: selectedFocus && (selectedFocus.daXian || selectedFocus.liuNian || selectedFocus.liuYue || selectedFocus.liuRi || selectedFocus.liuShi)
      ? selectedFocus : undefined,
  }, null, 2)
}

/**
 * 计算自定义地支的将前12神分布
 * @param zhi 地支 (如 '酉')
 */
function calcJiangQian12(zhi: string): (string | undefined)[] {
  const startIdx = ZHI_JIANG_START[zhi]
  if (startIdx === undefined) return new Array(12).fill(undefined)

  const result: (string | undefined)[] = new Array(12).fill(undefined)
  for (let i = 0; i < JIANGQIAN_12_NAMES.length; i++) {
    const idx = ((startIdx + i) % 12 + 12) % 12
    result[idx] = JIANGQIAN_12_NAMES[i]
  }
  return result
}

/**
 * 获取大限四化和流曜信息 (iztro horoscope().decadal)
 * 同时基于大限参数重新计算宫位名称、十二长生和神煞
 * 神煞使用大限自身的干支计算，而非本命年干支
 */
export function getZiweiDaXianHoroscope(daXian: ZiweiDaXian, result: ZiweiResult): DaXianHoroscope {
  const astrolabe = createAstrolabe(result._birth, result.gender)
  const midYear = Math.floor((daXian.startYear + daXian.endYear) / 2)
  const horoscope = astrolabe.horoscope(`${midYear}-7-1`, 0)
  const decadal = horoscope.decadal

  const siHuaMap = buildSiHuaMap(decadal.mutagen)

  // 1. 大限运星 (decadal.stars) 按宫位分组
  const starsByGong: Record<number, StarInfo[]> = {}
  const decadalStarsArray = decadal.stars || []
  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const decadalStars = decadalStarsArray[iztroIdx] || []
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue

    if (!starsByGong[gongIndex]) {
      starsByGong[gongIndex] = []
    }

    for (const starObj of decadalStars) {
      const rawName = mapStarName(starObj.name)
      // 运限星名 → 本命星名映射，避免「运鸾」「运魁」「运马」等重复显示
      const starName = SCOPED_STAR_TO_ORIGIN[rawName] || rawName
      starsByGong[gongIndex].push({
        name: starName,
        type: mapStarType(starObj.type, starName),
        siHua: siHuaMap[starName] ? siHuaMap[starName] : undefined,
      })
    }
  }

  // 2. 基于大限重新计算宫位名称 (iztro decadal.palaceNames)
  const palaceNamesByGong: Record<number, string> = {}
  const palaceNames = decadal.palaceNames || []
  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const palaceName = palaceNames[iztroIdx]
    if (!palaceName) continue
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue
    palaceNamesByGong[gongIndex] = palaceName
  }

  // 3. 基于本命五行局重新计算十二长生 (十二长生使用命宫五行局，非大限五行局)
  const changShengByGong: Record<number, ChangSheng> = {}
  // 本命五行局 → 长生起始索引: 水二局(申7), 木三局(亥9), 金四局(巳3), 土五局(申7), 火六局(寅0)
  const changShengStartMap: Record<number, number> = { 2: 7, 3: 9, 4: 3, 5: 7, 6: 0 }
  const natalWuXingJuNum = result.wuXingJuNum
  const startIdx = changShengStartMap[natalWuXingJuNum] ?? 0

  // 方向: 阳男阴女顺行，阴男阳女逆行 (基于出生年干阴阳和性别)
  const yearGan = result.yearGanZhi[0]
  const genderYinYang = result.gender === '男' ? '阳' : '阴'
  const yearGanYinYang = GAN_YIN_YANG[yearGan] || '阳'
  const forward = genderYinYang === yearGanYinYang

  const changShengArray: (ChangSheng | undefined)[] = new Array(12).fill(undefined)
  for (let i = 0; i < CHANG_SHENG_STARS.length; i++) {
    let idx: number
    if (forward) {
      idx = ((i + startIdx) % 12 + 12) % 12
    } else {
      idx = ((startIdx - i) % 12 + 12) % 12
    }
    changShengArray[idx] = CHANG_SHENG_STARS[i]
  }

  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const cs = changShengArray[iztroIdx]
    if (!cs) continue
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue
    changShengByGong[gongIndex] = cs
  }

  // 4. 大限神煞: 博士12神使用本命年干(禄存由年干定)，将前12神/岁前12神使用大限支
  const shenShaByGong: Record<number, string[]> = {}
  const dxZhi = daXian.zhi
  const natalYearGan = result.yearGanZhi[0]

  const boshi12 = calcBoShi12(natalYearGan, dxZhi, result.gender, natalYearGan)
  const jiangqian12 = calcJiangQian12(dxZhi)
  const suiqian12 = calcSuiQian12(dxZhi)

  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue

    const sha: string[] = []
    if (boshi12[iztroIdx]) sha.push(boshi12[iztroIdx]!)
    if (jiangqian12[iztroIdx]) sha.push(jiangqian12[iztroIdx]!)
    if (suiqian12[iztroIdx]) sha.push(suiqian12[iztroIdx]!)
    shenShaByGong[gongIndex] = sha
  }

  return { siHuaMap, starsByGong, palaceNamesByGong, changShengByGong, shenShaByGong }
}

/**
 * 通用运限盘计算 (流年/流月/流日/流时)
 * 使用 iztro horoscope 的对应 scope (yearly/monthly/daily/hourly)
 * 基于该运限的天干地支重新计算四化、运星、宫位名称、十二长生和神煞
 */
export function getTimeHoroscope(
  scope: 'yearly' | 'monthly' | 'daily' | 'hourly',
  dateStr: string,
  timeIdx: number,
  result: ZiweiResult
): TimeHoroscope {
  const astrolabe = createAstrolabe(result._birth, result.gender)
  const horoscope = astrolabe.horoscope(dateStr, timeIdx)
  const scopeData = horoscope[scope]

  const siHuaMap = buildSiHuaMap(scopeData.mutagen)

  // 1. 运星按宫位分组
  const starsByGong: Record<number, StarInfo[]> = {}
  const scopeStarsArray = scopeData.stars || []
  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const scopeStars = scopeStarsArray[iztroIdx] || []
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue

    if (!starsByGong[gongIndex]) {
      starsByGong[gongIndex] = []
    }

    for (const starObj of scopeStars) {
      const rawName = mapStarName(starObj.name)
      // 运限星名 → 本命星名映射，避免「流鸾」「流魁」「流马」等重复显示
      const starName = SCOPED_STAR_TO_ORIGIN[rawName] || rawName
      starsByGong[gongIndex].push({
        name: starName,
        type: mapStarType(starObj.type, starName),
        siHua: siHuaMap[starName] ? siHuaMap[starName] : undefined,
      })
    }
  }

  // 2. 基于运限重新计算宫位名称
  const palaceNamesByGong: Record<number, string> = {}
  const palaceNames = scopeData.palaceNames || []
  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const palaceName = palaceNames[iztroIdx]
    if (!palaceName) continue
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue
    palaceNamesByGong[gongIndex] = palaceName
  }

  // 3. 基于本命五行局重新计算十二长生 (十二长生使用命宫五行局，非运限五行局)
  const changShengByGong: Record<number, ChangSheng> = {}
  // 本命五行局 → 长生起始索引: 水二局(申7), 木三局(亥9), 金四局(巳3), 土五局(申7), 火六局(寅0)
  const changShengStartMap: Record<number, number> = { 2: 7, 3: 9, 4: 3, 5: 7, 6: 0 }
  const natalWuXingJuNum = result.wuXingJuNum
  const startIdx = changShengStartMap[natalWuXingJuNum] ?? 0

  // 方向: 阳男阴女顺行，阴男阳女逆行 (基于出生年干阴阳和性别)
  const yearGan = result.yearGanZhi[0]
  const genderYinYang = result.gender === '男' ? '阳' : '阴'
  const yearGanYinYang = GAN_YIN_YANG[yearGan] || '阳'
  const forward = genderYinYang === yearGanYinYang

  const changShengArray: (ChangSheng | undefined)[] = new Array(12).fill(undefined)
  for (let i = 0; i < CHANG_SHENG_STARS.length; i++) {
    let idx: number
    if (forward) {
      idx = ((i + startIdx) % 12 + 12) % 12
    } else {
      idx = ((startIdx - i) % 12 + 12) % 12
    }
    changShengArray[idx] = CHANG_SHENG_STARS[i]
  }

  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const cs = changShengArray[iztroIdx]
    if (!cs) continue
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue
    changShengByGong[gongIndex] = cs
  }

  // 4. 基于运限干支重新计算神煞 (博士12神、将前12神、岁前12神)
  // 博士12神使用本命年干(禄存由年干定)，将前12神/岁前12神使用运限支
  const shenShaByGong: Record<number, string[]> = {}
  const timeZhi = scopeData.earthlyBranch
  const natalYearGan = result.yearGanZhi[0]

  const boshi12 = calcBoShi12(natalYearGan, timeZhi, result.gender, natalYearGan)
  const jiangqian12 = calcJiangQian12(timeZhi)
  const suiqian12 = calcSuiQian12(timeZhi)

  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue

    const sha: string[] = []
    if (boshi12[iztroIdx]) sha.push(boshi12[iztroIdx]!)
    if (jiangqian12[iztroIdx]) sha.push(jiangqian12[iztroIdx]!)
    if (suiqian12[iztroIdx]) sha.push(suiqian12[iztroIdx]!)
    shenShaByGong[gongIndex] = sha
  }

  return { siHuaMap, starsByGong, palaceNamesByGong, changShengByGong, shenShaByGong }
}

/**
 * 获取紫微斗数大限列表 (iztro palace.decadal)
 */
export function getZiweiDaXianList(result: ZiweiResult): ZiweiDaXian[] {
  const { birthYear } = result
  const astrolabe = createAstrolabe(result._birth, result.gender)

  // 收集所有宫位的大限数据
  const items: ZiweiDaXian[] = []
  for (let iztroIdx = 0; iztroIdx < 12; iztroIdx++) {
    const palace = astrolabe.palaces[iztroIdx]
    if (!palace || !palace.decadal) continue

    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, iztroIdx, result)
    if (gongIndex < 0) continue

    const gong = result.gongs[gongIndex]
    const [ageStart, ageEnd] = palace.decadal.range

    items.push({
      index: 0, // 临时占位，后续按年龄排序后赋值
      gongIndex,
      gongName: gong.name,
      zhi: palace.decadal.earthlyBranch,
      gan: palace.decadal.heavenlyStem,
      startAge: ageStart,
      endAge: ageEnd,
      startYear: birthYear + ageStart - 1,
      endYear: birthYear + ageEnd - 1,
      stars: getMainStars(gong),
    })
  }

  // 按 startAge 升序排序，赋编号
  items.sort((a, b) => a.startAge - b.startAge)
  items.forEach((item, i) => { item.index = i + 1 })

  return items
}

/**
 * 获取紫微斗数流年列表 (iztro horoscope().yearly)
 */
export function getZiweiLiuNianList(daXian: ZiweiDaXian, result: ZiweiResult): ZiweiLiuNian[] {
  const astrolabe = createAstrolabe(result._birth, result.gender)
  const list: ZiweiLiuNian[] = []

  for (let year = daXian.startYear; year <= daXian.endYear; year++) {
    const horoscope = astrolabe.horoscope(`${year}-7-1`, 0)
    const yearly = horoscope.yearly
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, yearly.index, result)
    if (gongIndex < 0) continue

    const gong = result.gongs[gongIndex]
    const siHuaMap = buildSiHuaMap(yearly.mutagen)
    const stars = tagStarsWithSiHua(getMainStars(gong), siHuaMap)

    list.push({
      year,
      gan: yearly.heavenlyStem,
      zhi: yearly.earthlyBranch,
      gongIndex,
      gongName: gong.name,
      stars,
      siHuaMap,
    })
  }
  return list
}

/**
 * 获取紫微斗数流月列表 (iztro horoscope().monthly)
 */
export function getZiweiLiuYueList(year: number, result: ZiweiResult): ZiweiLiuYue[] {
  const astrolabe = createAstrolabe(result._birth, result.gender)
  const list: ZiweiLiuYue[] = []

  for (let month = 1; month <= 12; month++) {
    const horoscope = astrolabe.horoscope(`${year}-${month}-15`, 0)
    const monthly = horoscope.monthly
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, monthly.index, result)
    if (gongIndex < 0) continue

    const gong = result.gongs[gongIndex]
    const siHuaMap = buildSiHuaMap(monthly.mutagen)
    const stars = tagStarsWithSiHua(getMainStars(gong), siHuaMap)

    list.push({
      month,
      gongIndex,
      gongName: gong.name,
      zhi: monthly.earthlyBranch,
      gan: monthly.heavenlyStem,
      stars,
      siHuaMap,
    })
  }
  return list
}

/**
 * 获取紫微斗数流日列表 (iztro horoscope().daily)
 */
export function getZiweiLiuRiList(year: number, month: number, result: ZiweiResult): ZiweiLiuRi[] {
  const astrolabe = createAstrolabe(result._birth, result.gender)

  const daysInMonthArr = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month === 2 && isLeapYearLocal(year)) {
    daysInMonthArr[2] = 29
  }
  const daysInMonth = daysInMonthArr[month]

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month

  const list: ZiweiLiuRi[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const horoscope = astrolabe.horoscope(`${year}-${month}-${day}`, 0)
    const daily = horoscope.daily
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, daily.index, result)
    if (gongIndex < 0) continue

    const gong = result.gongs[gongIndex]
    const siHuaMap = buildSiHuaMap(daily.mutagen)
    const stars = tagStarsWithSiHua(getMainStars(gong), siHuaMap)
    const date = new Date(year, month - 1, day)

    list.push({
      day,
      weekday: date.getDay(),
      isToday: isCurrentMonth && today.getDate() === day,
      gongIndex,
      gongName: gong.name,
      zhi: daily.earthlyBranch,
      gan: daily.heavenlyStem,
      stars,
      siHuaMap,
    })
  }
  return list
}

// 时辰地支名称 (timeIndex 0-11 → 时支)
const SHI_ZHI_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

export function getZiweiLiuShiList(year: number, month: number, day: number, result: ZiweiResult): ZiweiLiuShi[] {
  const astrolabe = createAstrolabe(result._birth, result.gender)
  const dateStr = `${year}-${month}-${day}`

  const list: ZiweiLiuShi[] = []
  for (let timeIdx = 0; timeIdx < 12; timeIdx++) {
    const horoscope = astrolabe.horoscope(dateStr, timeIdx)
    const hourly = horoscope.hourly
    const gongIndex = iztroPalaceIndexToGongIndex(astrolabe, hourly.index, result)
    if (gongIndex < 0) continue

    const gong = result.gongs[gongIndex]
    const siHuaMap = buildSiHuaMap(hourly.mutagen)
    const stars = tagStarsWithSiHua(getMainStars(gong), siHuaMap)

    list.push({
      hour: timeIdx,
      zhi: SHI_ZHI_NAMES[timeIdx],
      gan: hourly.heavenlyStem,
      gongIndex,
      gongName: gong.name,
      stars,
      siHuaMap,
    })
  }
  return list
}
