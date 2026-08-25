/**
 * 六爻占卜计算适配层
 *
 * 封装 `iching-shifa` 库的核心 API：
 * - dayan()：大衍筮法随机起卦
 * - manualQiGua()：手工录入六爻值
 * - decodePan()：完整排盘
 *
 * 提供统一的 LiuyaoResult 类型和序列化函数。
 */

import { dayan, manualQiGua, decodePan, getGuaName } from 'iching-shifa'
import type { PanResult } from 'iching-shifa'

// ── 本地类型定义 ──

/** 起卦方式 */
export type LiuyaoMethod = 'coin' | 'manual'

/** 单爻数据 */
export interface YaoItem {
  position: number          // 1-6，从初爻到上爻
  value: 6 | 7 | 8 | 9      // 6=老阴, 7=少阳, 8=少阴, 9=老阳
  label: string             // '老阳' | '少阳' | '少阴' | '老阴'
  isChanging: boolean       // 是否动爻
  yinYang: '阳' | '阴'
}

/** 铜钱摇卦单次投掷结果 */
export interface CoinToss {
  coins: [boolean, boolean, boolean]
  result: 6 | 7 | 8 | 9
  label: string
}

/** 六爻排盘完整结果 */
export interface LiuyaoResult {
  yaoString: string
  method: LiuyaoMethod
  /** 本卦名 */
  benGuaName: string
  /** 变卦名（有动爻时存在） */
  zhiGuaName?: string
  /** 互卦名 */
  huGuaName: string
  /** 动爻数 */
  dongYaoCount: number
  /** 动爻位置列表 */
  dongYaoPositions: number[]
  /** 硬币投掷轨迹（铜钱摇卦模式） */
  coinTosses?: CoinToss[]
  /** 原始排盘结果 */
  pan: PanResult
  /** 排盘时间 */
  queryTime: string
}

// ── 爻值映射 ──

const YAO_LABEL: Record<number, string> = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' }
const YAO_YIN_YANG: Record<number, string> = { 6: '阴', 7: '阳', 8: '阴', 9: '阳' }

/** 模拟铜钱投掷：3枚硬币，正面=true，背面=false */
function tossCoin(): boolean {
  return Math.random() < 0.5
}

function tossThreeCoins(): CoinToss {
  const coins: [boolean, boolean, boolean] = [tossCoin(), tossCoin(), tossCoin()]
  const heads = coins.filter(Boolean).length
  let result: 6 | 7 | 8 | 9
  // 3正=老阳(9), 2正1反=少阴(8), 1正2反=少阳(7), 3反=老阴(6)
  if (heads === 3) result = 9
  else if (heads === 2) result = 8
  else if (heads === 1) result = 7
  else result = 6
  return { coins, result, label: YAO_LABEL[result] }
}

/** 模拟单次三枚铜钱投掷（用于逐爻摇卦，由用户点击停止时定格） */
export function tossSingleYao(): CoinToss {
  return tossThreeCoins()
}

// ── 起卦函数 ──

/** 铜钱摇卦：模拟6次投掷 */
export function coinDivination(): { yaoString: string; tosses: CoinToss[] } {
  const tosses: CoinToss[] = []
  const values: number[] = []
  for (let i = 0; i < 6; i++) {
    const toss = tossThreeCoins()
    tosses.push(toss)
    values.push(toss.result)
  }
  // 从初爻到上爻拼接
  const yaoString = values.join('')
  return { yaoString, tosses }
}

/** 手工录入起卦 */
export function manualDivination(input: string): string {
  return manualQiGua(input)
}

/** 使用 iching-shifa 的 dayan() 随机起卦 */
export function randomDivination(): string {
  return dayan()
}

// ── 排盘函数 ──

