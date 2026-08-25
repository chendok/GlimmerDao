/**
 * 黄道择吉计算适配层
 *
 * 复用后端 /huangli API 的黄历数据，封装为统一的择吉结果类型。
 * 提供序列化函数，将择吉信息转为 LLM 可理解的上下文文本。
 */

import { API_BASE } from './constants'

// ── 类型定义 ──

/** 时辰吉凶 */
export interface TwoHourItem {
  hour: number
  ganzhi: string
  lucky: boolean
}

/** 日黄历数据 */
export interface DayHuangli {
  date: string
  lunar_year: string
  lunar_month: string
  lunar_day: string
  year_ganzhi: string
  month_ganzhi: string
  day_ganzhi: string
  weekday: string
  zodiac: string
  clash: string
  level: number
  level_name: string
  level_label: string
  thing_level: string
  good_things: string[]
  bad_things: string[]
  good_gods: string[]
  bad_gods: string[]
  day_officer: string
  day_god: string
  star_28: string
  solar_term: string
  elements: string
  peng_taboo: string
  lucky_directions: string[]
  fetal_god: string
  nayin: string
  season: string
  next_solar_term: string
  next_solar_term_date: string
  zodiac_mark6: string
  zodiac_mark3: string[]
  is_de: boolean
  twohour_list: TwoHourItem[]
  is_year_god_duty: boolean
}

/** 择吉活动类别 */
export interface CategoryItem {
  key: string
  label: string
  icon: string
  count: number
}

/** 筛选结果 */
export interface FilterResult {
  category: string
  matched_dates: string[]
  total: number
}

/** 月简要数据 */
export interface DayBrief {
  date: string
  lunar_day: string
  weekday: string
  level_label: string
  solar_term: string
  day_officer: string
  day_ganzhi: string
  good_things: string[]
  bad_things: string[]
}

/** 月数据 */
export interface MonthData {
  year: number
  month: number
  month_days: number
  lunar_month_info: string
  days: DayBrief[]
}

/** 人员信息（用于择吉分析） */
export interface PersonInfo {
  name: string
  gender: '男' | '女'
  birthDateTime: string
  birthplace: string
  longitude?: number
}

/** 择吉结果 */
export interface HuangliResult {
  /** 选择的日期 */
  selectedDate: string
  /** 择吉活动类型 */
  activity: string
  /** 当日黄历详情 */
  dayDetail: DayHuangli
  /** 筛选出的吉日列表 */
  auspiciousDays: string[]
  /** 查询时间 */
  queryTime: string
  /** 人员信息（可选） */
  personInfo?: PersonInfo
}

// ── 活动关键词映射（必须与后端 ACTIVITY_CATEGORIES 保持一致） ──
// 关键词列表经 cnlunar 2026-08 实际输出验证（68个宜事词）

