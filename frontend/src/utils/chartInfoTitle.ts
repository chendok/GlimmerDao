import type { DaYun, LiuNian, LiuYue, LiuRi, LiuShi } from './baziCalculator'
import type { ZiweiDaXian, ZiweiLiuNian, ZiweiLiuYue, ZiweiLiuRi, ZiweiLiuShi } from './ziweiCalculator'

/**
 * 排盘信息时间维度选择快照
 */
export interface ChartInfoSelection {
  dayun?: string | null      // "丙午(2026-2035)"
  liunian?: string | null    // "2026丙午年"
  liuyue?: string | null     // "3月甲子"
  liuri?: string | null      // "15日戊辰"
  liushi?: string | null     // "子时壬子"
}

/**
 * 生成排盘信息记录标题
 * 规则: {chartName}_{chartType}_{时间维度串}_{YYYYMMDD}
 * - 无焦点时: "张三_八字_本命盘_20260729"
 * - 含流年: "张三_八字_流年2026丙午年_流月3月甲子_20260729"
 */
export function buildChartInfoTitle(
  chartName: string,
  chartType: '八字' | '紫微' | '麻衣神相' | '六爻' | '梅花易数' | '黄历择吉',
  selection: ChartInfoSelection,
): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const parts: string[] = [chartName || '命主', chartType]

  const dimStr = buildDimensionString(selection)
  parts.push(dimStr || '本命盘')
  parts.push(dateStr)
  return parts.join('_')
}

/**
 * 将时间维度选择拼接为可读字符串
 */
export function buildDimensionString(sel: ChartInfoSelection): string {
  const segs: string[] = []
  if (sel.dayun) segs.push(`大运${sel.dayun}`)
  if (sel.liunian) segs.push(`流年${sel.liunian}`)
  if (sel.liuyue) segs.push(`流月${sel.liuyue}`)
  if (sel.liuri) segs.push(`流日${sel.liuri}`)
  if (sel.liushi) segs.push(`流时${sel.liushi}`)
  return segs.join('_')
}

/**
 * 判断是否有任何时间维度焦点
 */
export function hasAnyFocus(sel: ChartInfoSelection): boolean {
  return !!(sel.dayun || sel.liunian || sel.liuyue || sel.liuri || sel.liushi)
}

// ── 八字：从选中对象提取维度描述 ──
export function buildBaziSelection(
  selDaYun: DaYun | null,
  selLiuNian: LiuNian | null,
  selLiuYue: LiuYue | null,
  selLiuRi: LiuRi | null,
  selLiuShi: LiuShi | null,
): ChartInfoSelection {
  return {
    dayun: selDaYun
      ? `${selDaYun.gan}${selDaYun.zhi}(${selDaYun.startYear}-${selDaYun.endYear})`
      : null,
    liunian: selLiuNian
      ? `${selLiuNian.year}${selLiuNian.gan}${selLiuNian.zhi}年`
      : null,
    liuyue: selLiuYue
      ? `${selLiuYue.month}月${selLiuYue.gan}${selLiuYue.zhi}`
      : null,
    liuri: selLiuRi
      ? `${selLiuRi.day}日${selLiuRi.gan}${selLiuRi.zhi}`
      : null,
    liushi: selLiuShi
      ? `${selLiuShi.zhi}时${selLiuShi.gan}${selLiuShi.zhi}`
      : null,
  }
}

// ── 紫微：从选中对象提取维度描述 ──
export function buildZiweiSelection(
  selDaXian: ZiweiDaXian | null,
  selLiuNian: ZiweiLiuNian | null,
  selLiuYue: ZiweiLiuYue | null,
  selLiuRi: ZiweiLiuRi | null,
  selLiuShi: ZiweiLiuShi | null,
): ChartInfoSelection {
  return {
    dayun: selDaXian
      ? `${selDaXian.gan}${selDaXian.zhi}(${selDaXian.startAge}-${selDaXian.endAge}岁)`
      : null,
    liunian: selLiuNian
      ? `${selLiuNian.year}${selLiuNian.gan}${selLiuNian.zhi}年`
      : null,
    liuyue: selLiuYue
      ? `${selLiuYue.month}月${selLiuYue.gan}${selLiuYue.zhi}`
      : null,
    liuri: selLiuRi
      ? `${selLiuRi.day}日${selLiuRi.gan}${selLiuRi.zhi}`
      : null,
    liushi: selLiuShi
      ? `${selLiuShi.zhi}时${selLiuShi.gan}${selLiuShi.zhi}`
      : null,
  }
}
