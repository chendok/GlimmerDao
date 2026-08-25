/**
 * 梅花易数计算适配层
 *
 * 封装 `mingyu-core` 的梅花易数模块：
 * - generateMeihua()：时间/数字/随机起卦
 * - 文字起卦：将汉字转换为数字后调用数字起卦
 *
 * 提供统一的 MeihuaResult 类型和序列化函数。
 */

import { generateMeihua } from 'mingyu-core/divination/meihua'
import type { MeihuaData } from 'mingyu-core/types'

// ── 本地类型定义 ──

/** 起卦方式 */
export type MeihuaMethod = 'time' | 'number' | 'text'

/** 八卦信息 */
export interface GuaInfo {
  name: string     // 乾/兑/离/震/巽/坎/艮/坤
  element: string  // 金/木/水/火/土
  nature: string   // 天/泽/火/雷/风/水/山/地
}

/** 体用分析结果 */
export interface TiYongAnalysis {
  tiGua: GuaInfo
  yongGua: GuaInfo
  relation: string      // 体生用/用生体/体克用/用克体/比和
  isAuspicious: boolean
  detail: string
}

/** 梅花易数排盘完整结果 */
export interface MeihuaResult {
  method: MeihuaMethod
  /** 文字起卦时的原始输入 */
  textInput?: string
  /** 数字起卦时的原始输入 */
  numberInput?: number
  /** 时间起卦时的时间 */
  timeInput?: string
  /** 本卦 */
  benGua: {
    upper: GuaInfo
    lower: GuaInfo
    name: string
  }
  /** 互卦 */
  huGua: {
    upper: GuaInfo
    lower: GuaInfo
    name: string
  }
  /** 变卦 */
  bianGua: {
    upper: GuaInfo
    lower: GuaInfo
    name: string
  }
  /** 动爻位置 */
  dongYao: number
  /** 体用分析 */
  tiYong: TiYongAnalysis
  /** 原始数据 */
  raw: MeihuaData
  /** 起卦时间 */
  queryTime: string
}

// ── 八卦映射 ──

const BAGUA_INFO: Record<string, GuaInfo> = {
  '乾': { name: '乾', element: '金', nature: '天' },
  '兑': { name: '兑', element: '金', nature: '泽' },
  '离': { name: '离', element: '火', nature: '火' },
  '震': { name: '震', element: '木', nature: '雷' },
  '巽': { name: '巽', element: '木', nature: '风' },
  '坎': { name: '坎', element: '水', nature: '水' },
  '艮': { name: '艮', element: '土', nature: '山' },
  '坤': { name: '坤', element: '土', nature: '地' },
}

// ── 起卦函数 ──

/** 时间起卦（使用当前时间或指定时间） */
export function timeDivination(customDate?: Date): MeihuaData {
  return generateMeihua(customDate, { method: 'time' })
}

/** 数字起卦 */
export function numberDivination(num: number): MeihuaData {
  return generateMeihua(undefined, { method: 'number', number: num })
}

/** 文字起卦：将汉字转换为数字后起卦 */
export function textDivination(text: string): MeihuaData {
  // 计算每个汉字的笔画数（使用 Unicode 码点 + 笔画映射）
  let totalStrokes = 0
  for (const char of text) {
    totalStrokes += getCharStroke(char)
  }
  // 取笔画总数作为数字输入
  const num = totalStrokes || 1
  return generateMeihua(undefined, { method: 'number', number: num })
}

// ── 排盘函数 ──

