import { useState, useEffect, useRef, useCallback } from 'react'
import type { CSSProperties } from 'react'
import type { FeatureKey } from '../context/ChatContext'
import { GAN_YIN_YANG, GAN_WX as _GAN_WX, ZHI_WX as _ZHI_WX } from '../core/mingli'
import { getShiShen, calcDayMasterStrength, calcPattern, countWuXing } from '../core/bazi'
import { useChatContext } from '../hooks/useChatContext'
import { useContainerSize } from '../hooks/useContainerSize'
import BaziResultView from './BaziResult'
import { calculateBazi, calculateBaziFromGZ, serializeBaziJson } from '../utils/baziCalculator'
import { Lunar } from 'lunar-javascript'
import type { BaziResult, DaYun, LiuNian, LiuYue, LiuRi, LiuShi } from '../utils/baziCalculator'
import HuangliPanel from './HuangliPanel'
import ChatArea from './ChatArea'
import InputBar from './InputBar'
import ZiweiForm from './ZiweiForm'
import BirthInfoForm, { type BirthInfo } from './BirthInfoForm'
import PhysiognomyForm from './PhysiognomyForm'
import LiuyaoForm from './LiuyaoForm'
import MeihuaForm from './MeihuaForm'
import HuangliDatePicker from './HuangliDatePicker'
import type { LiuyaoResult } from '../utils/liuyaoCalculator'
import { serializeLiuyaoContext, serializeLiuyaoJson } from '../utils/liuyaoCalculator'
import type { MeihuaResult } from '../utils/meihuaCalculator'
import { serializeMeihuaContext, serializeMeihuaJson } from '../utils/meihuaCalculator'
import type { HuangliResult } from '../utils/huangliCalculator'
import { serializeHuangliContext, serializeHuangliJson } from '../utils/huangliCalculator'
import type { ZiweiResult, ZiweiDaXian, ZiweiLiuNian, ZiweiLiuYue, ZiweiLiuRi, ZiweiLiuShi } from '../utils/ziweiCalculator'
import { serializeZiweiJson } from '../utils/ziweiCalculator'

// ── 排盘选中数据类型（用于上下文注入）──
interface BaziSelection {
  daYun: DaYun | null
  liuNian: LiuNian | null
  liuYue: LiuYue | null
  liuRi: LiuRi | null
  liuShi: LiuShi | null
}

interface ZiweiSelection {
  daXian: ZiweiDaXian | null
  liuNian: ZiweiLiuNian | null
  liuYue: ZiweiLiuYue | null
  liuRi: ZiweiLiuRi | null
  liuShi: ZiweiLiuShi | null
}

interface FeatureContentProps {
  feature: FeatureKey
  resetTrigger: number
}

// 需要排盘/起卦的功能模块（其余模块展示知识科普内容）
const CHART_FEATURES: FeatureKey[] = ['四柱八字', '紫微斗数', '六爻占卜', '梅花易数', '黄历择吉', '麻衣神相']

