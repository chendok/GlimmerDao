import { calculateZiwei } from '../utils/ziweiCalculator'
import type { ZiweiResult, ZiweiDaXian, ZiweiLiuNian, ZiweiLiuYue, ZiweiLiuRi, ZiweiLiuShi } from '../utils/ziweiCalculator'
import { resolveFourPillarsToSolar } from '../utils/baziCalculator'
import ZiweiResultView from './ZiweiResult'
import BirthInfoForm, { type BirthInfo } from './BirthInfoForm'


// 紫微排盘选中数据类型（与 FeatureContent 中的 ZiweiSelection 保持一致）
export interface ZiweiSelection {
  daXian: ZiweiDaXian | null
  liuNian: ZiweiLiuNian | null
  liuYue: ZiweiLiuYue | null
  liuRi: ZiweiLiuRi | null
  liuShi: ZiweiLiuShi | null
}

export default function ZiweiForm({ result, setResult, containerWidth, onSelectionChange, onToggleCollapse, chartCollapsed, collapseNonce, supplementalInfo, onSupplementalChange }: {
  result: ZiweiResult | null
  supplementalInfo: string
  onSupplementalChange: (value: string) => void
  setResult: (r: ZiweiResult | null) => void
  containerWidth: number
  onSelectionChange?: (selection: ZiweiSelection | null) => void
  onToggleCollapse?: () => void
  chartCollapsed?: boolean
  collapseNonce?: number
}) {
  const handleSubmit = (info: BirthInfo) => {
    let year: number
    let month: number
    let day: number
    let hour: number
    let minute: number
    let isLunar = false

    if (info.calendarType === '四柱') {
      // 四柱干支反推公历日期（紫微斗数需要具体日期排盘）
      const matches = resolveFourPillarsToSolar(
        info.yearGan,
        info.yearZhi,
        info.monthGan,
        info.monthZhi,
        info.dayGan,
        info.dayZhi,
        info.hourGan,
        info.hourZhi,
      )
      if (matches.length === 0) {
        alert('无法根据输入的四柱干支确定唯一公历日期，请改用公历或农历日期。')
        return
      }
      // 四柱干支按 60 年循环，可能出现多个候选（如 1986 / 2046 年）。
      // 优先取「年份 ≤ 当前年份且最大」的候选（符合已出生者的常识）。
      const nowYear = new Date().getFullYear()
      let chosen = matches[0]
      for (const m of matches) {
        if (m.year <= nowYear && m.year > chosen.year) {
          chosen = m
        }
      }
      if (matches.length > 1) {
        alert(`根据四柱干支匹配到 ${matches.length} 个候选日期，已取 ${chosen.year} 年 ${chosen.month} 月 ${chosen.day} 日。若结果不准确，请改用公历或农历日期。`)
      }
      const m = chosen
      year = m.year
      month = m.month
      day = m.day
      hour = m.hour
      minute = m.minute
    } else {
      const [datePart, timePart] = info.birthDateTime.split('T')
      const [y, mo, d] = datePart.split('-').map(Number)
      year = y
      month = mo
      day = d
      hour = timePart ? parseInt(timePart.split(':')[0]) : 0
      minute = timePart ? parseInt(timePart.split(':')[1]) : 0
      isLunar = info.calendarType === '农历'
    }

    const ziweiResult = calculateZiwei(
      info.name,
      info.gender,
      year,
      month,
      day,
      hour,
      minute,
      isLunar,
      info.longitude,
    )

    setResult(ziweiResult)
  }

  if (result) {
    return (
      <ZiweiResultView
        result={result}
        onBack={() => {
          setResult(null)
          onSelectionChange?.(null)
        }}
        containerWidth={containerWidth}
        onSelectionChange={onSelectionChange}
        supplementalInfo={supplementalInfo}
        onSupplementalChange={onSupplementalChange}
        onToggleCollapse={onToggleCollapse}
        chartCollapsed={chartCollapsed}
        collapseNonce={collapseNonce}
      />
    )
  }

  return (
    <div className="feature-bazi">
      <div className="bazi-form-card ziwei-form-card">
        <BirthInfoForm
          title="输入人员信息"
          calendarTypes={['公历', '农历']}
          showArchive={true}
          showBirthplace={true}
          submitLabel="开始排盘"
          onSubmit={handleSubmit}
          featureId="ziwei"
        />
      </div>
    </div>
  )
}