export const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  // ═══ 传统活动（30项）═══
  婚嫁: ['结婚姻', '嫁娶', '纳采', '冠带', '冠笄', '婚姻', '问名', '纳吉', '纳征', '请期', '亲迎', '纳婿', '招赘'],
  祭祀: ['祭祀', '祈福', '酬神', '还愿', '祭祖', '祭天地', '祭灶', '谢土'],
  安葬: ['安葬', '修坟', '立碑', '成服', '除服', '移柩', '启攒', '破土', '行丧', '安厝', '入殓'],
  动土: ['修造', '动土', '起基', '竖柱', '上梁', '盖屋', '安门', '作灶', '修仓库', '修置产室', '修宫室', '营建', '缮城郭', '开渠', '穿井', '筑堤', '修桥', '修路', '补垣', '塞穴', '修饰垣墙', '平治道涂'],
  入宅: ['入宅', '搬移', '移徙', '迁徙', '移居'],
  出行: ['出行', '远行', '赴任', '出国'],
  开业: ['开市', '开张', '开市立券', '立券', '交易', '纳财', '开仓', '开仓库', '出货财', '求财', '置产', '挂匾'],
  上官: ['上官', '赴任', '上任', '就职', '到任', '莅任', '就任'],
  祈福: ['祈福', '祭祀', '酬神', '还愿', '谢土'],
  求嗣: ['求嗣'],
  入学: ['入学', '求师', '拜师', '学艺', '习艺', '进学', '启蒙'],
  裁衣: ['裁制', '裁衣', '经络'],
  纳采: ['纳采', '结婚姻', '问名', '纳吉', '订盟'],
  订盟: ['订盟', '纳采', '结婚姻', '问名', '纳吉'],
  纳畜: ['纳畜', '牧养'],
  开市: ['开市', '开张', '开市立券', '立券交易'],
  交易: ['交易', '立券交易', '纳财'],
  立券: ['立券', '立券交易', '交易', '纳财'],
  挂匾: ['挂匾', '开市', '纳财', '开张'],
  拆卸: ['拆卸', '破屋坏垣', '补垣', '塞穴'],
  修造: ['修造', '修宫室', '修置产室', '营建', '缮城郭', '修饰垣墙', '补垣', '塞穴'],
  上梁: ['上梁', '竖柱上梁', '竖柱'],
  安床: ['安床', '设床', '安床设帐', '安床铺床', '设帐'],
  安门: ['安门', '修造', '修宫室', '营建'],
  作灶: ['作灶', '安碓硙', '修造'],
  移徙: ['移徙', '搬移', '迁徙', '移居'],
  安香: ['安香', '祭祀', '祈福'],
  沐浴: ['沐浴'],
  剃头: ['剃头', '整容', '整手足甲'],
  扫舍: ['扫舍', '扫舍宇', '解除'],

  // ═══ 现代活动（30项）═══
  领证: ['纳采', '订盟', '问名', '纳吉', '请期', '结婚姻'],
  签约: ['立券', '交易', '订盟', '纳财', '立券交易'],
  求职: ['赴任', '上任', '就职', '到任', '莅任', '就任', '求仕', '求官', '上官'],
  搬家: ['移徙', '搬移', '入宅', '迁徙', '移居'],
  买车: ['交易', '纳财', '纳畜', '置产', '立券交易'],
  提车: ['交易', '纳财', '出行', '纳畜', '立券交易'],
  装修: ['修饰垣墙', '修造', '拆卸', '修葺', '修整', '修补', '补垣', '破屋坏垣', '修宫室', '营建'],
  谈判: ['会宾客', '会亲友', '会商', '宴客', '招贤', '宴会'],
  会友: ['会亲友', '会宾客', '宴客', '招贤', '接客', '宴会'],
  求医: ['求医疗病', '治病', '服药', '针灸', '施药', '诊病'],
  栽种: ['栽种', '种植', '播种', '牧养'],
  入职: ['赴任', '上任', '就职', '到任', '莅任', '就任', '上官'],
  投资: ['纳财', '求财', '开仓', '纳畜', '置产'],
  购房: ['纳财', '置产', '入宅', '搬移', '移徙'],
  出国: ['出行', '远行', '出国', '赴任'],
  出差: ['出行', '远行', '赴任'],
  考试: ['入学', '求师', '拜师', '学艺', '习艺', '进学', '启蒙'],
  面试: ['招贤', '上官', '赴任', '上任', '就职'],
  答辩: ['诉讼', '上表章', '颁诏', '雪冤'],
  晋升: ['上官', '赴任', '上任', '就职', '到任', '莅任', '就任', '庆赐', '施恩', '覃恩'],
  转行: ['求师', '拜师', '学艺', '习艺', '入学'],
  创业: ['开市', '立券交易', '纳财', '开张', '开仓'],
  注册: ['立券交易', '纳财', '立券', '交易'],
  专利: ['颁诏', '上表章', '覃恩'],
  发布: ['颁诏', '宣政事', '布政事', '上表章'],
  活动: ['宴会', '招贤', '会亲友', '会宾客', '宴客', '庆赐'],
  直播: ['宣政事', '布政事', '颁诏', '上表章'],
  旅游: ['出行', '远行', '出国'],
  健身: ['整手足甲', '沐浴', '整容', '剃头'],
  美容: ['整容', '剃头', '整手足甲', '沐浴'],
}

/** 获取某日宜事项中与指定活动匹配的关键词 */
export function getMatchedThings(goodThings: string[], activity: string): string[] {
  const keywords = ACTIVITY_KEYWORDS[activity] || []
  return goodThings.filter(t => keywords.some(k => t.includes(k)))
}

/** 吉日等级排序权重（吉 > 平 > 凶） */
export const LEVEL_ORDER: Record<string, number> = { 吉: 0, 平: 1, 凶: 2 }

/** 计算吉日推荐得分（用于排序） */
export function getDayScore(detail: DayHuangli): number {
  let score = 0
  score += (LEVEL_ORDER[detail.level_label] ?? 3) * -10  // 吉=0, 平=-10, 凶=-20
  score += detail.good_gods.length * 2                    // 吉神越多越好
  score -= detail.bad_gods.length                         // 凶煞越多越差
  if (detail.is_de) score += 3                            // 有德神加分
  return score
}

// ── API 调用 ──