/** 执行完整排盘 */
export function performLiuyaoPan(
  yaoString: string,
  method: LiuyaoMethod,
  coinTosses?: CoinToss[],
): LiuyaoResult {
  const now = new Date()
  const pan = decodePan(yaoString, {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  })

  const result: LiuyaoResult = {
    yaoString,
    method,
    benGuaName: pan.benGua.guaName,
    zhiGuaName: pan.dongYaoCount > 0 ? pan.zhiGua.guaName : undefined,
    huGuaName: pan.huGua.guaName,
    dongYaoCount: pan.dongYaoCount,
    dongYaoPositions: pan.benGua.yaoList.filter(y => y.isMoving).map(y => y.position),
    coinTosses,
    pan,
    queryTime: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  }

  return result
}

// ── 序列化函数 ──

/** 将六爻排盘结果序列化为 LLM 上下文文本 */
export function serializeLiuyaoContext(result: LiuyaoResult): string {
  const { pan } = result
  const lines: string[] = []

  // ═══ 标题 ═══
  lines.push('# 六爻占卜排盘信息')
  lines.push('')

  // ═══ 一、起卦信息 ═══
  lines.push('## 一、起卦信息')
  lines.push('')
  const methodLabel = result.method === 'coin' ? '铜钱摇卦' : '手工录入'
  lines.push(`- **起卦方式**：${methodLabel}`)
  lines.push(`- **起卦时间**：${result.queryTime}`)
  lines.push(`- **日干支**：**${pan.ganZhiDay.tian}${pan.ganZhiDay.di}**`)
  lines.push(`- **月建**：${pan.monthJian}`)
  lines.push(`- **旬空**：${pan.dayKong}`)
  lines.push(`- **节气**：${pan.solarTerm}`)
  lines.push('')

  // ═══ 二、卦象概览 ═══
  lines.push('## 二、卦象概览')
  lines.push('')
  lines.push('| 卦象 | 卦名 | 卦辞 |')
  lines.push('|------|------|------|')
  lines.push(`| **本卦** | ${pan.benGua.guaName} | ${GetGuaDescription(pan.benGua.guaName)} |`)
  if (result.dongYaoCount > 0) {
    lines.push(`| **变卦** | ${pan.zhiGua.guaName} | ${GetGuaDescription(pan.zhiGua.guaName)} |`)
  } else {
    lines.push('| **变卦** | 静卦（无动爻） | — |')
  }
  lines.push(`| **互卦** | ${pan.huGua.guaName} | ${GetGuaDescription(pan.huGua.guaName)} |`)
  lines.push('')

  if (result.dongYaoCount > 0) {
    lines.push(`- **动爻数**：${result.dongYaoCount}`)
    lines.push(`- **动爻位置**：${result.dongYaoPositions.map(p => `第${p}爻`).join('、')}`)
    lines.push('')
  }

  // ═══ 三、六爻详情 ═══
  lines.push('## 三、六爻详情')
  lines.push('')
  lines.push('| 爻位 | 纳甲 | 爻性 | 五行 | 六亲 | 六兽 | 世应 | 标记 |')
  lines.push('|------|------|------|------|------|------|------|------|')
  const yaoLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']
  for (const yao of pan.benGua.yaoList) {
    const label = yaoLabels[yao.position - 1]
    const tags: string[] = []
    if (yao.isMoving) tags.push('**动爻**')
    if (yao.shiYing === '世') tags.push('**世爻**')
    if (yao.shiYing === '应') tags.push('**应爻**')
    lines.push(
      `| ${label} | ${yao.naJia} | ${YAO_LABEL[yao.yaoValue]} | ${yao.wuXing || '—'} | ${yao.liuQin} | ${yao.liuShou} | ${yao.shiYing || '—'} | ${tags.join(' ') || '—'} |`
    )
  }
  lines.push('')

  // ═══ 四、伏神 ═══
  if (pan.benGua.fuShen && pan.benGua.fuShen.length > 0) {
    lines.push('## 四、伏神')
    lines.push('')
    lines.push('| 飞爻位置 | 伏神纳甲 | 五行 | 六亲 |')
    lines.push('|----------|----------|------|------|')
    for (const fs of pan.benGua.fuShen) {
      lines.push(`| 第${fs.hostPosition}爻 | ${fs.fuNaJia} | ${fs.fuWuXing || '—'} | ${fs.fuLiuQin} |`)
    }
    lines.push('')
  }

  // ═══ 五、神煞 ═══
  if (pan.shenSha && Object.keys(pan.shenSha).length > 0) {
    const nonEmpty = Object.entries(pan.shenSha).filter(([, v]) => v.length > 0)
    if (nonEmpty.length > 0) {
      lines.push('## 五、神煞')
      lines.push('')
      for (const [key, values] of nonEmpty) {
        lines.push(`- **${key}**：${values.join('、')}`)
      }
      lines.push('')
    }
  }

  // ═══ 六、卦辞断语 ═══
  if (pan.explanation) {
    lines.push('## 六、卦辞断语')
    lines.push('')
    lines.push(pan.explanation)
    lines.push('')
  }

  // ═══ 七、分析要求 ═══
  lines.push('## 七、分析要求')
  lines.push('')
  lines.push('请基于以上六爻排盘数据进行卦象解读和吉凶判断。')
  lines.push('')
  lines.push('分析时请结合以下维度综合判断：')
  lines.push('')
  lines.push('1. **本卦**：当前事态的基本状态')
  lines.push('2. **变卦**：事物发展的最终结果')
  lines.push('3. **互卦**：事物发展的中间过程')
  lines.push('4. **六亲**：父母（文书/长辈）、兄弟（竞争/朋友）、官鬼（官非/疾病/职位）、妻财（财运/妻子）、子孙（子女/福气）')
  lines.push('5. **六兽**：青龙（吉/喜庆）、朱雀（口舌/文书）、勾陈（田土/迟滞）、腾蛇（虚惊/怪异）、白虎（凶伤/丧事）、玄武（盗贼/暧昧）')
  lines.push('6. **世应**：世爻为问卦者自身，应爻为所问之事或对方')
  if (result.dongYaoCount > 0) {
    lines.push('7. **动爻**：重点关注动爻的变化及其对世爻的影响')
  } else {
    lines.push('7. **静卦**：重点分析卦象本身的吉凶含义和世应关系')
  }
  lines.push('8. **神煞**：辅以神煞判断吉凶细节')

  return lines.join('\n')
}

