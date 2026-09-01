import { useState, useMemo, useEffect, useCallback } from 'react'
import type { BaziResult, PillarInfo, DaYun, LiuNian, LiuYue, LiuRi, LiuShi, NatalContext } from '../utils/baziCalculator'
import { getLiuNianList, getLiuYueList, getLiuRiList, getLiuShiList, buildPillarInfo, getPillarShenSha, ZANG_GAN, serializeBaziJson } from '../utils/baziCalculator'
import { GAN_WX, ZHI_WX, GAN_YIN_YANG } from '../core/mingli'
import { getShiShen, calcPattern, calcDayMasterStrength } from '../core/bazi'
import TimeDimensionRow from './TimeDimensionRow'
import BackButton from './BackButton'
import BaziInfoModal from './BaziInfoModal'
import BaziReportModal from './BaziReportModal'
import SupplementalInfoModal from './SupplementalInfoModal'
import { API_BASE, TOKEN_KEY } from '../utils/constants'

// ── 五行颜色（传统中国色，和谐柔和，UI 展示专用，非命理数据） ──
const WU_XING_COLOR: { [key: string]: string } = {
  '木': '#7B9B6A', '火': '#C4614A', '土': '#C49A3C',
  '金': '#C9A84C', '水': '#5B8CC0',
}

// ── 五行图标（SVG） ──
function WuXingIcon({ wx, size = 16 }: { wx: string; size?: number }) {
  const color = WU_XING_COLOR[wx] || '#999'
  const icon = WU_XING_ICONS[wx]
  if (!icon) return null
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {icon(color)}
    </svg>
  )
}

const WU_XING_ICONS: Record<string, (color: string) => React.ReactNode> = {
  '木': (c) => (<>
    <rect x="18" y="28" width="4" height="12" rx="2" fill={c} />
    <path d="M14 20L20 6L26 20L20 16L14 20Z" fill={c} opacity="0.85" />
    <path d="M10 28L20 16L30 28L20 24L10 28Z" fill={c} opacity="0.6" />
  </>),
  '火': (c) => (<>
    <path d="M20 6C18 14 10 16 10 22C10 27.5 14.5 32 20 32C25.5 32 30 27.5 30 22C30 16 22 14 20 6Z" fill={c} opacity="0.85" />
    <path d="M20 12C18 18 14 20 14 23C14 26.5 16.5 29 20 29C23.5 29 26 26.5 26 23C26 20 22 18 20 12Z" fill={c} opacity="0.5" />
  </>),
  '土': (c) => (<>
    <path d="M4 34L12 20L20 28L28 18L36 34H4Z" fill={c} opacity="0.7" />
    <path d="M8 34L14 24L20 30L26 22L32 34H8Z" fill={c} opacity="0.4" />
  </>),
  '金': (c) => (<>
    <path d="M20 4L28 20L20 36L12 20L20 4Z" fill={c} opacity="0.85" />
    <path d="M20 10L25 20L20 30L15 20L20 10Z" fill={c} opacity="0.5" />
  </>),
  '水': (c) => (<>
    <path d="M8 20C8 14 12 8 20 8C28 8 32 14 32 20C32 28 28 28 20 28C12 28 8 28 8 20Z" fill={c} opacity="0.3" />
    <path d="M10 20C10 16 14 12 20 12C26 12 30 16 30 20C30 26 26 24 20 24C14 24 10 24 10 20Z" fill={c} opacity="0.55" />
    <ellipse cx="20" cy="18" rx="8" ry="4" fill={c} opacity="0.8" />
  </>),
}

// ── 天干/地支 + 五行图标 + 五行文字 ──
function GZWithWuxing({ char, type }: { char: string; type: 'gan' | 'zhi' }) {
  const wx = type === 'gan' ? GAN_WX[char] : ZHI_WX[char]
  const color = WU_XING_COLOR[wx] || '#999'
  if (!char) return <span className="bazi-gan-item" />
  return (
    <span className="bazi-gan-item" style={{ color, flexDirection: 'column', gap: 2 }}>
      <span className="bazi-gz-char">{char}</span>
      <span className="bazi-gz-wx-row">
        <WuXingIcon wx={wx} size={12} />
        <span className="bazi-gz-wx-label">{wx}</span>
      </span>
    </span>
  )
}