/** 将 mingyu-core 的 MeihuaData 转换为统一的 MeihuaResult */
export function buildMeihuaResult(
  data: MeihuaData,
  method: MeihuaMethod,
  extras?: { textInput?: string; numberInput?: number; timeInput?: string },
): MeihuaResult {
  const now = new Date()
  const queryTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const tiGua = BAGUA_INFO[data.tiGua.name] || { name: data.tiGua.name, element: data.tiGua.element, nature: data.tiGua.nature }
  const yongGua = BAGUA_INFO[data.yongGua.name] || { name: data.yongGua.name, element: data.yongGua.element, nature: data.yongGua.nature }

  // 计算体用关系
  const relation = getTiYongRelation(tiGua.element, yongGua.element)

  // 辅助函数：从卦名字符串获取 GuaInfo
  const getGuaInfo = (trigramName: string): GuaInfo =>
    BAGUA_INFO[trigramName] || { name: trigramName, element: '未知', nature: '未知' }

  // 主卦（mainHexagram.upper/lower 是卦名字符串）
  const benUpper = getGuaInfo(data.mainHexagram.upper)
  const benLower = getGuaInfo(data.mainHexagram.lower)

  // 互卦
  const huUpper = data.interHexagram ? getGuaInfo(data.interHexagram.upper) : { name: '—', element: '—', nature: '—' }
  const huLower = data.interHexagram ? getGuaInfo(data.interHexagram.lower) : { name: '—', element: '—', nature: '—' }

  // 变卦
  const bianUpper = data.changedHexagram ? getGuaInfo(data.changedHexagram.upper) : { name: '—', element: '—', nature: '—' }
  const bianLower = data.changedHexagram ? getGuaInfo(data.changedHexagram.lower) : { name: '—', element: '—', nature: '—' }

  return {
    method,
    textInput: extras?.textInput,
    numberInput: extras?.numberInput,
    timeInput: extras?.timeInput,
    benGua: {
      upper: benUpper,
      lower: benLower,
      name: data.mainHexagram.name,
    },
    huGua: {
      upper: huUpper,
      lower: huLower,
      name: data.interHexagram?.name || '—',
    },
    bianGua: {
      upper: bianUpper,
      lower: bianLower,
      name: data.changedHexagram?.name || '—',
    },
    dongYao: data.movingYao.position,
    tiYong: {
      tiGua,
      yongGua,
      relation: relation.label,
      isAuspicious: relation.isAuspicious,
      detail: relation.detail,
    },
    raw: data,
    queryTime,
  }
}

// ── 体用生克分析 ──

function getTiYongRelation(tiElement: string, yongElement: string): {
  label: string
  isAuspicious: boolean
  detail: string
} {
  const wuxingOrder: Record<string, number> = { '金': 0, '水': 1, '木': 2, '火': 3, '土': 4 }

  if (tiElement === yongElement) {
    return { label: '体用比和', isAuspicious: true, detail: '体卦与用卦五行相同，比和相助，凡事顺利，吉。' }
  }

  const tiIdx = wuxingOrder[tiElement] ?? 0
  const yongIdx = wuxingOrder[yongElement] ?? 0

  // 相生关系：金生水、水生木、木生火、火生土、土生金
  // (tiIdx + 1) % 5 === yongIdx 表示 ti 生 yong
  const tiShengYong = (tiIdx + 1) % 5 === yongIdx
  const yongShengTi = (yongIdx + 1) % 5 === tiIdx
  const tiKeYong = (tiIdx + 2) % 5 === yongIdx
  const yongKeTi = (yongIdx + 2) % 5 === tiIdx

  if (yongShengTi) {
    return { label: '用生体', isAuspicious: true, detail: `用卦[${yongElement}]生体卦[${tiElement}]，大吉之象，有贵人相助，凡事顺利。` }
  }
  if (tiKeYong) {
    return { label: '体克用', isAuspicious: true, detail: `体卦[${tiElement}]克用卦[${yongElement}]，事可成，但需付出努力，吉。` }
  }
  if (tiShengYong) {
    return { label: '体生用', isAuspicious: false, detail: `体卦[${tiElement}]生用卦[${yongElement}]，有损耗泄气，付出多回报少，需谨慎。` }
  }
  if (yongKeTi) {
    return { label: '用克体', isAuspicious: false, detail: `用卦[${yongElement}]克体卦[${tiElement}]，大凶之象，事不可为，宜回避等待时机。` }
  }

  return { label: '未知', isAuspicious: false, detail: '体用关系无法确定。' }
}

// ── 汉字笔画估算 ──

/** 简单版汉字笔画估算（基于 Unicode 范围），用于文字起卦 */
function getCharStroke(char: string): number {
  const code = char.charCodeAt(0)
  // 基本汉字区 U+4E00-U+9FFF
  if (code >= 0x4E00 && code <= 0x9FFF) {
    // 用简单的模运算估算笔画：取码点偏移量对 30 取模 + 1，保证 1-30 范围
    // 实际应用中建议使用完整笔画数据库
    return ((code - 0x4E00) % 30) + 1
  }
  // 非汉字字符（数字、字母、标点）
  return 1
}

// ── 六十四卦简要描述 ──