/** 获取某日黄历详情 */
export async function fetchDayDetail(year: number, month: number, day: number): Promise<DayHuangli> {
  const res = await fetch(`${API_BASE}/huangli/day?year=${year}&month=${month}&day=${day}`)
  if (!res.ok) throw new Error(`获取黄历数据失败 (HTTP ${res.status})`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || '获取黄历数据失败')
  return data.data
}

/** 获取月黄历数据 */
export async function fetchMonthData(year: number, month: number): Promise<MonthData> {
  const res = await fetch(`${API_BASE}/huangli/month?year=${year}&month=${month}`)
  if (!res.ok) throw new Error(`获取月黄历数据失败 (HTTP ${res.status})`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || '获取月黄历数据失败')
  return data.data
}

/** 获取活动类别列表 */
export async function fetchCategories(): Promise<CategoryItem[]> {
  const res = await fetch(`${API_BASE}/huangli/categories`)
  if (!res.ok) return []
  const data = await res.json()
  if (!data.success) return []
  return data.data
}

/** 筛选某月宜某活动的吉日 */
export async function filterAuspiciousDays(
  year: number, month: number, activity: string,
): Promise<FilterResult> {
  const res = await fetch(
    `${API_BASE}/huangli/filter?year=${year}&month=${month}&activity=${encodeURIComponent(activity)}`,
  )
  if (!res.ok) throw new Error(`筛选吉日失败 (HTTP ${res.status})`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || '筛选吉日失败')
  return data.data
}

// ── 序列化函数 ──

const TWO_HOUR_NAMES_SHORT = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

/** 将黄道择吉结果序列化为 LLM 上下文文本（结构化 Markdown 格式） */
export function serializeHuangliContext(result: HuangliResult): string {
  const lines: string[] = []
  const d = result.dayDetail

  // ═══ 标题 ═══
  lines.push('# 黄道择吉排盘信息')
  lines.push('')

  // ═══ 人员信息 ═══
  if (result.personInfo) {
    const p = result.personInfo
    lines.push('## 零、人员信息')
    lines.push('')
    lines.push(`- **姓名**：${p.name}`)
    lines.push(`- **性别**：${p.gender}`)
    if (p.birthDateTime) lines.push(`- **出生时间**：${p.birthDateTime.replace('T', ' ')}`)
    if (p.birthplace) lines.push(`- **出生地点**：${p.birthplace}`)
    lines.push('')
  }

  // ═══ 一、择吉信息 ═══
  lines.push('## 一、择吉信息')
  lines.push('')
  lines.push(`- **择吉事项**：${result.activity}`)
  lines.push(`- **查询时间**：${result.queryTime}`)
  lines.push(`- **选定日期**：${result.selectedDate} ${d.weekday}`)
  lines.push('')

  // ═══ 二、农历与干支 ═══
  lines.push('## 二、农历与干支')
  lines.push('')
  lines.push('| 项目 | 内容 |')
  lines.push('|------|------|')
  lines.push(`| 农历 | ${d.lunar_year} ${d.lunar_month}${d.lunar_day} |`)
  lines.push(`| 干支 | ${d.year_ganzhi}年 ${d.month_ganzhi}月 ${d.day_ganzhi}日 |`)
  lines.push(`| 生肖 | ${d.zodiac} |`)
  lines.push(`| 冲煞 | ${d.clash} |`)
  lines.push(`| 建除 | ${d.day_officer}日 · ${d.day_god} |`)
  lines.push(`| 星宿 | ${d.star_28} |`)
  if (d.nayin) lines.push(`| 纳音 | ${d.nayin} |`)
  lines.push(`| 五行 | ${d.elements} |`)
  if (d.solar_term !== '无') lines.push(`| 节气 | ${d.solar_term} |`)
  if (d.next_solar_term) lines.push(`| 下一节气 | ${d.next_solar_term} (${d.next_solar_term_date}) |`)
  if (d.fetal_god) lines.push(`| 胎神 | ${d.fetal_god} |`)
  if (d.zodiac_mark6) lines.push(`| 六合 | ${d.zodiac_mark6} |`)
  if (d.zodiac_mark3.length > 0) lines.push(`| 三合 | ${d.zodiac_mark3.join('、')} |`)
  lines.push(`| **吉凶等级** | **${d.level_label}** |`)
  lines.push('')

  // ═══ 三、宜忌 ═══
  lines.push('## 三、宜忌')
  lines.push('')
  lines.push(`- **宜**：${d.good_things.length > 0 ? d.good_things.join('、') : '无'}`)
  lines.push(`- **忌**：${d.bad_things.length > 0 ? d.bad_things.join('、') : '无'}`)
  if (d.peng_taboo) lines.push(`- **彭祖百忌**：${d.peng_taboo}`)
  lines.push('')

  // ═══ 四、吉神凶煞 ═══
  lines.push('## 四、吉神凶煞')
  lines.push('')
  lines.push('| 类别 | 神煞 |')
  lines.push('|------|------|')
  lines.push(`| 吉神 | ${d.good_gods.join('、') || '—'} |`)
  lines.push(`| 凶煞 | ${d.bad_gods.join('、') || '—'} |`)
  if (d.lucky_directions.length > 0) lines.push(`| 吉神方位 | ${d.lucky_directions.join(' ')} |`)
  if (d.is_de) lines.push('| 德神 | 有（从宜不从忌） |')
  lines.push('')

  // ═══ 五、时辰吉凶 ═══
  lines.push('## 五、时辰吉凶')
  lines.push('')
  lines.push('| 时辰 | 干支 | 吉凶 |')
  lines.push('|------|------|------|')
  d.twohour_list.forEach((h) => {
    lines.push(`| ${TWO_HOUR_NAMES_SHORT[h.hour]}时 | ${h.ganzhi} | ${h.lucky ? '吉' : '凶'} |`)
  })
  lines.push('')

  // ═══ 六、本月吉日 ═══
  if (result.auspiciousDays.length > 0) {
    lines.push('## 六、本月吉日')
    lines.push('')
    lines.push(`- **活动**：${result.activity}`)
    lines.push(`- **吉日数**：${result.auspiciousDays.length} 天`)
    lines.push(`- **吉日列表**：${result.auspiciousDays.join('、')}`)
    lines.push('')
  }

  // ═══ 七、分析要求 ═══
  lines.push('## 七、分析要求')
  lines.push('')
  lines.push(`请基于以上黄道择吉数据，为用户分析「${result.activity}」的择吉建议。`)
  lines.push('')
  lines.push('分析时请结合以下维度综合判断：')
  lines.push('')
  lines.push('1. **宜忌**：所选事项是否在当日"宜"中，忌中是否有冲突')
  lines.push('2. **建除十二神**：成/开/建/除日宜办大事，破/危/闭日宜避')
  lines.push('3. **吉神凶煞**：天德/月德/天恩等吉神加持，避五鬼/劫煞等凶煞')
  lines.push('4. **时辰吉凶**：选择吉时行事，避凶时')
  lines.push('5. **彭祖百忌**：传统禁忌参考')
  lines.push('6. **生肖冲煞**：避免与当事人生肖相冲')
  lines.push('7. **胎神方位**：动土/搬家等需注意胎神所在方位')
  lines.push('')
  lines.push('> 择吉仅为传统文化参考，不构成决策依据。')

  return lines.join('\n')
}

