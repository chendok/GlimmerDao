import { useState, useMemo, useEffect, useRef, Fragment, useCallback } from 'react'
import type { ZiweiResult, GongInfo, StarInfo, StarStatus, ZiweiDaXian, ZiweiLiuNian, ZiweiLiuYue, ZiweiLiuRi, ZiweiLiuShi, DaXianHoroscope, TimeHoroscope } from '../utils/ziweiCalculator'
import { getZiweiDaXianList, getZiweiLiuNianList, getZiweiLiuYueList, getZiweiLiuRiList, getZiweiLiuShiList, getZiweiDaXianHoroscope, getTimeHoroscope, serializeZiweiJson } from '../utils/ziweiCalculator'
import { buildPillarInfo } from '../utils/baziCalculator'
import type { PillarInfo } from '../utils/baziCalculator'
import { GAN_WX, ZHI_WX } from '../core/mingli'
import TimeDimensionRow from './TimeDimensionRow'
import BackButton from './BackButton'
import ZiweiInfoModal from './ZiweiInfoModal'
import BaziReportModal from './BaziReportModal'
import SupplementalInfoModal from './SupplementalInfoModal'
import { API_BASE, TOKEN_KEY } from '../utils/constants'

interface ZiweiResultProps {
  result: ZiweiResult
  onBack: () => void
  /** 容器宽度（px），用于自适应缩放 */
  containerWidth: number
  /** 选中状态变化回调（用于上报到大模型上下文） */
  onSelectionChange?: (selection: {
    daXian: ZiweiDaXian | null
    liuNian: ZiweiLiuNian | null
    liuYue: ZiweiLiuYue | null
    liuRi: ZiweiLiuRi | null
    liuShi: ZiweiLiuShi | null
  } | null) => void
  /** 切换排盘结果收缩状态 */
  onToggleCollapse?: () => void
  /** 排盘结果收缩状态（由父组件控制，用户提交问题后自动收缩） */
  chartCollapsed?: boolean
  /** 收缩信号量：每次发送新问题时递增，强制触发收缩（解决 chartCollapsed 已为 true 时再次发问不触发 useEffect 的问题） */
  collapseNonce?: number
  supplementalInfo: string
  onSupplementalChange: (value: string) => void
}

const STAR_COLORS: Record<string, string> = {
  '主星': 'hsl(var(--color-ziwei-yellow))',
  '辅星': 'hsl(var(--color-ziwei-blue))',
  '吉星': 'hsl(var(--color-ziwei-green))',
  '煞星': 'hsl(var(--color-ziwei-red))',
  '四化': 'hsl(var(--color-accent))',
  '杂星': 'hsl(var(--color-text-secondary))',
}

const SI_HUA_COLORS: Record<string, string> = {
  '化禄': '#FF0000',
  '化权': '#FF0000',
  '化科': '#FF0000',
  '化忌': '#FF0000',
}

const SI_HUA_COLORS_DECADAL: Record<string, string> = {
  '化禄': '#008000',
  '化权': '#008000',
  '化科': '#008000',
  '化忌': '#008000',
}

// 流年/流月/流日/流时 四化颜色 (各不相同)
const SI_HUA_COLORS_LIU_NIAN: Record<string, string> = {
  '化禄': '#1E90FF', '化权': '#1E90FF', '化科': '#1E90FF', '化忌': '#1E90FF',
}
const SI_HUA_COLORS_LIU_YUE: Record<string, string> = {
  '化禄': '#FF8C00', '化权': '#FF8C00', '化科': '#FF8C00', '化忌': '#FF8C00',
}
const SI_HUA_COLORS_LIU_RI: Record<string, string> = {
  '化禄': '#008B8B', '化权': '#008B8B', '化科': '#008B8B', '化忌': '#008B8B',
}
const SI_HUA_COLORS_LIU_SHI: Record<string, string> = {
  '化禄': '#8B008B', '化权': '#8B008B', '化科': '#8B008B', '化忌': '#8B008B',
}

// 运限宫位标签颜色
const TIME_SCOPE_COLORS = {
  daxian: '#008000',
  liunian: '#1E90FF',
  liuyue: '#FF8C00',
  liuri: '#008B8B',
  liushi: '#8B008B',
}

const STATUS_COLORS: Record<StarStatus, string> = {
  '庙': 'hsl(var(--color-ziwei-green))',
  '旺': 'hsl(var(--color-ziwei-yellow))',
  '平': 'hsl(var(--color-text-muted))',
  '陷': 'hsl(var(--color-ziwei-red))',
  '得地': 'hsl(var(--color-ziwei-blue))',
  '落陷': 'hsl(var(--color-ziwei-red))',
}

const WU_XING_COLORS: Record<string, string> = {
  '木': 'hsl(var(--color-ziwei-green))',
  '火': 'hsl(var(--color-ziwei-red))',
  '土': 'hsl(var(--color-ziwei-yellow))',
  '金': 'hsl(var(--color-ziwei-blue))',
  '水': 'hsl(220 60% 60%)',
}

const ZHI_TO_GRID: Record<string, { row: number; col: number }> = {
  '巳': { row: 1, col: 1 },
  '午': { row: 1, col: 2 },
  '未': { row: 1, col: 3 },
  '申': { row: 1, col: 4 },
  '辰': { row: 2, col: 1 },
  '酉': { row: 2, col: 4 },
  '卯': { row: 3, col: 1 },
  '戌': { row: 3, col: 4 },
  '寅': { row: 4, col: 1 },
  '丑': { row: 4, col: 2 },
  '子': { row: 4, col: 3 },
  '亥': { row: 4, col: 4 },
}

const GONG_NAME_TO_DAXIAN: Record<string, string> = {
  '命宫': '大命',
  '兄弟': '大兄',
  '夫妻': '大夫',
  '子女': '大子',
  '财帛': '大财',
  '疾厄': '大疾',
  '迁移': '大迁',
  '交友': '大友',
  '官禄': '大官',
  '田宅': '大田',
  '福德': '大福',
  '父母': '大父',
}

function getStarClass(star: StarInfo): string {
  if (star.siHua) return 'star-sihua'
  if (star.type === '主星') return 'star-main'
  if (star.type === '吉星') return 'star-ji'
  if (star.type === '煞星') return 'star-sha'
  if (star.type === '杂星') return 'star-za'
  return 'star-fu'
}

// ── 紧凑版八字表格组件 ──
interface BaziColumn {
  key: string
  label: string
  pillar: PillarInfo
  shenSha: string[]
  isDynamic: boolean
}