// 六十四卦简要描述
function GetGuaDescription(name: string): string {
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

// ── JSON 序列化（用于注入 LLM 提示词，提升解盘准确性）──

/**
 * 将六爻排盘结果序列化为结构化 JSON，注入大模型提示词
 */
export function serializeLiuyaoJson(result: LiuyaoResult): string {
  const { pan } = result
  const yaoLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

  return JSON.stringify({
    chartType: '六爻',
    queryInfo: {
      method: result.method === 'coin' ? '铜钱摇卦' : '手工录入',
      queryTime: result.queryTime,
    },
    dayGanZhi: pan.ganZhiDay.tian + pan.ganZhiDay.di,
    monthJian: pan.monthJian,
    dayKong: pan.dayKong,
    solarTerm: pan.solarTerm,
    gua: {
      benGua: { name: pan.benGua.guaName },
      huGua: { name: pan.huGua.guaName },
      zhiGua: { name: pan.zhiGua?.guaName || '静卦（无动爻）' },
    },
    dongYao: result.dongYaoCount > 0 ? {
      count: result.dongYaoCount,
      positions: result.dongYaoPositions,
    } : null,
    yaoList: pan.benGua.yaoList.map((yao) => ({
      position: yao.position,
      label: yaoLabels[yao.position - 1],
      naJia: yao.naJia,
      yaoValue: yao.yaoValue,
      wuXing: yao.wuXing || '',
      liuQin: yao.liuQin,
      liuShou: yao.liuShou,
      shiYing: yao.shiYing || '',
      isMoving: yao.isMoving || false,
    })),
    fuShen: (pan.benGua.fuShen || []).map((fs) => ({
      hostPosition: fs.hostPosition,
      fuNaJia: fs.fuNaJia,
      fuWuXing: fs.fuWuXing || '',
      fuLiuQin: fs.fuLiuQin,
    })),
    shenSha: pan.shenSha || {},
  }, null, 2)
}