function GetMeihuaGuaDescription(name: string): string {
  const descs: Record<string, string> = {
    '乾': '乾为天，纯阳之卦，刚健不息',
    '坤': '坤为地，纯阴之卦，柔顺载物',
    '屯': '水雷屯，始生之难',
    '蒙': '山水蒙，启蒙发智',
    '需': '水天需，等待时机',
    '讼': '天水讼，争讼是非',
    '师': '地水师，统兵出征',
    '比': '水地比，亲附和合',
    '小畜': '风天小畜，小有积蓄',
    '履': '天泽履，履践礼仪',
    '泰': '地天泰，通泰和畅',
    '否': '天地否，闭塞不通',
    '同人': '天火同人，与人合同',
    '大有': '火天大有，大有所获',
    '谦': '地山谦，谦逊退让',
    '豫': '雷地豫，愉悦和乐',
    '随': '泽雷随，随从顺应',
    '蛊': '山风蛊，蛊坏整治',
    '临': '地泽临，临下治民',
    '观': '风地观，观察审视',
    '噬嗑': '火雷噬嗑，咬合刑罚',
    '贲': '山火贲，文饰美化',
    '剥': '山地剥，剥落消减',
    '复': '地雷复，回复新生',
    '无妄': '天雷无妄，不妄为',
    '大畜': '山天大畜，大积蓄',
    '颐': '山雷颐，颐养',
    '大过': '泽风大过，大为过甚',
    '坎': '坎为水，重重险陷',
    '离': '离为火，附丽光明',
    '咸': '泽山咸，感应',
    '恒': '雷风恒，恒久',
    '遯': '天山遯，退避',
    '大壮': '雷天大壮，盛大强壮',
    '晋': '火地晋，前进上升',
    '明夷': '地火明夷，光明受伤',
    '家人': '风火家人，家庭伦理',
    '睽': '火泽睽，乖离',
    '蹇': '水山蹇，艰难',
    '解': '雷水解，解除困难',
    '损': '山泽损，损下益上',
    '益': '风雷益，增益',
    '夬': '泽天夬，决断',
    '姤': '天风姤，不期而遇',
    '萃': '泽地萃，聚集',
    '升': '地风升，上升',
    '困': '泽水困，困穷',
    '井': '水风井，养而不穷',
    '革': '泽火革，变革',
    '鼎': '火风鼎，鼎新',
    '震': '震为雷，震动',
    '艮': '艮为山，止息',
    '渐': '风山渐，渐进',
    '归妹': '雷泽归妹，婚嫁',
    '丰': '雷火丰，丰盛',
    '旅': '火山旅，旅行',
    '巽': '巽为风，顺从',
    '兑': '兑为泽，喜悦',
    '涣': '风水涣，涣散',
    '节': '水泽节，节制',
    '中孚': '风泽中孚，诚信',
    '小过': '雷山小过，小有过越',
    '既济': '水火既济，事已成',
    '未济': '火水未济，事未成',
  }
  return descs[name] || ''
}

// ── 序列化函数 ──