export default function ZiweiResultView({ result, onBack, containerWidth, onSelectionChange, onToggleCollapse, chartCollapsed, collapseNonce, supplementalInfo, onSupplementalChange }: ZiweiResultProps) {
  const [selectedGong, setSelectedGong] = useState<number | null>(null)
  const [showSanFang, setShowSanFang] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showSupplementalModal, setShowSupplementalModal] = useState(false)
  const [sanFangLines, setSanFangLines] = useState<Array<{x1:number;y1:number;x2:number;y2:number;type:'main'|'aux'}>>([])
  const gridRef = useRef<HTMLDivElement>(null)
  const [simpleStars, setSimpleStars] = useState(false)
  const [cardExpanded, setCardExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('ziweiCardExpanded')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (chartCollapsed !== undefined) {
      setCardExpanded(!chartCollapsed)
    }
  }, [chartCollapsed])

  // 监听收缩信号量：每次发送新问题时强制收缩排盘详情
  // （解决用户手动展开后再次发问时 chartCollapsed 已为 true 不触发上面 useEffect 的问题）
  useEffect(() => {
    if (collapseNonce !== undefined && collapseNonce > 0) {
      setCardExpanded(false)
    }
  }, [collapseNonce])

  const toggleCardExpanded = () => {
    setCardExpanded(prev => {
      const next = !prev
      try { localStorage.setItem('ziweiCardExpanded', String(next)) } catch { /* noop */ }
      return next
    })
  }

  const [selectedDaXian, setSelectedDaXian] = useState<number | null>(null)
  const [daXianHoroscope, setDaXianHoroscope] = useState<DaXianHoroscope | null>(null)
  const [selectedLiuNian, setSelectedLiuNian] = useState<number | null>(null)
  const [selectedLiuYue, setSelectedLiuYue] = useState<number | null>(null)
  const [selectedLiuRi, setSelectedLiuRi] = useState<number | null>(null)
  const [selectedLiuShi, setSelectedLiuShi] = useState<number | null>(null)
  const [liuNianHoroscope, setLiuNianHoroscope] = useState<TimeHoroscope | null>(null)
  const [liuYueHoroscope, setLiuYueHoroscope] = useState<TimeHoroscope | null>(null)
  const [liuRiHoroscope, setLiuRiHoroscope] = useState<TimeHoroscope | null>(null)
  const [liuShiHoroscope, setLiuShiHoroscope] = useState<TimeHoroscope | null>(null)

  const currentYear = new Date().getFullYear()

  // 性别标签：阴男/阳男/阴女/阳女
  const genderLabel = useMemo(() => {
    const yangStems = new Set(['甲', '丙', '戊', '庚', '壬'])
    const yearStem = result.yearGanZhi?.[0] || ''
    const isYang = yangStems.has(yearStem)
    const gender = result.gender
    if (isYang) return gender === '男' ? '阳男' : '阳女'
    return gender === '男' ? '阴男' : '阴女'
  }, [result.yearGanZhi, result.gender])

  const gridGongs = useMemo(() => {
    const map: Record<string, GongInfo & { gongIndex: number }> = {}
    result.gongs.forEach((gong, i) => {
      map[gong.zhi] = { ...gong, gongIndex: i }
    })
    return map
  }, [result.gongs])

  // ── 三方四正宫位计算 ──
  const sanFangBase = useMemo(() => {
    // 如果选中了宫位，基于选中宫位；否则基于命宫（索引0）
    const baseIdx = selectedGong !== null ? selectedGong : 0
    return {
      base: result.gongs[baseIdx],
      san1: result.gongs[(baseIdx + 4) % 12],  // 三方1
      san2: result.gongs[(baseIdx + 8) % 12],  // 三方2
      zheng: result.gongs[(baseIdx + 6) % 12], // 四正（对宫）
    }
  }, [result.gongs, selectedGong])

  // ── 三方四正连线坐标计算 ──
  useEffect(() => {
    if (!showSanFang || !gridRef.current) {
      setSanFangLines([])
      return
    }

    const calc = () => {
      const grid = gridRef.current
      if (!grid) return
      const gridRect = grid.getBoundingClientRect()

      const getCenter = (zhi: string | undefined) => {
        if (!zhi) return null
        const cell = grid.querySelector(`[data-zhi="${zhi}"]`) as HTMLElement
        if (!cell) return null
        const rect = cell.getBoundingClientRect()
        return {
          x: rect.left - gridRect.left + rect.width / 2,
          y: rect.top - gridRect.top + rect.height / 2,
        }
      }

      const base = getCenter(sanFangBase.base.zhi)
      const san1 = getCenter(sanFangBase.san1.zhi)
      const san2 = getCenter(sanFangBase.san2.zhi)
      const zheng = getCenter(sanFangBase.zheng.zhi)

      if (!base || !san1 || !san2 || !zheng) return

      // 获取中宫边界（相对于 grid）
      const centerEl = grid.querySelector('.ziwei-center-area') as HTMLElement
      if (!centerEl) return
      const centerRect = centerEl.getBoundingClientRect()
      // 内缩 2px，避免线条紧贴边框
      const inset = 2
      const cxMin = centerRect.left - gridRect.left + inset
      const cyMin = centerRect.top - gridRect.top + inset
      const cxMax = centerRect.right - gridRect.left - inset
      const cyMax = centerRect.bottom - gridRect.top - inset

      // Liang-Barsky 线段裁剪算法：将线段裁剪到中宫矩形内
      const clipLine = (
        x1: number, y1: number, x2: number, y2: number,
        xmin: number, ymin: number, xmax: number, ymax: number
      ): { x1: number; y1: number; x2: number; y2: number } | null => {
        const dx = x2 - x1
        const dy = y2 - y1
        let t0 = 0
        let t1 = 1
        const p = [-dx, dx, -dy, dy]
        const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1]
        for (let i = 0; i < 4; i++) {
          if (p[i] === 0) {
            if (q[i] < 0) return null
          } else {
            const t = q[i] / p[i]
            if (p[i] < 0) {
              if (t > t1) return null
              if (t > t0) t0 = t
            } else {
              if (t < t0) return null
              if (t < t1) t1 = t
            }
          }
        }
        return {
          x1: x1 + t0 * dx,
          y1: y1 + t0 * dy,
          x2: x1 + t1 * dx,
          y2: y1 + t1 * dy,
        }
      }

      // 中宫中心点
      const cxMid = (cxMin + cxMax) / 2
      const cyMid = (cyMin + cyMax) / 2

      // 计算统一起点：命宫→中宫中心 的入射点（中宫朝向命宫的边界中点）
      const entryClip = clipLine(base.x, base.y, cxMid, cyMid, cxMin, cyMin, cxMax, cyMax)
      if (!entryClip) return
      const commonStart = { x: entryClip.x1, y: entryClip.y1 }

      // 计算每条主连线的终点：中宫中心→目标宫 的出射点
      const getExitPoint = (target: { x: number; y: number }) => {
        const exitClip = clipLine(cxMid, cyMid, target.x, target.y, cxMin, cyMin, cxMax, cyMax)
        return exitClip ? { x: exitClip.x2, y: exitClip.y2 } : null
      }

      const zhengExit = getExitPoint(zheng)
      const san1Exit = getExitPoint(san1)
      const san2Exit = getExitPoint(san2)

      const clipped: Array<{ x1: number; y1: number; x2: number; y2: number; type: 'main' | 'aux' }> = []

      // 主连线：统一起点 → 各出射点
      if (zhengExit) clipped.push({ x1: commonStart.x, y1: commonStart.y, x2: zhengExit.x, y2: zhengExit.y, type: 'main' })
      if (san1Exit) clipped.push({ x1: commonStart.x, y1: commonStart.y, x2: san1Exit.x, y2: san1Exit.y, type: 'main' })
      if (san2Exit) clipped.push({ x1: commonStart.x, y1: commonStart.y, x2: san2Exit.x, y2: san2Exit.y, type: 'main' })

      // 辅助连线：连接各主连线的终点（出射点），形成三角形
      if (san1Exit && san2Exit) clipped.push({ x1: san1Exit.x, y1: san1Exit.y, x2: san2Exit.x, y2: san2Exit.y, type: 'aux' })
      if (san2Exit && zhengExit) clipped.push({ x1: san2Exit.x, y1: san2Exit.y, x2: zhengExit.x, y2: zhengExit.y, type: 'aux' })
      if (zhengExit && san1Exit) clipped.push({ x1: zhengExit.x, y1: zhengExit.y, x2: san1Exit.x, y2: san1Exit.y, type: 'aux' })

      setSanFangLines(clipped)
    }

    // 延迟一帧确保 DOM 已渲染
    const timer = setTimeout(calc, 16)
    const ro = new ResizeObserver(calc)
    if (gridRef.current) ro.observe(gridRef.current)
    return () => {
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [showSanFang, sanFangBase])

  const shenGongIdx = result.gongs.findIndex(g => g.bodyGong)

  const daXianList = useMemo(() => {
    return getZiweiDaXianList(result)
  }, [result])

  const displayedLiuNianList = useMemo<ZiweiLiuNian[]>(() => {
    let targetDaXian = selectedDaXian !== null ? daXianList[selectedDaXian] : null
    if (!targetDaXian) {
      targetDaXian = daXianList.find(dx => currentYear >= dx.startYear && currentYear <= dx.endYear) || daXianList[0]
    }
    if (!targetDaXian) return []
    const list = getZiweiLiuNianList(targetDaXian, result)
    list.sort((a, b) => a.year - b.year)
    return list
  }, [selectedDaXian, daXianList, result, currentYear])

  const displayedLiuYueList = useMemo<ZiweiLiuYue[]>(() => {
    if (selectedLiuNian === null) {
      // 始终显示1-12月列表，未选择流年时为禁用占位
      return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        gongIndex: -1,
        gongName: '',
        zhi: '',
        gan: '',
        stars: [],
        siHuaMap: {},
      }))
    }
    return getZiweiLiuYueList(selectedLiuNian, result)
  }, [selectedLiuNian, result])

  const displayedLiuRiList = useMemo<ZiweiLiuRi[]>(() => {
    if (selectedLiuNian === null || selectedLiuYue === null) return []
    return getZiweiLiuRiList(selectedLiuNian, selectedLiuYue, result)
  }, [selectedLiuNian, selectedLiuYue, result])

  useEffect(() => {
    if (selectedLiuYue === null) {
      setSelectedLiuRi(null)
    }
  }, [selectedLiuYue])

  const displayedLiuShiList = useMemo<ZiweiLiuShi[]>(() => {
    if (selectedLiuNian === null || selectedLiuYue === null || selectedLiuRi === null) return []
    return getZiweiLiuShiList(selectedLiuNian, selectedLiuYue, selectedLiuRi, result)
  }, [selectedLiuNian, selectedLiuYue, selectedLiuRi, result])

  useEffect(() => {
    if (selectedLiuRi === null) {
      setSelectedLiuShi(null)
    }
  }, [selectedLiuRi])

  // 选中状态变化时，上报给父组件（用于注入大模型上下文）
  useEffect(() => {
    if (!onSelectionChange) return
    const daXian = selectedDaXian !== null ? (daXianList[selectedDaXian] ?? null) : null
    const liuNian = selectedLiuNian !== null
      ? (displayedLiuNianList.find(item => item.year === selectedLiuNian) ?? null)
      : null
    const liuYue = selectedLiuYue !== null
      ? (displayedLiuYueList.find(item => item.month === selectedLiuYue) ?? null)
      : null
    const liuRi = selectedLiuRi !== null
      ? (displayedLiuRiList.find(item => item.day === selectedLiuRi) ?? null)
      : null
    const liuShi = selectedLiuShi !== null
      ? (displayedLiuShiList.find(item => item.hour === selectedLiuShi) ?? null)
      : null
    onSelectionChange({ daXian, liuNian, liuYue, liuRi, liuShi })
  }, [
    onSelectionChange, selectedDaXian, selectedLiuNian, selectedLiuYue, selectedLiuRi, selectedLiuShi,
    daXianList, displayedLiuNianList, displayedLiuYueList, displayedLiuRiList, displayedLiuShiList,
  ])

  // ── 紧凑版八字表格列 (仅四柱) ──
  const baziColumns = useMemo<BaziColumn[]>(() => {
    const dayGan = result.dayGanZhi[0]
    return [
      { key: 'year', label: '年柱', pillar: buildPillarInfo({ gan: result.yearGanZhi[0], zhi: result.yearGanZhi[1] }, dayGan), shenSha: [], isDynamic: false },
      { key: 'month', label: '月柱', pillar: buildPillarInfo({ gan: result.monthGanZhi[0], zhi: result.monthGanZhi[1] }, dayGan), shenSha: [], isDynamic: false },
      { key: 'day', label: '日柱', pillar: buildPillarInfo({ gan: result.dayGanZhi[0], zhi: result.dayGanZhi[1] }, dayGan), shenSha: [], isDynamic: false },
      { key: 'hour', label: '时柱', pillar: buildPillarInfo({ gan: result.hourGanZhi[0], zhi: result.hourGanZhi[1] }, dayGan), shenSha: [], isDynamic: false },
    ]
  }, [result])

  // ── 命盘格局检测 ──
  const detectedPatterns = useMemo<string[]>(() => {
    const patterns: string[] = []
    const mingGong = result.gongs[0]
    if (!mingGong) return patterns
    const mainStars = mingGong.stars.filter(s => s.type === '主星').map(s => s.name)
    const starSet = new Set(mainStars)

    if (starSet.has('紫微')) {
      if (starSet.has('天府')) patterns.push('紫府同宫')
      else if (starSet.has('贪狼')) patterns.push('紫贪格')
      else if (starSet.has('天相')) patterns.push('紫相同宫')
      else if (starSet.has('七杀')) patterns.push('紫杀同宫')
      else if (starSet.has('破军')) patterns.push('紫破同宫')
      else patterns.push('紫微独坐')
    } else if (starSet.has('天府') && starSet.has('天相')) {
      patterns.push('府相朝垣')
    } else if (starSet.has('武曲')) {
      if (starSet.has('贪狼')) patterns.push('武贪格')
      else if (starSet.has('七杀')) patterns.push('武杀格')
      else if (starSet.has('破军')) patterns.push('武破格')
      else if (starSet.has('天府')) patterns.push('武府同宫')
      else patterns.push('武曲独坐')
    } else if (starSet.has('天机')) {
      if (starSet.has('巨门')) patterns.push('机巨同宫')
      else if (starSet.has('太阴')) patterns.push('机月同梁')
      else if (starSet.has('天梁')) patterns.push('机梁同宫')
      else patterns.push('天机独坐')
    } else if (starSet.has('太阳')) {
      if (starSet.has('太阴')) patterns.push('日月同宫')
      else if (starSet.has('巨门')) patterns.push('巨日同宫')
      else patterns.push('太阳独坐')
    } else if (starSet.has('天同')) {
      if (starSet.has('天梁')) patterns.push('同梁格')
      else if (starSet.has('巨门')) patterns.push('同巨格')
      else patterns.push('天同独坐')
    } else if (starSet.has('廉贞')) {
      if (starSet.has('贪狼')) patterns.push('廉贪格')
      else if (starSet.has('七杀')) patterns.push('廉杀格')
      else if (starSet.has('破军')) patterns.push('廉破格')
      else patterns.push('廉贞独坐')
    } else if (starSet.has('七杀') || starSet.has('破军') || starSet.has('贪狼')) {
      if (starSet.has('七杀')) patterns.push('七杀格')
      if (starSet.has('破军')) patterns.push('破军格')
      if (starSet.has('贪狼')) patterns.push('贪狼格')
    } else if (mainStars.length === 0) {
      patterns.push('空宫借星')
    }

    return patterns.slice(0, 5)
  }, [result])

  // ── 生年四化列表 ──
  const natalSiHuaList = useMemo(() => {
    return Object.entries(result.siHuaMap).map(([star, siHua]) => ({ star, siHua }))
  }, [result.siHuaMap])

  // ── 大限顺逆方向：阳男阴女顺行，阴男阳女逆行 ──
  const daxianDirection = useMemo(() => {
    const yangStems = new Set(['甲', '丙', '戊', '庚', '壬'])
    const yearStem = result.yearGanZhi?.[0] || ''
    const isYang = yangStems.has(yearStem)
    const isMale = result.gender === '男'
    // 阳男 / 阴女 → 顺行；阴男 / 阳女 → 逆行
    return (isYang && isMale) || (!isYang && !isMale) ? '顺行' : '逆行'
  }, [result.yearGanZhi, result.gender])

  // ── 生年纳音五行（如 甲子海中金）──
  const yearNaYin = useMemo(() => {
    return baziColumns[0]?.pillar.naYin || ''
  }, [baziColumns])

  // ── 命宫地支 / 身宫落位 ──
  const mingGongZhi = result.gongs[0]?.zhi || ''
  const shenGongName = result.gongs[shenGongIdx]?.name || ''
  const shenGongZhi = result.gongs[shenGongIdx]?.zhi || ''

  const handleDaXianClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedDaXian === index) {
      setSelectedDaXian(null)
      setDaXianHoroscope(null)
      setSelectedGong(null)
      setSelectedLiuNian(null)
      setLiuNianHoroscope(null)
      setSelectedLiuYue(null)
      setLiuYueHoroscope(null)
      setSelectedLiuRi(null)
      setLiuRiHoroscope(null)
      setSelectedLiuShi(null)
      setLiuShiHoroscope(null)
    } else {
      setSelectedDaXian(index)
      const daXian = daXianList[index]
      if (daXian) {
        setSelectedGong(daXian.gongIndex)
        const horoscope = getZiweiDaXianHoroscope(daXian, result)
        setDaXianHoroscope(horoscope)
      }
    }
  }
  const handleLiuNianClick = (year: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuNian === year) {
      setSelectedLiuNian(null)
      setLiuNianHoroscope(null)
      setSelectedLiuYue(null)
      setLiuYueHoroscope(null)
      setSelectedLiuRi(null)
      setLiuRiHoroscope(null)
      setSelectedLiuShi(null)
      setLiuShiHoroscope(null)
      return
    }
    setSelectedLiuNian(year)
    const horoscope = getTimeHoroscope('yearly', `${year}-7-1`, 0, result)
    setLiuNianHoroscope(horoscope)
    if (selectedDaXian === null) {
      const daXianIndex = daXianList.findIndex(dx => year >= dx.startYear && year <= dx.endYear)
      if (daXianIndex >= 0) {
        setSelectedDaXian(daXianIndex)
        const daXian = daXianList[daXianIndex]
        if (daXian) {
          setSelectedGong(daXian.gongIndex)
          const dxHoroscope = getZiweiDaXianHoroscope(daXian, result)
          setDaXianHoroscope(dxHoroscope)
        }
      }
    } else {
      const ln = displayedLiuNianList.find(item => item.year === year)
      if (ln) {
        setSelectedGong(ln.gongIndex)
      }
    }
  }
  const handleLiuYueClick = (month: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuYue === month) {
      setSelectedLiuYue(null)
      setLiuYueHoroscope(null)
      setSelectedLiuRi(null)
      setLiuRiHoroscope(null)
      setSelectedLiuShi(null)
      setLiuShiHoroscope(null)
      return
    }
    setSelectedLiuYue(month)
    if (selectedLiuNian !== null) {
      const horoscope = getTimeHoroscope('monthly', `${selectedLiuNian}-${month}-15`, 0, result)
      setLiuYueHoroscope(horoscope)
    }
    const ly = displayedLiuYueList.find(item => item.month === month)
    if (ly) {
      setSelectedGong(ly.gongIndex)
    }
  }
  const handleLiuRiClick = (day: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuRi === day) {
      setSelectedLiuRi(null)
      setLiuRiHoroscope(null)
      setSelectedLiuShi(null)
      setLiuShiHoroscope(null)
      return
    }
    setSelectedLiuRi(day)
    if (selectedLiuNian !== null && selectedLiuYue !== null) {
      const horoscope = getTimeHoroscope('daily', `${selectedLiuNian}-${selectedLiuYue}-${day}`, 0, result)
      setLiuRiHoroscope(horoscope)
    }
    const lr = displayedLiuRiList.find(item => item.day === day)
    if (lr) {
      setSelectedGong(lr.gongIndex)
    }
  }
  const handleLiuShiClick = (hour: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuShi === hour) {
      setSelectedLiuShi(null)
      setLiuShiHoroscope(null)
      return
    }
    setSelectedLiuShi(hour)
    if (selectedLiuNian !== null && selectedLiuYue !== null && selectedLiuRi !== null) {
      const horoscope = getTimeHoroscope('hourly', `${selectedLiuNian}-${selectedLiuYue}-${selectedLiuRi}`, hour, result)
      setLiuShiHoroscope(horoscope)
    }
    const ls = displayedLiuShiList.find(item => item.hour === hour)
    if (ls) {
      setSelectedGong(ls.gongIndex)
    }
  }

  // ── 序列化紫微排盘数据为上下文（用于解盘报告）──
  const ziweiContextData = useMemo(() => {
    // 选中焦点
    const selDaXian = selectedDaXian !== null ? (daXianList[selectedDaXian] ?? null) : null
    const selLiuNian = selectedLiuNian !== null
      ? (displayedLiuNianList.find(item => item.year === selectedLiuNian) ?? null) : null
    const selLiuYue = selectedLiuYue !== null
      ? (displayedLiuYueList.find(item => item.month === selectedLiuYue) ?? null) : null
    const selLiuRi = selectedLiuRi !== null
      ? (displayedLiuRiList.find(item => item.day === selectedLiuRi) ?? null) : null
    const selLiuShi = selectedLiuShi !== null
      ? (displayedLiuShiList.find(item => item.hour === selectedLiuShi) ?? null) : null

    const lines: string[] = []

    // ── JSON 结构化数据（优先分析源，提升解盘准确性）──
    lines.push('## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）')
    lines.push('')
    lines.push('```json')
    lines.push(serializeZiweiJson(result, daXianList, {
      daXian: selDaXian ? { startAge: selDaXian.startAge, endAge: selDaXian.endAge, gan: selDaXian.gan, zhi: selDaXian.zhi, gongName: selDaXian.gongName } : null,
      liuNian: selLiuNian ? { year: selLiuNian.year, gan: selLiuNian.gan, zhi: selLiuNian.zhi, gongName: selLiuNian.gongName } : null,
      liuYue: selLiuYue ? { month: selLiuYue.month, gan: selLiuYue.gan, zhi: selLiuYue.zhi, gongName: selLiuYue.gongName } : null,
      liuRi: selLiuRi ? { day: selLiuRi.day, gan: selLiuRi.gan, zhi: selLiuRi.zhi, gongName: selLiuRi.gongName } : null,
      liuShi: selLiuShi ? { zhi: selLiuShi.zhi, gan: selLiuShi.gan, gongName: selLiuShi.gongName } : null,
    }))
    lines.push('```')
    lines.push('')
    lines.push('---')
    lines.push('')

    // ── 文本描述（可读性辅助）──
    if (supplementalInfo.trim()) {
      lines.push('【个人补充信息（必须优先采用）】')
      lines.push(supplementalInfo.trim())
      lines.push('说明：回答和报告中如补充信息与推断冲突，应优先采用补充信息。')
      lines.push('')
    }
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
    lines.push('')

    // 大限列表
    if (daXianList.length > 0) {
      lines.push('【大限排列】')
      for (const dx of daXianList) {
        const mainStars = dx.stars?.filter((s) => s.type === '主星').map((s) => s.name).join('、') || ''
        lines.push(`  ${dx.startAge}-${dx.endAge}岁（${dx.startYear}-${dx.endYear}年）${dx.gan}${dx.zhi} ${dx.gongName}宫${mainStars ? ' 主星[' + mainStars + ']' : ''}`)
      }
      lines.push('')
    }

    // 选中焦点（已在 JSON 中提供，此处仅保留文本标注）
    if (selDaXian || selLiuNian || selLiuYue || selLiuRi || selLiuShi) {
      lines.push('【用户选中的分析焦点——必须重点深入分析】')
      lines.push('【重要性说明】以下时间维度是用户在排盘界面主动选中的分析关注点，代表用户当前最关心的运势阶段。')
      lines.push('  请在报告中对以下选中维度进行「重点深度分析」，篇幅占比不少于整份报告的25%：')
      lines.push('  ─ 对选中的每个维度，展开至少300字以上的详细论述（含：宫位星曜组合、四化飞星、吉凶判断、具体事件建议、注意事项）')
      lines.push('  ─ 若同时选中多个维度（如大限+流年+流月），需分析各维度之间的连锁互动关系')
      lines.push('  ─ 在每个对应章节的标题中使用「★」标注，明确标识为用户选中焦点')
      if (selDaXian) lines.push(`  ★ 大限（重点）：${selDaXian.startAge}-${selDaXian.endAge}岁 ${selDaXian.gan}${selDaXian.zhi} ${selDaXian.gongName}宫`)
      if (selLiuNian) lines.push(`  ★ 流年（重点）：${selLiuNian.year}年 ${selLiuNian.gan}${selLiuNian.zhi} ${selLiuNian.gongName}宫`)
      if (selLiuYue) lines.push(`  ★ 流月（重点）：${selLiuYue.month}月 ${selLiuYue.gan}${selLiuYue.zhi} ${selLiuYue.gongName}宫`)
      if (selLiuRi) lines.push(`  ★ 流日（重点）：${selLiuRi.day}日 ${selLiuRi.gan}${selLiuRi.zhi} ${selLiuRi.gongName}宫`)
      if (selLiuShi) lines.push(`  ★ 流时（重点）：${selLiuShi.zhi}时 ${selLiuShi.gan}${selLiuShi.zhi} ${selLiuShi.gongName}宫`)
      lines.push('')
    }

    lines.push('【分析要求】')
    lines.push('请基于以上完整的紫微斗数排盘数据进行命理分析，生成一份完整的解盘报告。')
    if (selDaXian || selLiuNian || selLiuYue || selLiuRi || selLiuShi) {
      lines.push('对【用户选中的分析焦点】标注的时间维度进行重点、深入、详尽分析，用★在章节标题中标识。')
    }

    return lines.join('\n')
  }, [result, daXianList, selectedDaXian, selectedLiuNian, selectedLiuYue, selectedLiuRi, selectedLiuShi,
      displayedLiuNianList, displayedLiuYueList, displayedLiuRiList, displayedLiuShiList, supplementalInfo])

  const renderGong = (zhi: string) => {
    const entry = gridGongs[zhi]
    if (!entry) return <div className="ziwei-gong empty" />

    const isMingGong = entry.gongIndex === 0
    const isShenGong = entry.gongIndex === shenGongIdx
    const isSelected = selectedGong === entry.gongIndex

    // 收集各运限的四化星
    const collectSiHuaStars = (
      horoscope: { siHuaMap: Record<string, string>; starsByGong: Record<number, StarInfo[]> } | null,
      gongIndex: number,
      natalStars: StarInfo[]
    ): StarInfo[] => {
      if (!horoscope) return []
      const result: StarInfo[] = []
      const scopeStars = horoscope.starsByGong[gongIndex] || []
      for (const star of natalStars) {
        const siHua = horoscope.siHuaMap[star.name]
        if (siHua) {
          result.push({ ...star, siHua })
        }
      }
      for (const star of scopeStars) {
        if (star.siHua) {
          result.push(star)
        }
      }
      return result
    }

    let displayStars: StarInfo[]
    let benMingSiHuaStars: StarInfo[]
    let daXianSiHuaStars: StarInfo[]
    let liuNianSiHuaStars: StarInfo[]
    let liuYueSiHuaStars: StarInfo[]
    let liuRiSiHuaStars: StarInfo[]
    let liuShiSiHuaStars: StarInfo[]

    if (daXianHoroscope) {
      displayStars = entry.stars.map(star => {
        const decadalSiHua = daXianHoroscope.siHuaMap[star.name]
        if (decadalSiHua) {
          return { ...star, siHua: star.siHua || decadalSiHua }
        }
        return star
      })

      benMingSiHuaStars = entry.stars.filter(s => s.siHua)
      daXianSiHuaStars = collectSiHuaStars(daXianHoroscope, entry.gongIndex, entry.stars)
      liuNianSiHuaStars = collectSiHuaStars(liuNianHoroscope, entry.gongIndex, entry.stars)
      liuYueSiHuaStars = collectSiHuaStars(liuYueHoroscope, entry.gongIndex, entry.stars)
      liuRiSiHuaStars = collectSiHuaStars(liuRiHoroscope, entry.gongIndex, entry.stars)
      liuShiSiHuaStars = collectSiHuaStars(liuShiHoroscope, entry.gongIndex, entry.stars)
    } else {
      displayStars = [...entry.stars]
      benMingSiHuaStars = entry.stars.filter(s => s.siHua)
      daXianSiHuaStars = []
      liuNianSiHuaStars = collectSiHuaStars(liuNianHoroscope, entry.gongIndex, entry.stars)
      liuYueSiHuaStars = collectSiHuaStars(liuYueHoroscope, entry.gongIndex, entry.stars)
      liuRiSiHuaStars = collectSiHuaStars(liuRiHoroscope, entry.gongIndex, entry.stars)
      liuShiSiHuaStars = collectSiHuaStars(liuShiHoroscope, entry.gongIndex, entry.stars)
    }

    // 十二长生: 使用最细粒度的运限盘，并确定来源时间维度以设置颜色
    let activeChangSheng = entry.changSheng
    let changShengColor: string | undefined = undefined

    if (selectedLiuShi !== null && liuShiHoroscope?.changShengByGong[entry.gongIndex]) {
      activeChangSheng = liuShiHoroscope.changShengByGong[entry.gongIndex]
      changShengColor = TIME_SCOPE_COLORS.liushi
    } else if (selectedLiuRi !== null && liuRiHoroscope?.changShengByGong[entry.gongIndex]) {
      activeChangSheng = liuRiHoroscope.changShengByGong[entry.gongIndex]
      changShengColor = TIME_SCOPE_COLORS.liuri
    } else if (selectedLiuYue !== null && liuYueHoroscope?.changShengByGong[entry.gongIndex]) {
      activeChangSheng = liuYueHoroscope.changShengByGong[entry.gongIndex]
      changShengColor = TIME_SCOPE_COLORS.liuyue
    } else if (selectedLiuNian !== null && liuNianHoroscope?.changShengByGong[entry.gongIndex]) {
      activeChangSheng = liuNianHoroscope.changShengByGong[entry.gongIndex]
      changShengColor = TIME_SCOPE_COLORS.liunian
    } else if (selectedDaXian !== null && daXianHoroscope?.changShengByGong[entry.gongIndex]) {
      activeChangSheng = daXianHoroscope.changShengByGong[entry.gongIndex]
      changShengColor = TIME_SCOPE_COLORS.daxian
    }

    // 运限宫位标签
    const renderTimeTag = (
      horoscope: { palaceNamesByGong: Record<number, string> } | null,
      prefix: string,
      color: string
    ) => {
      if (!horoscope) return null
      const palaceName = horoscope.palaceNamesByGong[entry.gongIndex]
      const tag = palaceName
        ? prefix + palaceName.replace('宫', '').charAt(0)
        : GONG_NAME_TO_DAXIAN[entry.name]?.replace('大', prefix) || prefix + entry.name.charAt(0)
      return <div className="ziwei-gong-time-tag" style={{ color }}>{tag}</div>
    }

    // 精简星耀模式：隐藏辅星和杂星
    const visibleStars = simpleStars
      ? displayStars.filter(s => s.type !== '辅星' && s.type !== '杂星')
      : displayStars

    return (
      <div
        className={`ziwei-gong ${isMingGong ? 'ming-gong' : ''} ${isShenGong ? 'shen-gong' : ''} ${isSelected ? 'selected' : ''}`}
        data-zhi={entry.zhi}
        onClick={() => setSelectedGong(selectedGong === entry.gongIndex ? null : entry.gongIndex)}
        style={{ gridRow: entry.zhi ? `${ZHI_TO_GRID[entry.zhi].row}` : '1', gridColumn: entry.zhi ? `${ZHI_TO_GRID[entry.zhi].col}` : '1' }}
      >

        <div className="ziwei-gong-tags-container">
          {liuShiHoroscope && renderTimeTag(liuShiHoroscope, '时', TIME_SCOPE_COLORS.liushi)}
          {liuRiHoroscope && renderTimeTag(liuRiHoroscope, '日', TIME_SCOPE_COLORS.liuri)}
          {liuYueHoroscope && renderTimeTag(liuYueHoroscope, '月', TIME_SCOPE_COLORS.liuyue)}
          {liuNianHoroscope && renderTimeTag(liuNianHoroscope, '年', TIME_SCOPE_COLORS.liunian)}
          {selectedDaXian !== null && daXianHoroscope && (
            <div className="ziwei-gong-daxian-tag" style={{ color: TIME_SCOPE_COLORS.daxian }}>
              {daXianHoroscope.palaceNamesByGong[entry.gongIndex]
                ? '大' + daXianHoroscope.palaceNamesByGong[entry.gongIndex].replace('宫', '').charAt(0)
                : GONG_NAME_TO_DAXIAN[entry.name]}
            </div>
          )}
          <div className={`ziwei-gong-name ${isMingGong ? 'ming-gong-name' : ''}`}>
            {entry.name}
          </div>
        </div>
        <div className="ziwei-gong-stars-section">
          {visibleStars.length > 0 ? (
            visibleStars.map((star, si) => (
              <div key={si} className="ziwei-star-item">
                <span
                  className={`ziwei-star ${getStarClass(star)}`}
                  style={star.siHua ? { color: SI_HUA_COLORS[star.siHua] || STAR_COLORS[star.type] } : { color: STAR_COLORS[star.type] }}
                >
                  {star.name}
                </span>
                {star.status && (
                  <span className="ziwei-star-status" style={{ color: STATUS_COLORS[star.status] }}>
                    {star.status}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="ziwei-empty-gong">空</div>
          )}
        </div>

        <div className="ziwei-gong-decadal-stars">
          {selectedDaXian !== null && daXianHoroscope && (daXianHoroscope.starsByGong[entry.gongIndex] || []).length > 0 && (
            <div className="ziwei-decadal-row" style={{ color: TIME_SCOPE_COLORS.daxian }}>
              {(daXianHoroscope.starsByGong[entry.gongIndex] || []).map((star, i) => (
                <span key={`dx-sr-${i}`} className="ziwei-decadal-star">{star.name}</span>
              ))}
            </div>
          )}
          {selectedLiuNian !== null && liuNianHoroscope && (liuNianHoroscope.starsByGong[entry.gongIndex] || []).length > 0 && (
            <div className="ziwei-decadal-row" style={{ color: TIME_SCOPE_COLORS.liunian }}>
              {(liuNianHoroscope.starsByGong[entry.gongIndex] || []).map((star, i) => (
                <span key={`ln-sr-${i}`} className="ziwei-decadal-star">{star.name}</span>
              ))}
            </div>
          )}
          {selectedLiuYue !== null && liuYueHoroscope && (liuYueHoroscope.starsByGong[entry.gongIndex] || []).length > 0 && (
            <div className="ziwei-decadal-row" style={{ color: TIME_SCOPE_COLORS.liuyue }}>
              {(liuYueHoroscope.starsByGong[entry.gongIndex] || []).map((star, i) => (
                <span key={`ly-sr-${i}`} className="ziwei-decadal-star">{star.name}</span>
              ))}
            </div>
          )}
          {selectedLiuRi !== null && liuRiHoroscope && (liuRiHoroscope.starsByGong[entry.gongIndex] || []).length > 0 && (
            <div className="ziwei-decadal-row" style={{ color: TIME_SCOPE_COLORS.liuri }}>
              {(liuRiHoroscope.starsByGong[entry.gongIndex] || []).map((star, i) => (
                <span key={`lr-sr-${i}`} className="ziwei-decadal-star">{star.name}</span>
              ))}
            </div>
          )}
          {selectedLiuShi !== null && liuShiHoroscope && (liuShiHoroscope.starsByGong[entry.gongIndex] || []).length > 0 && (
            <div className="ziwei-decadal-row" style={{ color: TIME_SCOPE_COLORS.liushi }}>
              {(liuShiHoroscope.starsByGong[entry.gongIndex] || []).map((star, i) => (
                <span key={`ls-sr-${i}`} className="ziwei-decadal-star">{star.name}</span>
              ))}
            </div>
          )}
        </div>

        {(benMingSiHuaStars.length > 0 || daXianSiHuaStars.length > 0 || liuNianSiHuaStars.length > 0 || liuYueSiHuaStars.length > 0 || liuRiSiHuaStars.length > 0 || liuShiSiHuaStars.length > 0) && (
          <div className="ziwei-gong-sihua-container">
            <div className="ziwei-gong-sihua-group">
              {benMingSiHuaStars.map((star, i) => (
                <span key={`bm-${i}`} className="ziwei-gong-sihua" style={{ color: SI_HUA_COLORS[star.siHua!] }}>
                  {star.siHua!.replace('化', '')}
                </span>
              ))}
            </div>
            {daXianSiHuaStars.length > 0 && (
              <div className="ziwei-gong-sihua-group">
                {daXianSiHuaStars.map((star, i) => (
                  <span key={`dx-${i}`} className="ziwei-gong-sihua" style={{ color: SI_HUA_COLORS_DECADAL[star.siHua!] }}>
                    {star.siHua!.replace('化', '')}
                  </span>
                ))}
              </div>
            )}
            {liuNianSiHuaStars.length > 0 && (
              <div className="ziwei-gong-sihua-group">
                {liuNianSiHuaStars.map((star, i) => (
                  <span key={`ln-${i}`} className="ziwei-gong-sihua" style={{ color: SI_HUA_COLORS_LIU_NIAN[star.siHua!] }}>
                    {star.siHua!.replace('化', '')}
                  </span>
                ))}
              </div>
            )}
            {liuYueSiHuaStars.length > 0 && (
              <div className="ziwei-gong-sihua-group">
                {liuYueSiHuaStars.map((star, i) => (
                  <span key={`ly-${i}`} className="ziwei-gong-sihua" style={{ color: SI_HUA_COLORS_LIU_YUE[star.siHua!] }}>
                    {star.siHua!.replace('化', '')}
                  </span>
                ))}
              </div>
            )}
            {liuRiSiHuaStars.length > 0 && (
              <div className="ziwei-gong-sihua-group">
                {liuRiSiHuaStars.map((star, i) => (
                  <span key={`lr-${i}`} className="ziwei-gong-sihua" style={{ color: SI_HUA_COLORS_LIU_RI[star.siHua!] }}>
                    {star.siHua!.replace('化', '')}
                  </span>
                ))}
              </div>
            )}
            {liuShiSiHuaStars.length > 0 && (
              <div className="ziwei-gong-sihua-group">
                {liuShiSiHuaStars.map((star, i) => (
                  <span key={`ls-${i}`} className="ziwei-gong-sihua" style={{ color: SI_HUA_COLORS_LIU_SHI[star.siHua!] }}>
                    {star.siHua!.replace('化', '')}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ziwei-gong-center-info mode-transition-content">
          {selectedDaXian === null && (
            <>
              <div className="ziwei-center-daxian">{entry.ageRange}</div>
              <div className="ziwei-center-liunian">流年：{entry.liuNian}</div>
              <div className="ziwei-center-xiaoxian">小限：{entry.xiaoXian}</div>
            </>
          )}
          <div className={`ziwei-center-changsheng`} style={changShengColor ? { color: changShengColor } : undefined}>
            {activeChangSheng}
          </div>
        </div>

        {isShenGong && !selectedDaXian && !selectedLiuNian && !selectedLiuYue && !selectedLiuRi && !selectedLiuShi && (
          <div className="ziwei-gong-shen-indicator">身</div>
        )}

        <div className="ziwei-gong-left-shensha mode-transition-content">
          {(() => {
            let displayShenSha: string[] = entry.shenSha
            let displayColor: string | undefined = undefined

            if (selectedLiuShi !== null && liuShiHoroscope && liuShiHoroscope.shenShaByGong[entry.gongIndex]?.length > 0) {
              displayShenSha = liuShiHoroscope.shenShaByGong[entry.gongIndex]
              displayColor = TIME_SCOPE_COLORS.liushi
            } else if (selectedLiuRi !== null && liuRiHoroscope && liuRiHoroscope.shenShaByGong[entry.gongIndex]?.length > 0) {
              displayShenSha = liuRiHoroscope.shenShaByGong[entry.gongIndex]
              displayColor = TIME_SCOPE_COLORS.liuri
            } else if (selectedLiuYue !== null && liuYueHoroscope && liuYueHoroscope.shenShaByGong[entry.gongIndex]?.length > 0) {
              displayShenSha = liuYueHoroscope.shenShaByGong[entry.gongIndex]
              displayColor = TIME_SCOPE_COLORS.liuyue
            } else if (selectedLiuNian !== null && liuNianHoroscope && liuNianHoroscope.shenShaByGong[entry.gongIndex]?.length > 0) {
              displayShenSha = liuNianHoroscope.shenShaByGong[entry.gongIndex]
              displayColor = TIME_SCOPE_COLORS.liunian
            } else if (selectedDaXian !== null && daXianHoroscope && daXianHoroscope.shenShaByGong[entry.gongIndex]?.length > 0) {
              displayShenSha = daXianHoroscope.shenShaByGong[entry.gongIndex]
              displayColor = TIME_SCOPE_COLORS.daxian
            }

            return displayShenSha.map((sha, i) => (
              <span key={`sha-${i}`} className="ziwei-shensha-item" style={displayColor ? { color: displayColor } : undefined}>{sha}</span>
            ))
          })()}
        </div>
        <div className="ziwei-gong-ganzhi">{entry.gan}{entry.zhi}</div>
      </div>
    )
  }

  /**
   * 自适应缩放因子计算
   * 紫微大屏设计基准宽度 700px（ziwei-chart-grid max-width）
   * 最小可用宽度 380px，映射到 scale 0.5
   * 公式: scale = clamp(0.5, (containerWidth - 60) / 640, 1.0)
   * 误差 ≤ 0.5%（受 getBoundingClientRect 浮点精度影响）
   */
  const scale = useMemo(() => {
    if (containerWidth <= 0) return 1
    const DESIGN_WIDTH = 700
    const MIN_WIDTH = 380
    const MIN_SCALE = 0.5
    // Simplified: scale = 0.5 + (containerWidth - 380) / 640
    const computed = 0.5 + (containerWidth - MIN_WIDTH) / (2 * (DESIGN_WIDTH - MIN_WIDTH))
    return Math.min(1, Math.max(MIN_SCALE, Math.round(computed * 1000) / 1000))
  }, [containerWidth])

  /** 容器宽度对应的CSS自定义属性，用于子元素自适应 */
  const containerStyle = useMemo(() => ({
    '--ziwei-container-width': `${containerWidth}px`,
    '--ziwei-scale': String(scale),
  } as React.CSSProperties), [containerWidth, scale])

  return (
    <div className="ziwei-result-page" style={containerStyle}>
      {/* 紫微斗数综合卡片 */}
      <div className="bazi-combined-card">
        {/* 卡片头部：用户信息 + 收缩/展开按钮 */}
        <div className="bazi-card-header" onClick={toggleCardExpanded}>
          {/* 左侧垂直操作区：返回按钮 + 排盘信息按钮（放在 bazi-card-title 外面） */}
          <div className="bazi-left-actions" onClick={(e) => e.stopPropagation()}>
            <BackButton onClick={() => onBack()} />
            <button
              type="button"
              className="bazi-toolbar-btn"
              onClick={() => setShowInfoModal(true)}
              title="排盘信息"
            >
              排盘信息
            </button>
          </div>
          <div className="bazi-card-title">
            <div className="bazi-info-card">
              <h2 className="bazi-name">
                {result.name || '匿名'}
                <button type="button" className="supplemental-info-icon" onClick={() => setShowSupplementalModal(true)} title="维护个人补充信息" aria-label="维护个人补充信息">✎</button>
                <span className="bazi-gender-tag">{genderLabel}</span>
              </h2>
              <p className="bazi-desc">
                出生日期 {result.solarDate} · 真太阳时 {result.trueSolarTime}
              </p>
              <p className="bazi-pattern-desc">
                命主：{result.mingZhu} · 身主：{result.shenZhu} · 斗指：{result.douZhi} · {result.wuXingJu}{result.wuXingJuNum}局
              </p>
            </div>
          </div>
          <div className="bazi-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bazi-expand-btn"
              aria-expanded={cardExpanded}
              onClick={() => setCardExpanded(!cardExpanded)}
            >
              {cardExpanded ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 15l7-7 7 7"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5l7 7-7 7"/>
                </svg>
              )}
            </button>
            {/* 解盘报告按钮 - 位于展开/收缩按钮下方 */}
            <button
              type="button"
              className="bazi-toolbar-btn"
              onClick={(e) => { e.stopPropagation(); setShowReportModal(true); }}
              style={{ marginTop: '4px' }}
            >
              解盘报告
            </button>
          </div>
        </div>

        {/* 排盘信息弹窗 */}
        {showInfoModal && (
          <ZiweiInfoModal
            result={result}
            daXianList={daXianList}
            selectedDaXianIdx={selectedDaXian}
            selectedLiuNian={selectedLiuNian}
            selectedLiuYue={selectedLiuYue}
            selectedLiuRi={selectedLiuRi}
            selectedLiuShi={selectedLiuShi}
            displayedLiuNianList={displayedLiuNianList}
            displayedLiuYueList={displayedLiuYueList}
            displayedLiuRiList={displayedLiuRiList}
            displayedLiuShiList={displayedLiuShiList}
            onClose={() => setShowInfoModal(false)}
            archiveData={{
              name: result.name,
              gender: result.gender,
              birth_datetime: result.solarDate,
              birthplace: null,
              calendar_type: '公历',
              bazi_result: result as unknown as Record<string, unknown>,
            }}
          />
        )}

        <div className={`bazi-card-content ${cardExpanded ? 'expanded' : 'collapsed'}`}>
            <div className="bazi-chart-content-wrapper">
            <div className="ziwei-chart-container">
              <div className="ziwei-chart-grid" ref={gridRef}>
                {['巳', '午', '未', '申', '辰', '酉', '卯', '戌', '寅', '丑', '子', '亥'].map(zhi => <Fragment key={zhi}>{renderGong(zhi)}</Fragment>)}

                {showSanFang && sanFangLines.length > 0 && (
                  <svg className="sanfang-overlay" aria-label="三方四正连线">
                    <defs>
                      <marker id="sf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#1E88E5" />
                      </marker>
                    </defs>
                    {sanFangLines.map((line, i) => (
                      <line
                        key={i}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke="#1E88E5"
                        strokeWidth={line.type === 'main' ? 2 : 1.5}
                        strokeDasharray={line.type === 'main' ? '5 2' : '3 3'}
                        opacity={line.type === 'main' ? 0.75 : 0.4}
                        markerEnd={line.type === 'main' ? 'url(#sf-arrow)' : undefined}
                      />
                    ))}
                  </svg>
                )}

                <div className="ziwei-center-area">
                  <button
                    className={`center-toggle-btn sanfang-toggle-btn ${showSanFang ? 'active' : ''}`}
                    onClick={() => setShowSanFang(!showSanFang)}
                    title="三方四正"
                  >
                    三方四正
                  </button>
                  <button
                    className={`center-toggle-btn simple-stars-btn ${simpleStars ? 'active' : ''}`}
                    onClick={() => setSimpleStars(!simpleStars)}
                    title="精简星耀"
                  >
                    精简星耀
                  </button>
                  <div className="ziwei-center">
                    {/* 1. 基础生辰档案 */}
                    <div className="ziwei-center-birth">
                      <div className="center-birth-primary">
                        <span className="center-birth-name">{result.name}</span>
                        <span className="center-birth-gender">{result.gender}</span>
                        <span className="center-birth-nayin">{result.yearGanZhi}·{yearNaYin}</span>
                      </div>
                      <div className="center-birth-secondary">
                        <span>阳历 {result.solarDate}</span>
                        <span className="center-birth-sep">|</span>
                        <span>农历 {result.lunarDate}</span>
                      </div>
                      <div className="center-birth-tertiary">
                        <span>{result.clockTime}</span>
                        {result.trueSolarTime && result.trueSolarTime !== result.clockTime && (
                          <>
                            <span className="center-birth-sep">|</span>
                            <span>真太阳时 {result.trueSolarTime}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 2. 四柱干支（八字）— 横向 4 列，每列天干+地支 */}
                    <div className="ziwei-center-bazi">
                      {baziColumns.map((col) => (
                        <div key={col.key} className="center-bazi-pillar">
                          <div className="center-bazi-label">{col.label}</div>
                          <div className="center-bazi-gan" style={{ color: WU_XING_COLORS[GAN_WX[col.pillar.gan]] || 'inherit' }}>
                            {col.pillar.gan}
                          </div>
                          <div className="center-bazi-zhi" style={{ color: WU_XING_COLORS[ZHI_WX[col.pillar.zhi]] || 'inherit' }}>
                            {col.pillar.zhi}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 3. 盘体核心配置 */}
                    <div className="ziwei-center-config">
                      <span className="center-config-item">{result.wuXingJu}{result.wuXingJuNum}局</span>
                      <span className="center-config-sep">·</span>
                      <span className="center-config-item">命宫{mingGongZhi}</span>
                      <span className="center-config-sep">·</span>
                      <span className="center-config-item">身宫{shenGongName}({shenGongZhi})</span>
                      <span className="center-config-sep">·</span>
                      <span className="center-config-item">大限{daxianDirection}</span>
                      <span className="center-config-sep">·</span>
                      <span className="center-config-item">起运{result.wuXingJuNum}岁</span>
                    </div>

                    {/* 4. 命主星 + 身主星（视觉重心）*/}
                    <div className="ziwei-center-main">
                      <div className="center-main-item">
                        <span className="center-main-label">命主</span>
                        <span className="center-main-star">{result.mingZhu}</span>
                      </div>
                      <div className="center-main-divider" />
                      <div className="center-main-item">
                        <span className="center-main-label">身主</span>
                        <span className="center-main-star">{result.shenZhu}</span>
                      </div>
                    </div>

                    {/* 5. 生年四化总览 — 横向四列 */}
                    <div className="ziwei-center-sihua">
                      {natalSiHuaList.map(({ star, siHua }) => (
                        <div key={siHua} className="center-sihua-item">
                          <span className="center-sihua-name">{siHua}</span>
                          <span className="center-sihua-star">{star}</span>
                        </div>
                      ))}
                    </div>

                    {/* 6. 格局总论（小字）*/}
                    <div className="ziwei-center-patterns">
                      {detectedPatterns.map((p) => (
                        <span key={p} className="center-pattern-tag">{p}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ziwei-chart-time-dimensions">
                <TimeDimensionRow
                  title="大限"
                  disabled={false}
                  items={daXianList.map((dx, index) => ({
                    key: index,
                    label: `${dx.startAge}-${dx.endAge}`,
                    isSelected: selectedDaXian === index,
                  }))}
                  onSelect={handleDaXianClick}
                />

                <TimeDimensionRow
                  title="流年"
                  disabled={false}
                  items={displayedLiuNianList.map((ln) => ({
                    key: ln.year,
                    label: `${ln.year}`,
                    isSelected: selectedLiuNian === ln.year,
                  }))}
                  onSelect={handleLiuNianClick}
                />

                <TimeDimensionRow
                  title="流月"
                  disabled={selectedLiuNian === null}
                  items={displayedLiuYueList.map((ly) => ({
                    key: ly.month,
                    label: `${ly.month}月`,
                    isSelected: selectedLiuYue === ly.month,
                  }))}
                  onSelect={handleLiuYueClick}
                />

                <TimeDimensionRow
                  title="流日"
                  disabled={selectedLiuYue === null}
                  items={displayedLiuRiList.map((lr) => ({
                    key: lr.day,
                    label: `${lr.day}`,
                    isSelected: selectedLiuRi === lr.day,
                  }))}
                  onSelect={handleLiuRiClick}
                />

                <TimeDimensionRow
                  title="流时"
                  disabled={selectedLiuRi === null}
                  items={displayedLiuShiList.map((ls) => ({
                    key: ls.hour,
                    label: `${ls.zhi}时`,
                    isSelected: selectedLiuShi === ls.hour,
                  }))}
                  onSelect={handleLiuShiClick}
                />
              </div>
            </div>
        </div>
      </div>

      {/* 解盘报告弹窗 */}
      {showReportModal && (
        <BaziReportModal
          chartType="紫微"
          chartName={result.name}
          contextData={ziweiContextData}
          archiveData={{
            name: result.name,
            gender: result.gender,
            birth_datetime: result.solarDate,
            birthplace: null,
            calendar_type: '公历',
            bazi_result: result as unknown as Record<string, unknown>,
            supplemental_info: supplementalInfo,
          }}
          onClose={() => setShowReportModal(false)}
        />
      )}
      {showSupplementalModal && (
        <SupplementalInfoModal
          name={result.name || '匿名'}
          initialValue={supplementalInfo}
          onSave={async (value) => {
            const token = sessionStorage.getItem(TOKEN_KEY)
            if (!token) throw new Error('请先登录后保存个人补充信息')
            const res = await fetch(`${API_BASE}/archives/by-name/${encodeURIComponent(result.name)}/supplemental-info`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ supplemental_info: value }),
            })
            if (!res.ok) throw new Error('保存个人补充信息失败，请确认档案已保存')
            onSupplementalChange(value)
          }}
          onClose={() => setShowSupplementalModal(false)}
        />
      )}
    </div>
  )
}