// ── 藏干 + 五行 ──
function CangGanItem({ char }: { char: string }) {
  const wx = GAN_WX[char]
  const color = WU_XING_COLOR[wx] || '#999'
  if (!char) return null
  return (
    <span className="bazi-canggan-item" style={{ color }}>
      {char}<sub>{wx}</sub>
    </span>
  )
}

// ══════════════════════════════════════════════════════════════
//  日主强弱计算 & 格局判定（算法统一收敛到 core/bazi）
// ══════════════════════════════════════════════════════════════

// ── 四柱表格行 ──
function TableRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bazi-table-row">
      <div className="bazi-table-label">{label}</div>
      <div className="bazi-table-cells">{children}</div>
    </div>
  )
}

// ── 命盘宽表（本命四柱 + 可选动态柱，PC 与手机共用）──
function BaziTable({ columns, strengthLevel }: { columns: BaziColumn[]; strengthLevel: string }) {
  return (
    <div className="bazi-table">
      {/* 主星 */}
      <TableRow label="主星">
        {columns.map((col) => (
          <div key={col.key} className={`bazi-cell ${col.isDynamic ? 'dynamic dimension-' + col.dimension : ''}`}>
            <div className="bazi-cell-header">{col.label}</div>
            <div className="bazi-cell-body">
              <span className="bazi-zhuxing-item">
                {col.key === 'day' ? '日主' : (col.pillar.zhuXing || '-')}
              </span>
              {col.key === 'day' && (
                <span className={`bazi-strength-badge ${strengthLevel === '身强' ? 'strong' : strengthLevel === '中和' ? 'neutral' : 'weak'}`}>
                  {strengthLevel}
                </span>
              )}
            </div>
          </div>
        ))}
      </TableRow>

      {/* 天干行（带五行） */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">天干</div>
        <div className="bazi-table-cells">
          <div className="bazi-gan-row">
            {columns.map((col) => (
              <GZWithWuxing key={col.key} char={col.pillar.gan} type="gan" />
            ))}
          </div>
        </div>
      </div>

      {/* 地支行（带五行） */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">地支</div>
        <div className="bazi-table-cells">
          <div className="bazi-gan-row">
            {columns.map((col) => (
              <div key={col.key} className="bazi-zhi-wrapper">
                <GZWithWuxing char={col.pillar.zhi} type="zhi" />
                {col.key === 'month' && (
                  <span className="bazi-yueling-tag">月令</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 藏干（带五行） */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">藏干</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-canggan-cell">
              {(col.pillar.zangGan || []).map((cg, j) => (
                <CangGanItem key={j} char={cg} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 副星 */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">副星</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-fuxing-cell">
              {(col.pillar.fuXing || []).map((fx, j) => (
                <span key={j} className="bazi-fuxing-item">{fx}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 星运 */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">星运</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-simple-cell">
              <span className="bazi-xingyun">{col.pillar.xingYun}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 自坐 */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">自坐</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-zizuo-cell">
              <span className="bazi-zizuo">{col.pillar.zizuo}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 空亡 */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">空亡</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-simple-cell">
              <span className="bazi-kongwang">{(col.pillar.kongWang || []).join('') || '-'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 纳音 */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">纳音</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-simple-cell">
              <span className="bazi-nayin">{col.pillar.naYin}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 神煞 */}
      <div className="bazi-table-row">
        <div className="bazi-table-label">神煞</div>
        <div className="bazi-table-cells">
          {columns.map((col) => (
            <div key={col.key} className="bazi-shensha-cell">
              {col.shenSha.length > 0
                ? col.shenSha.map((ss, idx) => <span key={idx} className={shenShaClass(ss)}>{ss}</span>)
                : <span className="shensha-empty">-</span>
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 时间维度文本行（大运/流年/流月/流日/流时，左标签 + 右文本描述）──
function BaziDynamicTable({ columns }: { columns: BaziColumn[] }) {
  const zangGanText = (col: BaziColumn) =>
    (col.pillar.zangGan || []).length > 0 ? col.pillar.zangGan.join('') : '-'
  const fuXingText = (col: BaziColumn) =>
    (col.pillar.fuXing || []).length > 0 ? col.pillar.fuXing.join('、') : '-'
  const shenShaText = (col: BaziColumn) =>
    col.shenSha.length > 0 ? col.shenSha.join('、') : '无'

  return (
    <div className="bazi-dynamic-list">
      {columns.map((col) => (
        <div key={col.key} className="bazi-dynamic-item">
          <div className={`bazi-dynamic-item-label dimension-${col.dimension}`}>
            {col.label}
          </div>
          <div className="bazi-dynamic-item-desc">
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">主星</span>
              <span className="bazi-zhuxing-item">{col.pillar.zhuXing || '-'}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">天干</span>
              <span className="bazi-dyn-char" style={{ color: WU_XING_COLOR[GAN_WX[col.pillar.gan]] || '#999' }}>{col.pillar.gan}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">地支</span>
              <span className="bazi-dyn-char" style={{ color: WU_XING_COLOR[ZHI_WX[col.pillar.zhi]] || '#999' }}>{col.pillar.zhi}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">藏干</span>
              <span className="bazi-dyn-plain">{zangGanText(col)}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">副星</span>
              <span className="bazi-dyn-plain">{fuXingText(col)}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">星运</span>
              <span className="bazi-xingyun">{col.pillar.xingYun || '-'}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">自坐</span>
              <span className="bazi-zizuo">{col.pillar.zizuo || '-'}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">空亡</span>
              <span className="bazi-kongwang">{(col.pillar.kongWang || []).join('') || '-'}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">纳音</span>
              <span className="bazi-nayin">{col.pillar.naYin || '-'}</span>
            </span>
            <span className="bazi-dyn-seg">
              <span className="bazi-dyn-seg-k">神煞</span>
              <span className="bazi-dyn-plain">{shenShaText(col)}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 神煞吉凶分类 ──
const SHENSHA_JI = new Set([
  '天乙贵人', '太极贵人', '天德贵人', '月德贵人', '文昌贵人',
  '禄神', '金舆', '福星贵人', '将星', '红鸾', '天喜', '学堂',
  '天德合', '月德合', '天厨贵人', '德秀贵人', '国印贵人', '天赦',
  '天医', '六合', '三合',
])
const SHENSHA_XIONG = new Set([
  '羊刃', '桃花', '勾煞', '绞煞', '劫煞', '灾煞', '亡神',
  '孤辰', '寡宿', '天罗', '地网', '红艳煞', '披麻', '丧门',
  '破碎', '金刚', '魁罡', '十恶大败', '四废', '十灵日', '九丑日',
  '童子煞', '咸池', '空亡',
])
// 驿马、华盖等为中性，不分类则用默认样式

function shenShaClass(name: string): string {
  if (SHENSHA_JI.has(name)) return 'shensha-tag ji'
  if (SHENSHA_XIONG.has(name)) return 'shensha-tag xiong'
  return 'shensha-tag'
}

interface BaziResultProps {
  result: BaziResult
  onBack: () => void
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  onRetrySave?: () => void
  /** 容器宽度（px），用于自适应缩放 */
  containerWidth: number
  /** 选中状态变化回调（用于上报到大模型上下文） */
  onSelectionChange?: (selection: {
    daYun: DaYun | null
    liuNian: LiuNian | null
    liuYue: LiuYue | null
    liuRi: LiuRi | null
    liuShi: LiuShi | null
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

interface BaziColumn {
  key: string
  label: string
  pillar: PillarInfo
  shenSha: string[]
  isDynamic: boolean
  dimension?: 'dayun' | 'liunian' | 'liuyue' | 'liuri' | 'liushi'
}

export default function BaziResultView({ result, onBack, saveStatus, onRetrySave, containerWidth: _containerWidth, onSelectionChange, onToggleCollapse, chartCollapsed, collapseNonce, supplementalInfo, onSupplementalChange }: BaziResultProps) {
  const [cardExpanded, setCardExpanded] = useState(true)

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
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showSupplementalModal, setShowSupplementalModal] = useState(false)

  const [selectedDaYun, setSelectedDaYun] = useState<number | null>(null)

  const [selectedLiuNian, setSelectedLiuNian] = useState<number | null>(null)
  const [selectedLiuYue, setSelectedLiuYue] = useState<number | null>(null)
  const [selectedLiuRi, setSelectedLiuRi] = useState<number | null>(null)
  const [selectedLiuShi, setSelectedLiuShi] = useState<number | null>(null)

  const displayedLiuNianList = useMemo(() => {
    if (selectedDaYun !== null) {
      const daYun = result.daYunList?.[selectedDaYun]
      if (!daYun) return result.liuNianList || []
      return getLiuNianList(daYun.startYear, result.dayPillar.gan)
    }
    const currentYear = new Date().getFullYear()
    return getLiuNianList(currentYear - 5, result.dayPillar.gan)
  }, [selectedDaYun, result.daYunList, result.liuNianList, result.dayPillar.gan])

  const displayedLiuYueList = useMemo<LiuYue[]>(() => {
    if (selectedLiuNian === null) {
      // 始终显示1-12月列表，未选择流年时为禁用占位
      return Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        gan: '',
        zhi: '',
        naYin: '',
        wuXing: '',
        zhuXing: '',
        fuXing: [],
      }))
    }
    return getLiuYueList(selectedLiuNian, result.dayPillar.gan)
  }, [selectedLiuNian, result.dayPillar.gan])

  const displayedLiuRiList = useMemo<LiuRi[]>(() => {
    if (selectedLiuNian === null || selectedLiuYue === null) return []
    return getLiuRiList(selectedLiuNian, selectedLiuYue, result.dayPillar.gan)
  }, [selectedLiuNian, selectedLiuYue, result.dayPillar.gan])

  const displayedLiuShiList = useMemo<LiuShi[]>(() => {
    if (selectedLiuNian === null || selectedLiuYue === null || selectedLiuRi === null) return []
    return getLiuShiList(selectedLiuNian, selectedLiuYue, selectedLiuRi, result.dayPillar.gan)
  }, [selectedLiuNian, selectedLiuYue, selectedLiuRi, result.dayPillar.gan])

  // 选中状态变化时，上报给父组件（用于注入大模型上下文）
  useEffect(() => {
    if (!onSelectionChange) return
    const daYun = selectedDaYun !== null ? (result.daYunList?.[selectedDaYun] ?? null) : null
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
      ? (displayedLiuShiList.find(item => item.hourIndex === selectedLiuShi) ?? null)
      : null
    onSelectionChange({ daYun, liuNian, liuYue, liuRi, liuShi })
  }, [
    onSelectionChange, selectedDaYun, selectedLiuNian, selectedLiuYue, selectedLiuRi, selectedLiuShi,
    displayedLiuNianList, displayedLiuYueList, displayedLiuRiList, displayedLiuShiList, result.daYunList,
  ])

  const natalContext = useMemo<NatalContext>(() => ({
    dayGan: result.dayPillar.gan,
    yearGan: result.yearPillar.gan,
    dayZhi: result.dayPillar.zhi,
    yearZhi: result.yearPillar.zhi,
    monthZhi: result.monthPillar.zhi,
    monthGan: result.monthPillar.gan,
    lunarMonthZhi: result.lunarMonthZhi,
  }), [result.dayPillar, result.yearPillar, result.monthPillar, result.lunarMonthZhi])

  // 日主强弱 & 格局计算
  const strengthResult = useMemo(() => {
    return calcDayMasterStrength(
      result.dayPillar.gan,
      result.monthPillar.zhi,
      result.yearPillar,
      result.monthPillar,
      result.hourPillar,
    )
  }, [result.dayPillar, result.monthPillar, result.yearPillar, result.hourPillar])

  const patternName = useMemo<string>(() => {
    return calcPattern(result.dayPillar.gan, result.monthPillar.zhi)
  }, [result.dayPillar, result.monthPillar])

  const columns = useMemo<BaziColumn[]>(() => {
    const cols: BaziColumn[] = []
    const dayGan = result.dayPillar.gan

    if (selectedLiuShi !== null) {
      const ls = displayedLiuShiList.find(item => item.hourIndex === selectedLiuShi)
      if (ls) {
        cols.push({
          key: 'liushi',
          label: '流时',
          pillar: buildPillarInfo({ gan: ls.gan, zhi: ls.zhi }, dayGan),
          shenSha: getPillarShenSha(ls.gan, ls.zhi, natalContext),
          isDynamic: true,
          dimension: 'liushi',
        })
      }
    }
    if (selectedLiuRi !== null) {
      const lr = displayedLiuRiList.find(item => item.day === selectedLiuRi)
      if (lr) {
        cols.push({
          key: 'liuri',
          label: '流日',
          pillar: buildPillarInfo({ gan: lr.gan, zhi: lr.zhi }, dayGan),
          shenSha: getPillarShenSha(lr.gan, lr.zhi, natalContext),
          isDynamic: true,
          dimension: 'liuri',
        })
      }
    }
    if (selectedLiuYue !== null) {
      const ly = displayedLiuYueList.find(item => item.month === selectedLiuYue)
      if (ly) {
        cols.push({
          key: 'liuyue',
          label: '流月',
          pillar: buildPillarInfo({ gan: ly.gan, zhi: ly.zhi }, dayGan),
          shenSha: getPillarShenSha(ly.gan, ly.zhi, natalContext),
          isDynamic: true,
          dimension: 'liuyue',
        })
      }
    }
    if (selectedLiuNian !== null) {
      const ln = displayedLiuNianList.find(item => item.year === selectedLiuNian)
      if (ln) {
        cols.push({
          key: 'liunian',
          label: '流年',
          pillar: buildPillarInfo({ gan: ln.gan, zhi: ln.zhi }, dayGan),
          shenSha: getPillarShenSha(ln.gan, ln.zhi, natalContext),
          isDynamic: true,
          dimension: 'liunian',
        })
      }
    }
    if (selectedDaYun !== null) {
      const dy = result.daYunList?.[selectedDaYun]
      if (dy) {
        cols.push({
          key: 'dayun',
          label: '大运',
          pillar: buildPillarInfo({ gan: dy.gan, zhi: dy.zhi }, dayGan),
          shenSha: getPillarShenSha(dy.gan, dy.zhi, natalContext),
          isDynamic: true,
          dimension: 'dayun',
        })
      }
    }

    cols.push(
      { key: 'year', label: '年柱', pillar: result.yearPillar, shenSha: result.shenSha['年柱'] || [], isDynamic: false },
      { key: 'month', label: '月柱', pillar: result.monthPillar, shenSha: result.shenSha['月柱'] || [], isDynamic: false },
      { key: 'day', label: '日柱', pillar: result.dayPillar, shenSha: result.shenSha['日柱'] || [], isDynamic: false },
      { key: 'hour', label: '时柱', pillar: result.hourPillar, shenSha: result.shenSha['时柱'] || [], isDynamic: false },
    )

    return cols
  }, [selectedDaYun, selectedLiuNian, selectedLiuYue, selectedLiuRi, selectedLiuShi,
      displayedLiuShiList, displayedLiuRiList, displayedLiuYueList, displayedLiuNianList,
      result, natalContext])

  const handleDaYunClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedDaYun === index) {
      setSelectedDaYun(null)
      setSelectedLiuNian(null)
      setSelectedLiuYue(null)
      setSelectedLiuRi(null)
      setSelectedLiuShi(null)
    } else {
      setSelectedDaYun(index)
      setSelectedLiuNian(null)
      setSelectedLiuYue(null)
      setSelectedLiuRi(null)
      setSelectedLiuShi(null)
    }
  }

  const handleLiuNianClick = (year: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuNian === year) {
      setSelectedLiuNian(null)
      setSelectedLiuYue(null)
      setSelectedLiuRi(null)
      setSelectedLiuShi(null)
      return
    }
    setSelectedLiuNian(year)
    if (selectedDaYun === null) {
      const daYunIndex = (result.daYunList || []).findIndex(dy =>
        year >= dy.startYear && year <= dy.endYear
      )
      if (daYunIndex >= 0) setSelectedDaYun(daYunIndex)
    }
    setSelectedLiuYue(null)
    setSelectedLiuRi(null)
    setSelectedLiuShi(null)
  }

  const handleLiuYueClick = (month: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuYue === month) {
      setSelectedLiuYue(null)
      setSelectedLiuRi(null)
      setSelectedLiuShi(null)
      return
    }
    setSelectedLiuYue(month)
    setSelectedLiuRi(null)
    setSelectedLiuShi(null)
  }

  const handleLiuRiClick = (day: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuRi === day) {
      setSelectedLiuRi(null)
      setSelectedLiuShi(null)
      return
    }
    setSelectedLiuRi(day)
    setSelectedLiuShi(null)
  }

  const handleLiuShiClick = (hourIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectedLiuShi === hourIndex) {
      setSelectedLiuShi(null)
      return
    }
    setSelectedLiuShi(hourIndex)
  }

  // ── 序列化排盘数据为上下文（用于解盘报告）──
  const baziContextData = useMemo(() => {
    const lines: string[] = []

    // ── 用户选中的运限焦点（JSON 与文本共用，确保报告分析与页面选中一致）──
    const daYun = selectedDaYun !== null ? (result.daYunList?.[selectedDaYun] ?? null) : null
    const liuNian = selectedLiuNian !== null
      ? (displayedLiuNianList.find(item => item.year === selectedLiuNian) ?? null) : null
    const liuYue = selectedLiuYue !== null
      ? (displayedLiuYueList.find(item => item.month === selectedLiuYue) ?? null) : null
    const liuRi = selectedLiuRi !== null
      ? (displayedLiuRiList.find(item => item.day === selectedLiuRi) ?? null) : null
    const liuShi = selectedLiuShi !== null
      ? (displayedLiuShiList.find(item => item.hourIndex === selectedLiuShi) ?? null) : null
    const hasFocus = !!(daYun || liuNian || liuYue || liuRi || liuShi)

    // ── JSON 结构化数据（优先分析源，提升解盘准确性）──
    lines.push('## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）')
    lines.push('')
    lines.push('```json')
    lines.push(serializeBaziJson(result, {
      strengthLevel: strengthResult.level,
      strengthScore: strengthResult.score,
      strengthDetail: strengthResult.detail,
      patternName,
    }, hasFocus ? { daYun, liuNian, liuYue, liuRi, liuShi } : undefined))
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

    lines.push('【八字排盘信息】')
    lines.push(`姓名：${result.name}`)
    lines.push(`性别：${result.gender === '男' ? '男（乾造）' : '女（坤造）'}`)
    lines.push(`出生日期：公历 ${result.solarDate}`)
    if (result.trueSolarTimeStr && result.trueSolarTimeStr !== '--') {
      lines.push(`真太阳时：${result.trueSolarTimeStr}`)
    }
    if (result.birthplace) lines.push(`出生地：${result.birthplace}`)
    lines.push('')

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
      if (p.kongWang && p.kongWang.length > 0) lines.push(`    空亡：${p.kongWang.join('、')}`)
    })
    lines.push('')

    lines.push('【日主与格局】')
    lines.push(`日主：${result.dayPillar.gan}（${GAN_WX[result.dayPillar.gan]}行，${GAN_YIN_YANG[result.dayPillar.gan]}）`)
    lines.push(`日主强弱：${strengthResult.level}（评分 ${strengthResult.score}/100，${strengthResult.detail}）`)
    lines.push(`格局：${patternName}`)
    lines.push(`月令：${result.monthPillar.zhi}（${ZHI_WX[result.monthPillar.zhi]}行）`)
    lines.push('')

    // 五行分布
    const wxCounts: Record<string, number> = { '金': 0, '木': 0, '水': 0, '火': 0, '土': 0 }
    for (const p of pillars) {
      if (GAN_WX[p.gan]) wxCounts[GAN_WX[p.gan]]++
      if (ZHI_WX[p.zhi]) wxCounts[ZHI_WX[p.zhi]]++
      for (const cg of (p.zangGan || [])) {
        if (GAN_WX[cg]) wxCounts[GAN_WX[cg]]++
      }
    }
    lines.push('【五行分布】')
    lines.push(`  金=${wxCounts['金']}，木=${wxCounts['木']}，水=${wxCounts['水']}，火=${wxCounts['火']}，土=${wxCounts['土']}`)
    lines.push('')

    // 神煞
    lines.push('【神煞信息】')
    if (result.shenSha) {
      pillarLabels.forEach((label) => {
        const ssList = result.shenSha[label]
        lines.push(`  ${label}：${(ssList && ssList.length > 0) ? ssList.join('、') : '—'}`)
      })
    }
    lines.push('')

    // 起运与大运
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

    // 当前流年
    const nowYear = new Date().getFullYear()
    if (result.liuNianList) {
      const thisYear = result.liuNianList.find((ln) => ln.year === nowYear)
      if (thisYear) {
        lines.push(`当前流年：${nowYear}年 ${thisYear.gan}${thisYear.zhi}`)
      }
    }
    lines.push('')

    // 地支关系
    if (result.diZhiRelations && result.diZhiRelations.length > 0) {
      lines.push('【地支关系】')
      lines.push(`  ${result.diZhiRelations.join('，')}`)
      lines.push('')
    }

    // 选中焦点（daYun/liuNian 等已在 useMemo 开头计算，JSON 与文本共用）
    if (daYun || liuNian || liuYue || liuRi || liuShi) {
      lines.push('【用户选中的分析焦点——必须重点深入分析】')
      lines.push('【重要性说明】以下时间维度是用户在排盘界面主动选中的分析关注点，代表用户当前最关心的运势阶段。')
      lines.push('  请在报告中对以下选中维度进行「重点深度分析」，篇幅占比不少于整份报告的25%：')
      lines.push('  ─ 对选中的每个维度，展开至少300字以上的详细论述（含：与命局的生克冲合、吉凶判断、具体事件建议、注意事项）')
      lines.push('  ─ 若同时选中多个维度（如大运+流年+流月），需分析各维度之间的连锁互动关系')
      lines.push('  ─ 在每个对应章节的标题中使用「★」标注，明确标识为用户选中焦点')
      if (daYun) lines.push(`  ★ 大运（重点）：${daYun.startAge}-${daYun.endAge}岁（${daYun.startYear}-${daYun.endYear}年）${daYun.gan}${daYun.zhi} 主星[${daYun.zhuXing}]`)
      if (liuNian) lines.push(`  ★ 流年（重点）：${liuNian.year}年 ${liuNian.gan}${liuNian.zhi} 主星[${liuNian.zhuXing}]`)
      if (liuYue) lines.push(`  ★ 流月（重点）：${liuYue.month}月 ${liuYue.gan}${liuYue.zhi}`)
      if (liuRi) lines.push(`  ★ 流日（重点）：${liuRi.day}日 ${liuRi.gan}${liuRi.zhi}`)
      if (liuShi) lines.push(`  ★ 流时（重点）：${liuShi.zhi}时 ${liuShi.gan}${liuShi.zhi}`)
      lines.push('')
    }

    lines.push('【分析要求】')
    lines.push('请基于以上完整的八字排盘数据进行命理分析，生成一份完整的解盘报告。')
    if (daYun || liuNian || liuYue || liuRi || liuShi) {
      lines.push('对【用户选中的分析焦点】标注的时间维度进行重点、深入、详尽分析，用★在章节标题中标识。')
    }

    return lines.join('\n')
  }, [result, strengthResult, patternName, selectedDaYun, selectedLiuNian, selectedLiuYue, selectedLiuRi, selectedLiuShi,
      displayedLiuNianList, displayedLiuYueList, displayedLiuRiList, displayedLiuShiList, supplementalInfo])

  return (
    <div className="bazi-result">
      {/* 保存状态提示 */}
      {saveStatus === 'saved' && (
        <div className="bazi-save-status-badge">
          <span className="bazi-save-badge saved">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            已保存至档案库
          </span>
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="bazi-save-status-badge">
          <span className="bazi-save-badge error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            保存失败
            {onRetrySave && (
              <button type="button" className="bazi-retry-btn" onClick={onRetrySave}>重试</button>
            )}
          </span>
        </div>
      )}

      {/* 八字综合卡片 */}
      <div className="bazi-combined-card">
        <div className="bazi-card-header" onClick={() => setCardExpanded(!cardExpanded)}>
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
                {result.name}
                <button type="button" className="supplemental-info-icon" onClick={() => setShowSupplementalModal(true)} title="维护个人补充信息" aria-label="维护个人补充信息">✎</button>
                <span className="bazi-gender-tag">{result.gender === '男' ? '乾造' : '坤造'}</span>
              </h2>
              <p className="bazi-desc">
                出生日期 {result.solarDate} · 真太阳时 {result.trueSolarTimeStr}
              </p>
              <p className="bazi-pattern-desc">
                格局 <span className="bazi-pattern-value">{patternName}</span>
                · 日主 <span className={`bazi-strength-pill ${strengthResult.level === '身强' ? 'strong' : strengthResult.level === '中和' ? 'neutral' : 'weak'}`}>{strengthResult.level}</span>
                · 命宫 <span className="bazi-pattern-value">{result.mingGong}</span>
                · 身宫 <span className="bazi-pattern-value">{result.shenGong}</span>
                · 胎元 <span className="bazi-pattern-value">{result.taiYuan}</span>
              </p>
            </div>
          </div>
          <div className="bazi-card-actions" onClick={(e) => e.stopPropagation()}>
            {/* 解盘报告按钮 - 位于展开/收缩按钮左侧 */}
            <button
              type="button"
              className="bazi-toolbar-btn"
              onClick={(e) => { e.stopPropagation(); setShowReportModal(true); }}
            >
              解盘报告
            </button>
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
          </div>
        </div>

        {/* 排盘信息弹窗 */}
        {showInfoModal && (
          <BaziInfoModal
            result={result}
            selectedDaYunIdx={selectedDaYun}
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
              birthplace: result.birthplace,
              calendar_type: '公历',
              bazi_result: result as unknown as Record<string, unknown>,
              supplemental_info: supplementalInfo,
            }}
          />
        )}

        <div className={`bazi-card-content ${cardExpanded ? 'expanded' : 'collapsed'}`}>
            <div className="bazi-chart-content-wrapper">
            {/* 移动端：人名信息独立卡片（移动端 .bazi-card-title 隐藏，避免被左右按钮挤得每个字换行） */}
            <div className="bazi-mobile-name-card">
              <h2 className="bazi-name">
                {result.name}
                <button type="button" className="supplemental-info-icon" onClick={() => setShowSupplementalModal(true)} title="维护个人补充信息" aria-label="维护个人补充信息">✎</button>
                <span className="bazi-gender-tag">{result.gender === '男' ? '乾造' : '坤造'}</span>
              </h2>
              <p className="bazi-desc">
                出生日期 {result.solarDate} · 真太阳时 {result.trueSolarTimeStr}
              </p>
              <p className="bazi-pattern-desc">
                格局 <span className="bazi-pattern-value">{patternName}</span>
                · 日主 <span className={`bazi-strength-pill ${strengthResult.level === '身强' ? 'strong' : strengthResult.level === '中和' ? 'neutral' : 'weak'}`}>{strengthResult.level}</span>
                · 命宫 <span className="bazi-pattern-value">{result.mingGong}</span>
                · 身宫 <span className="bazi-pattern-value">{result.shenGong}</span>
                · 胎元 <span className="bazi-pattern-value">{result.taiYuan}</span>
              </p>
            </div>
            {/* 本命四柱（表头 + 属性行横排，与 PC 版样式统一） */}
            <div className="bazi-table-section">
              <BaziTable columns={columns.filter(c => !c.isDynamic)} strengthLevel={strengthResult.level} />
            </div>

            {/* 时间维度（大运/流年/流月/流日/流时）：转置表（表头=属性，行=维度，从上到下 大运→流时） */}
            {columns.filter(c => c.isDynamic).length > 0 && (
              <div className="bazi-table-section bazi-dynamic-table-section">
                <BaziDynamicTable columns={columns.filter(c => c.isDynamic).reverse()} />
              </div>
            )}
          <div className="bazi-time-dimensions">
            <TimeDimensionRow
              title="大运"
              disabled={false}
              items={(result.daYunList || []).slice(0, 10).map((dy: DaYun, index: number) => ({
                key: index,
                label: `${dy.startAge}-${dy.endAge}`,
                isSelected: selectedDaYun === index,
              }))}
              onSelect={handleDaYunClick}
            />

            <TimeDimensionRow
              title="流年"
              disabled={false}
              items={displayedLiuNianList.map((ln: LiuNian) => ({
                key: ln.year,
                label: `${ln.year}`,
                isSelected: selectedLiuNian === ln.year,
              }))}
              onSelect={handleLiuNianClick}
            />

            <TimeDimensionRow
              title="流月"
              disabled={selectedLiuNian === null}
              items={displayedLiuYueList.map((ly: LiuYue) => ({
                key: ly.month,
                label: `${ly.month}月`,
                isSelected: selectedLiuYue === ly.month,
              }))}
              onSelect={handleLiuYueClick}
            />

            <TimeDimensionRow
              title="流日"
              disabled={selectedLiuYue === null}
              items={displayedLiuRiList.map((lr: LiuRi) => ({
                key: lr.day,
                label: `${lr.day}`,
                isSelected: selectedLiuRi === lr.day,
              }))}
              onSelect={handleLiuRiClick}
            />

            <TimeDimensionRow
              title="流时"
              disabled={selectedLiuRi === null}
              items={displayedLiuShiList.map((ls: LiuShi) => ({
                key: ls.hourIndex,
                label: `${ls.zhi}时`,
                isSelected: selectedLiuShi === ls.hourIndex,
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
          chartType="八字"
          chartName={result.name}
          contextData={baziContextData}
          archiveData={{
            name: result.name,
            gender: result.gender,
            birth_datetime: result.solarDate,
            birthplace: result.birthplace,
            calendar_type: '公历',
            bazi_result: result as unknown as Record<string, unknown>,
            supplemental_info: supplementalInfo,
          }}
          onClose={() => setShowReportModal(false)}
        />
      )}
      {showSupplementalModal && (
        <SupplementalInfoModal
          name={result.name}
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