/** 将梅花易数排盘结果序列化为 LLM 上下文文本（Markdown 格式） */
export function serializeMeihuaContext(result: MeihuaResult): string {
  const lines: string[] = []

  // ═══ 标题 ═══
  lines.push('# 梅花易数排盘信息')
  lines.push('')

  // ═══ 一、起卦信息 ═══
  lines.push('## 一、起卦信息')
  lines.push('')
  const methodLabel = result.method === 'time' ? '时间起卦' : result.method === 'number' ? '数字起卦' : '文字起卦'
  lines.push(`- **起卦方式**：${methodLabel}`)
  lines.push(`- **起卦时间**：${result.queryTime}`)
  if (result.textInput) lines.push(`- **文字输入**：${result.textInput}`)
  if (result.numberInput !== undefined) lines.push(`- **数字输入**：${result.numberInput}`)
  if (result.timeInput) lines.push(`- **时间输入**：${result.timeInput}`)
  lines.push('')

  // ═══ 二、卦象概览 ═══
  lines.push('## 二、卦象概览')
  lines.push('')
  lines.push('| 卦象 | 上卦 | 下卦 | 卦名 | 卦辞 |')
  lines.push('|------|------|------|------|------|')
  lines.push(
    `| **本卦** | ${result.benGua.upper.name}（${result.benGua.upper.element}·${result.benGua.upper.nature}） | ${result.benGua.lower.name}（${result.benGua.lower.element}·${result.benGua.lower.nature}） | ${result.benGua.name} | ${GetMeihuaGuaDescription(result.benGua.name)} |`
  )
  lines.push(
    `| **互卦** | ${result.huGua.upper.name}（${result.huGua.upper.element}） | ${result.huGua.lower.name}（${result.huGua.lower.element}） | ${result.huGua.name} | ${GetMeihuaGuaDescription(result.huGua.name)} |`
  )
  lines.push(
    `| **变卦** | ${result.bianGua.upper.name}（${result.bianGua.upper.element}） | ${result.bianGua.lower.name}（${result.bianGua.lower.element}） | ${result.bianGua.name} | ${GetMeihuaGuaDescription(result.bianGua.name)} |`
  )
  lines.push('')

  // ═══ 三、动爻信息 ═══
  lines.push('## 三、动爻信息')
  lines.push('')
  lines.push(`- **动爻位置**：第 **${result.dongYao}** 爻动`)
  lines.push('')

  // ═══ 四、体用分析 ═══
  lines.push('## 四、体用分析')
  lines.push('')
  lines.push('| 角色 | 卦名 | 五行 | 含义 |')
  lines.push('|------|------|------|------|')
  lines.push(`| **体卦** | ${result.tiYong.tiGua.name} | ${result.tiYong.tiGua.element} | 代表问卦者自身 |`)
  lines.push(`| **用卦** | ${result.tiYong.yongGua.name} | ${result.tiYong.yongGua.element} | 代表所问之事 |`)
  lines.push('')
  lines.push(`- **体用关系**：**${result.tiYong.relation}**`)
  lines.push(`- **吉凶判断**：${result.tiYong.isAuspicious ? '✅ 吉' : '⚠️ 凶'}`)
  lines.push(`- **分析**：${result.tiYong.detail}`)
  lines.push('')

  // ═══ 五、八卦万物类象 ═══
  lines.push('## 五、八卦万物类象')
  lines.push('')
  lines.push('| 八卦 | 五行 | 自然 | 人物 | 身体 | 动物 |')
  lines.push('|------|------|------|------|------|------|')
  lines.push('| 乾 ☰ | 金 | 天 | 君、父 | 首、骨 | 马 |')
  lines.push('| 兑 ☱ | 金 | 泽 | 少女、巫 | 口、肺 | 羊 |')
  lines.push('| 离 ☲ | 火 | 火 | 中女 | 目、心 | 雉 |')
  lines.push('| 震 ☳ | 木 | 雷 | 长男 | 足、肝 | 龙 |')
  lines.push('| 巽 ☴ | 木 | 风 | 长女 | 股、胆 | 鸡 |')
  lines.push('| 坎 ☵ | 水 | 水 | 中男 | 耳、肾 | 豕 |')
  lines.push('| 艮 ☶ | 土 | 山 | 少男 | 手、胃 | 犬 |')
  lines.push('| 坤 ☷ | 土 | 地 | 母、臣 | 腹、脾 | 牛 |')
  lines.push('')

  // ═══ 六、分析要求 ═══
  lines.push('## 六、分析要求')
  lines.push('')
  lines.push('请基于以上梅花易数排盘数据，结合体用生克关系进行占卜分析。')
  lines.push('')
  lines.push('分析时请结合以下维度综合判断：')
  lines.push('')
  lines.push('1. **体用生克**：以体卦为问卦者自身，用卦为所问之事，分析体用之间的生克关系')
  lines.push('2. **本卦**：当前事态的基本状态与起始条件')
  lines.push('3. **互卦**：事物发展的中间过程与转折')
  lines.push('4. **变卦**：事物发展的最终结果与归宿')
  lines.push('5. **动爻**：重点关注动爻所在位置及其爻辞含义')
  lines.push('6. **八卦万物类象**：将卦象转化为具体事物和情境，结合五行生克综合判断')

  return lines.join('\n')
}

// ── JSON 序列化（用于注入 LLM 提示词，提升解盘准确性）──

/**
 * 将梅花易数排盘结果序列化为结构化 JSON，注入大模型提示词
 */
export function serializeMeihuaJson(result: MeihuaResult): string {
  return JSON.stringify({
    chartType: '梅花易数',
    queryInfo: {
      method: result.method === 'time' ? '时间起卦' : result.method === 'number' ? '数字起卦' : '文字起卦',
      queryTime: result.queryTime,
      textInput: result.textInput || undefined,
      numberInput: result.numberInput !== undefined ? result.numberInput : undefined,
      timeInput: result.timeInput || undefined,
    },
    gua: {
      benGua: {
        name: result.benGua.name,
        upper: result.benGua.upper,
        lower: result.benGua.lower,
      },
      huGua: {
        name: result.huGua.name,
        upper: result.huGua.upper,
        lower: result.huGua.lower,
      },
      bianGua: {
        name: result.bianGua.name,
        upper: result.bianGua.upper,
        lower: result.bianGua.lower,
      },
    },
    dongYao: result.dongYao,
    tiYong: {
      tiGua: result.tiYong.tiGua,
      yongGua: result.tiYong.yongGua,
      relation: result.tiYong.relation,
      isAuspicious: result.tiYong.isAuspicious,
      detail: result.tiYong.detail,
    },
  }, null, 2)
}