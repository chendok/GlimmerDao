import { Lunar } from 'lunar-javascript'

/**
 * 格式化出生时间为展示字符串。
 *
 * - 公历：`公历 2026年8月5日 22:00`
 * - 农历：`2026丙午年七月初五亥时`（中文格式，含年干支/月/日/时辰）
 * - 四柱：`四柱 丙午年乙未月辛亥日己亥时`（已移除四柱录入，历史数据兜底显示）
 *
 * @param birthDateTime 形如 `YYYY-MM-DDTHH:mm` 的数字日期（公历/农历语义由 calendarType 决定），
 *                      或 `四柱-XXX` 字符串
 * @param calendarType  公历 / 农历 / 四柱
 * @param isLeapMonth   农历模式下是否为闰月
 */
export function formatBirthDateTime(
  birthDateTime: string | undefined | null,
  calendarType: string,
  isLeapMonth?: boolean,
): string {
  if (!birthDateTime) return '-'

  // 四柱（历史数据兜底）
  if (calendarType === '四柱' || birthDateTime.startsWith('四柱-')) {
    const pillarStr = birthDateTime.startsWith('四柱-') ? birthDateTime.replace('四柱-', '') : birthDateTime
    const p = pillarStr.replace(/[年月日时]/g, '')
    return `四柱 ${p.slice(0, 2)}年 ${p.slice(2, 4)}月 ${p.slice(4, 6)}日 ${p.slice(6, 8)}时`
  }

  const parts = birthDateTime.split('T')
  const datePart = parts[0] || ''
  const timePart = parts[1] || ''
  const [y, m, d] = datePart.split('-')
  const [h, min] = timePart.split(':')
  if (!y || !m || !d) return birthDateTime.replace('T', ' ')

  if (calendarType === '农历') {
    const ly = parseInt(y, 10)
    const lm = parseInt(m, 10)
    const ld = parseInt(d, 10)
    const lh = h ? parseInt(h, 10) : 0
    if ([ly, lm, ld].some(Number.isNaN)) return `${y}-${m}-${d} ${timePart || ''}`
    try {
      // 闰月用负数表示
      const effectiveMonth = isLeapMonth ? -lm : lm
      const lunar = Lunar.fromYmdHms(ly, effectiveMonth, ld, lh, 0, 0)
      const ganzhi = lunar.getYearInGanZhi()
      // getMonthInChinese 返回如「七」「闰七」，需补「月」字
      const monthName = `${lunar.getMonthInChinese()}月`
      const dayName = lunar.getDayInChinese()
      const timeZhi = lunar.getTimeZhi()
      return `${ly}${ganzhi}年${monthName}${dayName}${timeZhi}时`
    } catch {
      return `${y}年${m}月${d}日 ${h}:${min || '00'}`
    }
  }

  // 公历
  return `${y}年${m}月${d}日 ${h}:${min || '00'}`
}

/**
 * 从档案的 bazi_result 中提取出生元信息（闰月/四柱干支等）。
 */
export function getBirthMeta(bazi_result: Record<string, unknown> | null | undefined): {
  isLeapMonth?: boolean
} {
  const meta = bazi_result as
    | { __birth_meta__?: { isLeapMonth?: boolean } }
    | null
    | undefined
  return meta?.__birth_meta__ || {}
}

/**
 * 直接根据档案字段格式化出生时间（供档案库列表/详情使用）。
 */
export function formatArchiveBirth(
  birth_datetime: string | undefined | null,
  calendar_type: string,
  bazi_result: Record<string, unknown> | null,
): string {
  const { isLeapMonth } = getBirthMeta(bazi_result)
  return formatBirthDateTime(birth_datetime, calendar_type, isLeapMonth)
}