// ── 四柱八字排盘表单 ──
function BaziForm({ result, setResult, containerWidth, onSelectionChange, onToggleCollapse, chartCollapsed, collapseNonce, supplementalInfo, onSupplementalChange }: {
  result: BaziResult | null
  supplementalInfo: string
  onSupplementalChange: (value: string) => void
  setResult: (r: BaziResult | null) => void
  containerWidth: number
  onSelectionChange?: (selection: BaziSelection | null) => void
  onToggleCollapse?: () => void
  chartCollapsed?: boolean
  collapseNonce?: number
}) {
  const handleSubmit = (info: BirthInfo) => {
    let baziResult: BaziResult

    if (info.calendarType === '四柱') {
      baziResult = calculateBaziFromGZ(
        info.name,
        info.gender,
        info.yearGan,
        info.yearZhi,
        info.monthGan,
        info.monthZhi,
        info.dayGan,
        info.dayZhi,
        info.hourGan,
        info.hourZhi,
        info.birthplace,
      )
    } else if (info.calendarType === '农历') {
      // 农历输入：先把农历日期转换为公历，再复用公历排盘算法
      const [datePart, timePart] = info.birthDateTime.split('T')
      const [lunarYear, lunarMonth, lunarDay] = datePart.split('-').map(Number)
      const hour = timePart ? parseInt(timePart.split(':')[0]) : 0
      const minute = timePart ? parseInt(timePart.split(':')[1]) : 0
      // 闰月：lunar-javascript 用负数月表示（如 -2 = 闰二月）
      const effectiveMonth = info.isLeapMonth ? -lunarMonth : lunarMonth
      const lunar = Lunar.fromYmdHms(lunarYear, effectiveMonth, lunarDay, hour, minute, 0)
      const solar = lunar.getSolar()
      baziResult = calculateBazi(
        info.name,
        info.gender,
        solar.getYear(),
        solar.getMonth(),
        solar.getDay(),
        solar.getHour(),
        solar.getMinute(),
        info.birthplace,
        info.longitude,
      )
    } else {
      const [datePart, timePart] = info.birthDateTime.split('T')
      const [year, month, day] = datePart.split('-').map(Number)
      const hour = timePart ? parseInt(timePart.split(':')[0]) : 0
      const minute = timePart ? parseInt(timePart.split(':')[1]) : 0
      baziResult = calculateBazi(info.name, info.gender, year, month, day, hour, minute, info.birthplace, info.longitude)
    }

    setResult(baziResult)
  }

  if (result) {
    return (
      <BaziResultView
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
      <div className="bazi-form-card">
        <BirthInfoForm
          title="输入人员信息"
          calendarTypes={['公历', '农历']}
          showArchive={true}
          showBirthplace={true}
          submitLabel="排盘"
          onSubmit={handleSubmit}
          featureId="bazi"
        />
      </div>
    </div>
  )
}

// ── 通用知识内容 ──
function KnowledgeContent({ feature }: { feature: FeatureKey }) {
  const knowledge: Partial<Record<FeatureKey, { title: string; desc: string; sections: { sub: string; text: string }[] }>> = {
    '黄历择吉': {
      title: '黄历择吉',
      desc: '黄历，又称老黄历、皇历，是在中国农历基础上产生的，带有每日吉凶宜忌的一种万年历。择吉是选择吉日良辰的学问。',
      sections: [
        { sub: '黄历的基本构成', text: '黄历包含公历、农历、干支历、二十四节气、二十八星宿、十二建星、吉神凶煞等信息，以及每日宜忌事项。' },
        { sub: '如何看黄历选吉日', text: '选择吉日需考虑：1）避开岁破、月破日；2）避开与生辰八字相冲的日子；3）选择天德、月德、天赦等吉神当值的日子；4）结合所办事项选择对应的宜忌。' },
        { sub: '常见择吉场景', text: '婚嫁择吉、开业择吉、搬家择吉、安葬择吉、出行择吉、签约择吉等，不同场景有不同的择吉侧重点。' },
        { sub: '互动提问', text: '您可以向AI提问：今天的黄历信息、某个日期的宜忌、如何选择婚嫁吉日、搬家选什么日子好等。' },
      ],
    },
    '麻衣神相': {
      title: '麻衣神相',
      desc: '麻衣神相是中国传统相面学的经典著作，通过观察人的面部特征来分析其性格、运势和命运。',
      sections: [
        { sub: '三停', text: '上停（额头至眉毛）：主管早年运，代表智慧、父母缘。中停（眉毛至鼻尖）：主管中年运，代表事业、婚姻。下停（鼻尖至下巴）：主管晚年运，代表子女、财富。' },
        { sub: '五官', text: '眉为保寿官、眼为监察官、鼻为审辨官、口为出纳官、耳为采听官。五官端正、相称者，运势较佳。' },
        { sub: '十二宫', text: '命宫（印堂）、财帛宫（鼻子）、兄弟宫（眉毛）、夫妻宫（眼角）、子女宫（眼下）、疾厄宫（山根）等十二宫，各有其对应的人生领域。' },
        { sub: '互动提问', text: '您可以向AI提问：如何看面相、什么是富贵相、面相与命运的关系等。' },
      ],
    },
    '六爻占卜': {
      title: '六爻占卜',
      desc: '六爻占卜又称纳甲筮法，是以三枚铜钱摇卦，通过八卦、六爻的变化来预测事物的吉凶趋势。',
      sections: [
        { sub: '起卦方法', text: '用三枚铜钱，双手合扣，摇动后掷出，共摇六次。每次根据正反面确定爻的阴阳和老阳老阴，六次组成一卦。' },
        { sub: '六爻结构', text: '六爻从下往上依次为初爻、二爻、三爻、四爻、五爻、上爻。每爻配以地支、五行、六亲、六神，形成完整的占卜体系。' },
        { sub: '六亲关系', text: '父母爻、兄弟爻、妻财爻、官鬼爻、子孙爻，分别对应不同的人生方面。六亲的生克关系是判断吉凶的关键。' },
        { sub: '互动提问', text: '您可以向AI提问：如何起卦、六爻断卦的方法、六亲含义等。' },
      ],
    },
    '梅花易数': {
      title: '梅花易数',
      desc: '梅花易数是宋代邵雍所创的占卜方法，以"象、数、理"三位一体为核心，通过数字、物象、时间等起卦。',
      sections: [
        { sub: '起卦方式', text: '梅花易数起卦方式灵活多样：1）年月日时起卦；2）数字起卦；3）物象起卦；4）声音起卦；5）字数起卦。万物皆可起卦。' },
        { sub: '体用生克', text: '体卦代表自己，用卦代表所问之事。体用五行相生则吉，相克则凶。体克用：事可成但有阻力；用克体：事不可为；体生用：有损耗；用生体：大吉大利。' },
        { sub: '互卦与变卦', text: '本卦为当前状态，互卦为发展过程，变卦为最终结果。三卦结合分析，才能全面把握事物的发展趋势。' },
        { sub: '互动提问', text: '您可以向AI提问：如何用梅花易数起卦、体用生克关系、互卦和变卦的含义等。' },
      ],
    },
    '紫微斗数': {
      title: '紫微斗数',
      desc: '紫微斗数是中国传统命理学中的帝王之学，以紫微星为核心，通过十二宫、十四主星的排列来分析命运。',
      sections: [
        { sub: '十二宫', text: '命宫、兄弟宫、夫妻宫、子女宫、财帛宫、疾厄宫、迁移宫、交友宫、官禄宫、田宅宫、福德宫、父母宫。' },
        { sub: '十四主星', text: '紫微、天机、太阳、武曲、天同、廉贞、天府、太阴、贪狼、巨门、天相、天梁、七杀、破军。各星在不同宫位有不同含义。' },
        { sub: '四化星', text: '化禄（增益）、化权（权力）、化科（名望）、化忌（阻碍）。四化星是紫微斗数中最重要的动态因素，决定星曜的吉凶显化。' },
        { sub: '互动提问', text: '您可以向AI提问：紫微斗数十二宫的含义、主星在命宫代表什么、四化星的作用等。' },
      ],
    },
  }

  const data = knowledge[feature]
  if (!data) return null

  return (
    <div className="feature-knowledge">
      <div className="feature-knowledge-header">
        <h2>{data.title}</h2>
        <p className="feature-knowledge-desc">{data.desc}</p>
      </div>
      <div className="feature-knowledge-sections">
        {data.sections.map((s) => (
          <div key={s.sub} className="knowledge-section">
            <h3>{s.sub}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 上下文序列化辅助函数 ──
// 命理算法（十神/日主强弱/格局/五行分布）统一从 core/bazi 导入

/**
 * 排盘结果完整性校验
 *
 * 检查所有必要命理元素是否齐全：
 * - 四柱干支（年/月/日/时柱）
 * - 十神格局（主星、副星）
 * - 五行分布
 * - 大运流年
 * - 神煞信息
 * - 藏干、星运、自坐、空亡等
 *
 * @returns 校验结果：valid 表示是否完整，missing 列出缺失字段
 */
function validateBaziResult(result: BaziResult): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  const pillars = [
    { name: '年柱', p: result.yearPillar },
    { name: '月柱', p: result.monthPillar },
    { name: '日柱', p: result.dayPillar },
    { name: '时柱', p: result.hourPillar },
  ]
  // 四柱干支
  for (const { name, p } of pillars) {
    if (!p?.gan || !p?.zhi) missing.push(`${name}干支`)
  }
  // 十神（主星/副星）
  for (const { name, p } of pillars) {
    if (!p?.zhuXing) missing.push(`${name}主星`)
  }
  // 藏干
  for (const { name, p } of pillars) {
    if (!p?.zangGan || p.zangGan.length === 0) missing.push(`${name}藏干`)
  }
  // 纳音
  for (const { name, p } of pillars) {
    if (!p?.naYin) missing.push(`${name}纳音`)
  }
  // 星运/自坐/空亡
  for (const { name, p } of pillars) {
    if (!p?.xingYun) missing.push(`${name}星运`)
    if (!p?.zizuo) missing.push(`${name}自坐`)
  }
  // 神煞
  if (!result.shenSha || Object.keys(result.shenSha).length === 0) {
    missing.push('神煞信息')
  }
  // 大运
  if (!result.daYunList || result.daYunList.length === 0) {
    missing.push('大运排列')
  }
  // 起运
  if (!result.qiYunInfo?.startAge) {
    missing.push('起运信息')
  }
  return { valid: missing.length === 0, missing }
}

/**
 * 将八字排盘结果序列化为结构化文本，作为 LLM 的上下文数据
 *
 * 包含完整的命理数据：
 * 1. 基础信息（姓名、性别、出生日期、真太阳时、出生地）
 * 2. 四柱八字（天干、地支、纳音、主星、副星、藏干、星运、自坐、空亡）
 * 3. 日主强弱与格局判定
 * 4. 五行分布统计
 * 5. 神煞信息（各柱）
 * 6. 大运排列（含十神）
 * 7. 当前流年
 * 8. 地支关系（六合、六冲、三合等）
 * 9. 用户选中的大运、流年、流月、流日、流时（动态分析焦点）
 */
function serializeBaziContext(result: BaziResult, selection?: BaziSelection): string {
  const lines: string[] = []

  // ── 预计算日主强弱与格局（JSON 需要）──
  const strength = calcDayMasterStrength(
    result.dayPillar.gan,
    result.monthPillar.zhi,
    result.yearPillar,
    result.monthPillar,
    result.hourPillar,
  )
  const pattern = calcPattern(result.dayPillar.gan, result.monthPillar.zhi)

  // ── JSON 结构化数据（优先分析源，提升解盘准确性）──
  lines.push('## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）')
  lines.push('')
  lines.push('```json')
  lines.push(serializeBaziJson(result, {
    strengthLevel: strength.level,
    strengthScore: strength.score,
    strengthDetail: strength.detail,
    patternName: pattern,
  }, selection ? {
    daYun: selection.daYun,
    liuNian: selection.liuNian,
    liuYue: selection.liuYue,
    liuRi: selection.liuRi,
    liuShi: selection.liuShi,
  } : undefined))
  lines.push('```')
  lines.push('')
  lines.push('---')
  lines.push('')

  // ── 1. 基础信息 ──
  lines.push('【八字排盘信息】')
  lines.push(`姓名：${result.name}`)
  lines.push(`性别：${result.gender === '男' ? '男（乾造）' : '女（坤造）'}`)
  lines.push(`出生日期：公历 ${result.solarDate}`)
  if (result.trueSolarTimeStr && result.trueSolarTimeStr !== '--') {
    lines.push(`真太阳时：${result.trueSolarTimeStr}`)
  }
  if (result.birthplace) {
    lines.push(`出生地：${result.birthplace}`)
  }
  lines.push('')

  // ── 2. 四柱八字详细 ──
  lines.push('【四柱八字】')
  const pillarLabels = ['年柱', '月柱', '日柱', '时柱']
  const pillars = [result.yearPillar, result.monthPillar, result.dayPillar, result.hourPillar]
  pillars.forEach((p, i) => {
    const label = pillarLabels[i]
    const isDay = i === 2
    lines.push(`  ${label}：${p.gan}${p.zhi}（纳音：${p.naYin || '—'}）${isDay ? ' ← 日主' : ''}`)
    lines.push(`    主星：${isDay ? '日主' : (p.zhuXing || '—')}`)
    lines.push(`    副星：${(p.fuXing && p.fuXing.length > 0) ? p.fuXing.join('、') : '—'}`)
    lines.push(`    藏干：${(p.zangGan && p.zangGan.length > 0) ? p.zangGan.join('、') : '—'}`)
    lines.push(`    星运：${p.xingYun || '—'}　自坐：${p.zizuo || '—'}`)
    if (p.kongWang && p.kongWang.length > 0) {
      lines.push(`    空亡：${p.kongWang.join('、')}`)
    }
  })
  lines.push('')

  // ── 3. 日主强弱与格局 ──
  lines.push('【日主与格局】')
  lines.push(`日主：${result.dayPillar.gan}（${_GAN_WX[result.dayPillar.gan]}行，${GAN_YIN_YANG[result.dayPillar.gan]}）`)
  lines.push(`日主强弱：${strength.level}（评分 ${strength.score}/100，${strength.detail}）`)
  lines.push(`格局：${pattern}`)
  lines.push(`月令：${result.monthPillar.zhi}（${_ZHI_WX[result.monthPillar.zhi]}行）`)
  lines.push('')

  // ── 4. 五行分布 ──
  const wxCounts = countWuXing(result)
  const wxOrder: Array<keyof typeof wxCounts> = ['金', '木', '水', '火', '土']
  lines.push('【五行分布】')
  lines.push(`  ${wxOrder.map(w => `${w}=${wxCounts[w]}`).join('，')}`)
  // 找出最旺和最弱
  const sorted = wxOrder.slice().sort((a, b) => wxCounts[b] - wxCounts[a])
  lines.push(`  最旺：${sorted[0]}（${wxCounts[sorted[0]]}）　最弱：${sorted[sorted.length - 1]}（${wxCounts[sorted[sorted.length - 1]]}）`)
  lines.push('')

  // ── 5. 神煞信息 ──
  lines.push('【神煞信息】')
  if (result.shenSha) {
    pillarLabels.forEach((label, i) => {
      const key = label
      const ssList = result.shenSha[key]
      if (ssList && ssList.length > 0) {
        lines.push(`  ${label}：${ssList.join('、')}`)
      } else {
        lines.push(`  ${label}：—`)
      }
    })
  } else {
    lines.push('  （无神煞数据）')
  }
  lines.push('')

  // ── 6. 起运与大运 ──
  lines.push('【起运与大运】')
  if (result.qiYunInfo) {
    lines.push(`起运：${result.qiYunInfo.startAge}岁起运（${result.qiYunInfo.years}年${result.qiYunInfo.months}月${result.qiYunInfo.days}日）`)
  }
  if (result.daYunList && result.daYunList.length > 0) {
    lines.push('大运排列：')
    for (const dy of result.daYunList) {
      const parts = [`  ${dy.startAge}-${dy.endAge}岁 ${dy.gan}${dy.zhi}`]
      if (dy.zhuXing) parts.push(`主星[${dy.zhuXing}]`)
      if (dy.fuXing && dy.fuXing.length > 0) parts.push(`副星[${dy.fuXing.join('、')}]`)
      lines.push(parts.join(' '))
    }
  }
  lines.push('')

  // ── 7. 当前流年 ──
  const nowYear = new Date().getFullYear()
  if (result.liuNianList) {
    const thisYear = result.liuNianList.find((ln) => ln.year === nowYear)
    if (thisYear) {
      const parts = [`当前流年：${nowYear}年 ${thisYear.gan}${thisYear.zhi}`]
      if (thisYear.zhuXing) parts.push(`主星[${thisYear.zhuXing}]`)
      lines.push(parts.join(' '))
      lines.push('')
    }
  }

  // ── 8. 地支关系 ──
  if (result.diZhiRelations && result.diZhiRelations.length > 0) {
    lines.push('【地支关系】')
    lines.push(`  ${result.diZhiRelations.join('，')}`)
    lines.push('')
  }

  // ── 9. 用户选中的动态分析焦点（大运/流年/流月/流日/流时）──
  if (selection) {
    const focusLines: string[] = []
    if (selection.daYun) {
      const dy = selection.daYun
      const parts = [`大运：${dy.startAge}-${dy.endAge}岁（${dy.startYear}-${dy.endYear}年）${dy.gan}${dy.zhi}`]
      if (dy.zhuXing) parts.push(`主星[${dy.zhuXing}]`)
      if (dy.fuXing && dy.fuXing.length > 0) parts.push(`副星[${dy.fuXing.join('、')}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuNian) {
      const ln = selection.liuNian
      const parts = [`流年：${ln.year}年 ${ln.gan}${ln.zhi}`]
      if (ln.wuXing) parts.push(`五行[${ln.wuXing}]`)
      if (ln.zhuXing) parts.push(`主星[${ln.zhuXing}]`)
      if (ln.fuXing && ln.fuXing.length > 0) parts.push(`副星[${ln.fuXing.join('、')}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuYue) {
      const ly = selection.liuYue
      const parts = [`流月：${ly.month}月 ${ly.gan}${ly.zhi}`]
      if (ly.wuXing) parts.push(`五行[${ly.wuXing}]`)
      if (ly.zhuXing) parts.push(`主星[${ly.zhuXing}]`)
      if (ly.fuXing && ly.fuXing.length > 0) parts.push(`副星[${ly.fuXing.join('、')}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuRi) {
      const lr = selection.liuRi
      const weekdayNames = ['日', '一', '二', '三', '四', '五', '六']
      const parts = [`流日：${lr.day}日（星期${weekdayNames[lr.weekday] || '?'}）${lr.gan}${lr.zhi}`]
      if (lr.wuXing) parts.push(`五行[${lr.wuXing}]`)
      if (lr.zhuXing) parts.push(`主星[${lr.zhuXing}]`)
      if (lr.fuXing && lr.fuXing.length > 0) parts.push(`副星[${lr.fuXing.join('、')}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuShi) {
      const ls = selection.liuShi
      const parts = [`流时：${ls.zhi}时 ${ls.gan}${ls.zhi}`]
      if (ls.wuXing) parts.push(`五行[${ls.wuXing}]`)
      if (ls.zhuXing) parts.push(`主星[${ls.zhuXing}]`)
      if (ls.fuXing && ls.fuXing.length > 0) parts.push(`副星[${ls.fuXing.join('、')}]`)
      focusLines.push(parts.join(' '))
    }
    if (focusLines.length > 0) {
      lines.push('【用户选中的分析焦点】')
      lines.push('（以下为用户在排盘界面选中的动态时间节点，请重点围绕这些节点进行分析）')
      for (const fl of focusLines) lines.push(`  ${fl}`)
      lines.push('')
    }
  }

  lines.push('【分析要求】')
  lines.push('请基于以上完整的八字排盘数据进行命理分析，回答用户的问题。')
  lines.push('分析时请结合日主强弱、格局、十神、五行、神煞、大运等多维度综合判断。')
  if (selection && (selection.daYun || selection.liuNian || selection.liuYue || selection.liuRi || selection.liuShi)) {
    lines.push('用户已选中特定的大运/流年/流月/流日/流时，请重点结合这些动态节点展开分析。')
  }

  return lines.join('\n')
}

function serializeZiweiContext(result: ZiweiResult, selection?: ZiweiSelection): string {
  const lines: string[] = []

  // ── JSON 结构化数据（优先分析源，提升解盘准确性）──
  lines.push('## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）')
  lines.push('')
  lines.push('```json')
  lines.push(serializeZiweiJson(result, [], selection ? {
    daXian: selection.daXian ? { startAge: selection.daXian.startAge, endAge: selection.daXian.endAge, gan: selection.daXian.gan, zhi: selection.daXian.zhi, gongName: selection.daXian.gongName } : null,
    liuNian: selection.liuNian ? { year: selection.liuNian.year, gan: selection.liuNian.gan, zhi: selection.liuNian.zhi, gongName: selection.liuNian.gongName } : null,
    liuYue: selection.liuYue ? { month: selection.liuYue.month, gan: selection.liuYue.gan, zhi: selection.liuYue.zhi, gongName: selection.liuYue.gongName } : null,
    liuRi: selection.liuRi ? { day: selection.liuRi.day, gan: selection.liuRi.gan, zhi: selection.liuRi.zhi, gongName: selection.liuRi.gongName } : null,
    liuShi: selection.liuShi ? { zhi: selection.liuShi.zhi, gan: selection.liuShi.gan, gongName: selection.liuShi.gongName } : null,
  } : undefined))
  lines.push('```')
  lines.push('')
  lines.push('---')
  lines.push('')

  // ── 文本描述（可读性辅助）──
  lines.push('【紫微斗数排盘信息】')
  lines.push(`姓名：${result.name}`)
  lines.push(`性别：${result.gender}`)
  lines.push(`出生日期：公历 ${result.solarDate}`)
  lines.push(`农历：${result.lunarDate}`)
  lines.push(`四柱八字：${result.yearGanZhi}年 ${result.monthGanZhi}月 ${result.dayGanZhi}日 ${result.hourGanZhi}时`)
  lines.push(`命宫：${result.gongs[result.mingGongIndex]?.name || '未知'}宫`)
  lines.push(`身宫：${result.gongs[result.shenGongIndex]?.name || '未知'}宫`)
  lines.push(`五行局：${result.wuXingJu}`)
  lines.push(`命主：${result.mingZhu} / 身主：${result.shenZhu}`)
  lines.push('')
  lines.push('十二宫简要：')

  for (const gong of result.gongs) {
    const mainStars = gong.stars?.filter((s: { type: string }) => s.type === '主星').map((s: { name: string }) => s.name).join('、') || '无'
    const jiStars = gong.stars?.filter((s: { type: string }) => s.type === '吉星').map((s: { name: string }) => s.name).join('、') || ''
    const sihua = Object.entries(result.siHuaMap || {}).filter(([, g]) => g === gong.name).map(([s]) => s).join('、')
    const parts = [`${gong.name}宫`]
    if (mainStars !== '无') parts.push(`主星[${mainStars}]`)
    if (jiStars) parts.push(`吉星[${jiStars}]`)
    if (sihua) parts.push(`四化[${sihua}]`)
    lines.push(`  ${parts.join('，')}`)
  }

  // 用户选中的动态分析焦点（大限/流年/流月/流日/流时）
  if (selection) {
    const focusLines: string[] = []
    if (selection.daXian) {
      const dx = selection.daXian
      const mainStars = dx.stars?.filter((s) => s.type === '主星').map((s) => s.name).join('、') || ''
      const parts = [`大限：${dx.startAge}-${dx.endAge}岁（${dx.startYear}-${dx.endYear}年）${dx.gan}${dx.zhi} ${dx.gongName}宫`]
      if (mainStars) parts.push(`主星[${mainStars}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuNian) {
      const ln = selection.liuNian
      const mainStars = ln.stars?.filter((s) => s.type === '主星').map((s) => s.name).join('、') || ''
      const sihua = Object.entries(ln.siHuaMap || {}).map(([s, g]) => `${s}→${g}`).join('、')
      const parts = [`流年：${ln.year}年 ${ln.gan}${ln.zhi} ${ln.gongName}宫`]
      if (mainStars) parts.push(`主星[${mainStars}]`)
      if (sihua) parts.push(`四化[${sihua}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuYue) {
      const ly = selection.liuYue
      const mainStars = ly.stars?.filter((s) => s.type === '主星').map((s) => s.name).join('、') || ''
      const sihua = Object.entries(ly.siHuaMap || {}).map(([s, g]) => `${s}→${g}`).join('、')
      const parts = [`流月：${ly.month}月 ${ly.gan}${ly.zhi} ${ly.gongName}宫`]
      if (mainStars) parts.push(`主星[${mainStars}]`)
      if (sihua) parts.push(`四化[${sihua}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuRi) {
      const lr = selection.liuRi
      const weekdayNames = ['日', '一', '二', '三', '四', '五', '六']
      const mainStars = lr.stars?.filter((s) => s.type === '主星').map((s) => s.name).join('、') || ''
      const sihua = Object.entries(lr.siHuaMap || {}).map(([s, g]) => `${s}→${g}`).join('、')
      const parts = [`流日：${lr.day}日（星期${weekdayNames[lr.weekday] || '?'}）${lr.gan}${lr.zhi} ${lr.gongName}宫`]
      if (mainStars) parts.push(`主星[${mainStars}]`)
      if (sihua) parts.push(`四化[${sihua}]`)
      focusLines.push(parts.join(' '))
    }
    if (selection.liuShi) {
      const ls = selection.liuShi
      const mainStars = ls.stars?.filter((s) => s.type === '主星').map((s) => s.name).join('、') || ''
      const sihua = Object.entries(ls.siHuaMap || {}).map(([s, g]) => `${s}→${g}`).join('、')
      const parts = [`流时：${ls.zhi}时 ${ls.gan}${ls.zhi} ${ls.gongName}宫`]
      if (mainStars) parts.push(`主星[${mainStars}]`)
      if (sihua) parts.push(`四化[${sihua}]`)
      focusLines.push(parts.join(' '))
    }
    if (focusLines.length > 0) {
      lines.push('')
      lines.push('【用户选中的分析焦点】')
      lines.push('（以下为用户在排盘界面选中的动态时间节点，请重点围绕这些节点进行分析）')
      for (const fl of focusLines) lines.push(`  ${fl}`)
    }
  }

  lines.push('')
  lines.push('【分析要求】')
  lines.push('请基于以上完整的紫微斗数排盘数据进行命理分析，回答用户的问题。')
  lines.push('分析时请结合命宫、身宫、十二宫、主星、四化等多维度综合判断。')
  if (selection && (selection.daXian || selection.liuNian || selection.liuYue || selection.liuRi || selection.liuShi)) {
    lines.push('用户已选中特定的大限/流年/流月/流日/流时，请重点结合这些动态节点展开分析。')
  }

  return lines.join('\n')
}

// ── 主组件 ──
export default function FeatureContent({ feature, resetTrigger }: FeatureContentProps) {
  const { messages, resetSession, stopGeneration, loading } = useChatContext()
  // 排盘结果收缩状态：用户提交问题后自动收缩，让出空间显示回答
  const [chartCollapsed, setChartCollapsed] = useState(false)
  // 收缩信号量：每次发送新问题时递增，用于强制触发下游 useEffect 重新收缩排盘详情
  // 解决 chartCollapsed 已为 true 时再次发送问题不会触发 useEffect 的问题
  const [collapseNonce, setCollapseNonce] = useState(0)
  // 底部对话框折叠状态：默认折叠，仅显示触发条
  const [chatInputCollapsed, setChatInputCollapsed] = useState(true)
  const prevMessageCount = useRef(messages.length)
  const containerRef = useRef<HTMLDivElement>(null)

  // 容器尺寸观测：用于紫微/八字大屏自适应缩放
  const { ref: resultRef, width: containerWidth } = useContainerSize(33)

  // 排盘结果状态（提升到此处以支持上下文注入）
  const [baziResult, setBaziResult] = useState<BaziResult | null>(null)
  const [baziSupplementalInfo, setBaziSupplementalInfo] = useState('')
  const [ziweiResult, setZiweiResult] = useState<ZiweiResult | null>(null)
  const [ziweiSupplementalInfo, setZiweiSupplementalInfo] = useState('')
  // 用户选中的动态分析焦点（大运/流年/流月/流日/流时）
  const [baziSelection, setBaziSelection] = useState<BaziSelection | null>(null)
  const [ziweiSelection, setZiweiSelection] = useState<ZiweiSelection | null>(null)
  // 麻衣神相上下文数据（由 PhysiognomyForm 通过 onContextChange 回调注入）
  const [physiognomyContext, setPhysiognomyContext] = useState<string | null>(null)
  // 六爻占卜排盘结果
  const [liuyaoResult, setLiuyaoResult] = useState<LiuyaoResult | null>(null)
  // 梅花易数排盘结果
  const [meihuaResult, setMeihuaResult] = useState<MeihuaResult | null>(null)
  // 黄道择吉结果
  const [huangliResult, setHuangliResult] = useState<HuangliResult | null>(null)

  // 是否已有排盘结果，用于控制底部对话框显示
  const hasResult = (feature === '四柱八字' && baziResult !== null) ||
    (feature === '紫微斗数' && ziweiResult !== null) ||
    (feature === '麻衣神相' && physiognomyContext !== null) ||
    (feature === '六爻占卜' && liuyaoResult !== null) ||
    (feature === '梅花易数' && meihuaResult !== null) ||
    (feature === '黄历择吉' && huangliResult !== null)

  // 上下文数据获取器：发送消息时自动注入已排盘数据 + 用户选中的动态焦点
  // 排盘结果会作为 context_data 传入后端，最终注入到 LLM 的 System Prompt 中
  const getContextData = useCallback((): string | undefined => {
    if (feature === '四柱八字' && baziResult) {
      // 完整性校验：缺失关键字段时记录警告，但仍尽量序列化（已收集到的字段仍有价值）
      const { valid, missing } = validateBaziResult(baziResult)
      if (!valid) {
        // eslint-disable-next-line no-console
        console.warn('[BaziContext] 排盘结果不完整，缺失：', missing.join('、'))
      }
      const serialized = serializeBaziContext(baziResult, baziSelection || undefined)
      const withSupplemental = baziSupplementalInfo.trim()
        ? `${serialized}\n\n【个人补充信息（必须优先采用）】\n${baziSupplementalInfo.trim()}`
        : serialized
      // eslint-disable-next-line no-console
      console.info('[BaziContext] 上下文已构建', {
        valid,
        missingCount: missing.length,
        contextLength: serialized.length,
        hasSelection: !!baziSelection,
      })
      return withSupplemental
    }
    if (feature === '紫微斗数' && ziweiResult) {
      const serialized = serializeZiweiContext(ziweiResult, ziweiSelection || undefined)
      return ziweiSupplementalInfo.trim() && !serialized.includes('【个人补充信息（必须优先采用）】')
        ? `${serialized}\n\n【个人补充信息（必须优先采用）】\n${ziweiSupplementalInfo.trim()}\n说明：回答和报告中如补充信息与推断冲突，应优先采用补充信息。`
        : serialized
    }
    if (feature === '麻衣神相' && physiognomyContext) {
      return physiognomyContext
    }
    if (feature === '六爻占卜' && liuyaoResult) {
      const text = serializeLiuyaoContext(liuyaoResult)
      const json = serializeLiuyaoJson(liuyaoResult)
      return `## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）\n\n\`\`\`json\n${json}\n\`\`\`\n\n---\n\n${text}`
    }
    if (feature === '梅花易数' && meihuaResult) {
      const text = serializeMeihuaContext(meihuaResult)
      const json = serializeMeihuaJson(meihuaResult)
      return `## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）\n\n\`\`\`json\n${json}\n\`\`\`\n\n---\n\n${text}`
    }
    if (feature === '黄历择吉' && huangliResult) {
      const text = serializeHuangliContext(huangliResult)
      const json = serializeHuangliJson(huangliResult)
      return `## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）\n\n\`\`\`json\n${json}\n\`\`\`\n\n---\n\n${text}`
    }
    return undefined
  }, [feature, baziResult, baziSupplementalInfo, ziweiResult, ziweiSupplementalInfo, baziSelection, ziweiSelection, physiognomyContext, liuyaoResult, meihuaResult, huangliResult])

  // 消息变化时自动调整布局
  useEffect(() => {
    if (messages.length === 0) {
      // 新会话或清空消息：展开排盘结果，折叠对话框
      setChartCollapsed(false)
      setChatInputCollapsed(true)
    } else if (messages.length > prevMessageCount.current) {
      // 新消息到达：自动收缩排盘结果，让出空间显示回答
      setChartCollapsed(true)
      // 递增信号量，强制下游 BaziResult/ZiweiResult 重新触发收缩（即使用户之前手动展开了排盘详情）
      setCollapseNonce(n => n + 1)
    }
    prevMessageCount.current = messages.length
  }, [messages.length])

  // 切换功能模块时执行完整初始化流程
  useEffect(() => {
    // 1. 中止进行中的 SSE 流（防止后台继续接收旧功能的响应）
    if (loading) {
      stopGeneration()
    }

    // 2. 重置所有排盘结果状态
    setBaziResult(null)
    setBaziSupplementalInfo('')
    setZiweiResult(null)
    setZiweiSupplementalInfo('')
    setPhysiognomyContext(null)
    setLiuyaoResult(null)
    setMeihuaResult(null)
    setHuangliResult(null)

    // 3. 重置所有选中状态（用户选中的大运/流年等）
    setBaziSelection(null)
    setZiweiSelection(null)

    // 4. 重置布局状态
    setChartCollapsed(false)
    setCollapseNonce(0)
    setChatInputCollapsed(true)

    // 5. 重置消息计数引用
    prevMessageCount.current = messages.length

    // 6. 清空对话上下文（消息列表 + 创建新会话 ID）
    resetSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature, resetTrigger])

  const featureContent = (
    <>
      {feature === '四柱八字' && (
        <BaziForm
          result={baziResult}
          setResult={setBaziResult}
          containerWidth={containerWidth}
          supplementalInfo={baziSupplementalInfo}
          onSupplementalChange={setBaziSupplementalInfo}
          onSelectionChange={setBaziSelection}
          onToggleCollapse={() => setChartCollapsed((c) => !c)}
          chartCollapsed={chartCollapsed}
          collapseNonce={collapseNonce}
        />
      )}
      {feature === '紫微斗数' && (
        <ZiweiForm
          result={ziweiResult}
          setResult={setZiweiResult}
          containerWidth={containerWidth}
          supplementalInfo={ziweiSupplementalInfo}
          onSupplementalChange={setZiweiSupplementalInfo}
          onSelectionChange={setZiweiSelection}
          onToggleCollapse={() => setChartCollapsed((c) => !c)}
          chartCollapsed={chartCollapsed}
          collapseNonce={collapseNonce}
        />
      )}
      {feature === '黄历择吉' && (
        <HuangliDatePicker
          result={huangliResult}
          setResult={setHuangliResult}
          containerWidth={containerWidth}
          onToggleCollapse={() => setChartCollapsed((c) => !c)}
          chartCollapsed={chartCollapsed}
          collapseNonce={collapseNonce}
        />
      )}
      {feature === '麻衣神相' && (
        <PhysiognomyForm
          containerWidth={containerWidth}
          onContextChange={setPhysiognomyContext}
          onToggleCollapse={() => setChartCollapsed((c) => !c)}
          chartCollapsed={chartCollapsed}
          collapseNonce={collapseNonce}
        />
      )}
      {feature === '六爻占卜' && (
        <LiuyaoForm
          result={liuyaoResult}
          setResult={setLiuyaoResult}
          containerWidth={containerWidth}
          onToggleCollapse={() => setChartCollapsed((c) => !c)}
          chartCollapsed={chartCollapsed}
          collapseNonce={collapseNonce}
        />
      )}
      {feature === '梅花易数' && (
        <MeihuaForm
          result={meihuaResult}
          setResult={setMeihuaResult}
          containerWidth={containerWidth}
          onToggleCollapse={() => setChartCollapsed((c) => !c)}
          chartCollapsed={chartCollapsed}
          collapseNonce={collapseNonce}
        />
      )}
      {!CHART_FEATURES.includes(feature) && <KnowledgeContent feature={feature} />}
    </>
  )

  return (
    <div
      ref={containerRef}
      className={`feature-layout bottom${messages.length > 0 ? ' has-messages' : ''}${chartCollapsed ? ' chart-collapsed' : ''}${!chatInputCollapsed ? ' dialog-expanded' : ''}`}
      style={{ '--ziwei-container-width': `${containerWidth}px` } as CSSProperties}
    >
      {/* 排盘结果区域 - 可收缩，提交问题后自动收缩让出空间
          状态由根元素 .chart-collapsed 控制，无需子层 .collapsed 类 */}
      <div className="feature-result" ref={resultRef}>
        {/* featureContent 仍挂载，由 CSS 控制 .bazi-card-content 的显示/隐藏 */}
        {featureContent}
      </div>

      {/* 回答显示区域 - 位于排盘结果与对话框之间，条件渲染保证仅在有消息时挂载 */}
      {hasResult && messages.length > 0 && (
        <div className="feature-messages">
          <ChatArea onSelectFeature={() => {}} />
        </div>
      )}

      {/* 命理问答输入区域 - 位于屏幕最下方，仅在有排盘结果时显示
          状态由根元素 .dialog-expanded 控制，无需 .feature-chat-input-wrapper 包裹层 */}
      {hasResult && (
        <div className="feature-dialog">
          <button
            type="button"
            className="feature-dialog-toggle"
            onClick={() => setChatInputCollapsed((c) => !c)}
            aria-label={chatInputCollapsed ? '展开对话框' : '收起对话框'}
            title={chatInputCollapsed ? '展开对话框' : '收起对话框'}
          >
            <span className="feature-dialog-toggle-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className={`feature-dialog-chevron ${chatInputCollapsed ? 'collapsed' : 'expanded'}`}
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </span>
            <span className="feature-dialog-toggle-label">命理问答</span>
          </button>
          {!chatInputCollapsed && (
            <InputBar
              getContextData={getContextData}
              skillId={feature === '四柱八字' ? 'bazi_analysis' : feature === '紫微斗数' ? 'ziwei_analysis' : feature === '麻衣神相' ? 'mayi_analysis' : feature === '六爻占卜' ? 'liuyao_analysis' : feature === '梅花易数' ? 'meihua_analysis' : feature === '黄历择吉' ? 'huangli_analysis' : undefined}
            />
          )}
        </div>
      )}
    </div>
  )
}