// ── JSON 序列化（用于注入 LLM 提示词，提升解盘准确性）──

/**
 * 将黄历择吉结果序列化为结构化 JSON，注入大模型提示词
 */
export function serializeHuangliJson(result: HuangliResult): string {
  const d = result.dayDetail
  return JSON.stringify({
    chartType: '黄历择吉',
    personInfo: result.personInfo ? {
      name: result.personInfo.name,
      gender: result.personInfo.gender,
      birthDateTime: result.personInfo.birthDateTime,
      birthplace: result.personInfo.birthplace,
    } : undefined,
    queryInfo: {
      activity: result.activity,
      queryTime: result.queryTime,
      selectedDate: result.selectedDate,
    },
    dayDetail: {
      lunar: { year: d.lunar_year, month: d.lunar_month, day: d.lunar_day },
      ganzhi: { year: d.year_ganzhi, month: d.month_ganzhi, day: d.day_ganzhi },
      weekday: d.weekday,
      zodiac: d.zodiac,
      clash: d.clash,
      dayOfficer: d.day_officer,
      dayGod: d.day_god,
      star28: d.star_28,
      nayin: d.nayin,
      elements: d.elements,
      level: d.level_label,
      goodThings: d.good_things,
      badThings: d.bad_things,
      goodGods: d.good_gods,
      badGods: d.bad_gods,
      luckyDirections: d.lucky_directions,
      pengTaboo: d.peng_taboo,
      fetalGod: d.fetal_god,
      solarTerm: d.solar_term,
      nextSolarTerm: d.next_solar_term,
      nextSolarTermDate: d.next_solar_term_date,
      zodiacMark6: d.zodiac_mark6,
      zodiacMark3: d.zodiac_mark3,
      isDe: d.is_de,
    },
    twoHourList: d.twohour_list.map((h) => ({
      hour: h.hour,
      ganzhi: h.ganzhi,
      lucky: h.lucky,
    })),
    auspiciousDays: result.auspiciousDays,
  }, null, 2)
}
