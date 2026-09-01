/**
 * 黄道择吉表单组件
 *
 * 增强版 HuangliPanel，支持择吉结果与报告系统对接。
 * 在原有日历展示基础上，增加：
 * - 选择日期后标记为"择吉日期"
 * - 选择活动类型后筛选吉日
 * - 将选定的日期+活动序列化为 LLM 上下文
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import ReactDOM from 'react-dom'
import { API_BASE } from '../utils/constants'
import BackButton from './BackButton'
import DivinationInfoModal from './DivinationInfoModal'
import BaziReportModal from './BaziReportModal'
import BirthInfoForm, { type BirthInfo } from './BirthInfoForm'
import ArchivePickerModal from './ArchivePickerModal'
import { getTrueSolarTime, resolveFourPillarsToSolar } from '../utils/baziCalculator'
import { formatArchiveBirth } from '../utils/formatBirth'
import { getLongitudeFromCity } from '../utils/cityLongitudeMap'
import type { ArchiveItem } from '../context/ArchiveContext'
import {
  type DayHuangli,
  type DayBrief,
  type MonthData,
  type HuangliResult,
  type PersonInfo,
  serializeHuangliContext,
  serializeHuangliJson,
  fetchDayDetail,
  fetchMonthData,
  filterAuspiciousDays,
  ACTIVITY_KEYWORDS,
  getMatchedThings,
  getDayScore,
  LEVEL_ORDER,
} from '../utils/huangliCalculator'

interface HuangliDatePickerProps {
  result: HuangliResult | null
  setResult: (r: HuangliResult | null) => void
  containerWidth: number
  onToggleCollapse?: () => void
  chartCollapsed?: boolean
  collapseNonce?: number
}

const TWO_HOUR_NAMES = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']

// ── 活动类型定义（按重要性排序） ──

interface CategoryDef {
  key: string
  label: string
  icon: string
}

/** 传统活动类型（30项，按重要性和常用度排序） */
const TRADITIONAL_CATEGORIES: CategoryDef[] = [
  { key: '婚嫁', label: '婚嫁', icon: '💒' },
  { key: '祭祀', label: '祭祀', icon: '🙏' },
  { key: '安葬', label: '安葬', icon: '🪦' },
  { key: '动土', label: '动土', icon: '🔨' },
  { key: '入宅', label: '入宅', icon: '🏠' },
  { key: '出行', label: '出行', icon: '✈️' },
  { key: '开业', label: '开业', icon: '🏪' },
  { key: '上官', label: '上官', icon: '👔' },
  { key: '祈福', label: '祈福', icon: '🕯️' },
  { key: '求嗣', label: '求嗣', icon: '👶' },
  { key: '入学', label: '入学', icon: '🎓' },
  { key: '裁衣', label: '裁衣', icon: '✂️' },
  { key: '纳采', label: '纳采', icon: '💍' },
  { key: '订盟', label: '订盟', icon: '🤝' },
  { key: '纳畜', label: '纳畜', icon: '🐂' },
  { key: '开市', label: '开市', icon: '🏬' },
  { key: '交易', label: '交易', icon: '💰' },
  { key: '立券', label: '立券', icon: '📄' },
  { key: '挂匾', label: '挂匾', icon: '🏷️' },
  { key: '拆卸', label: '拆卸', icon: '🔧' },
  { key: '修造', label: '修造', icon: '🛠️' },
  { key: '上梁', label: '上梁', icon: '🏗️' },
  { key: '安床', label: '安床', icon: '🛏' },
  { key: '安门', label: '安门', icon: '🚪' },
  { key: '作灶', label: '作灶', icon: '🍳' },
  { key: '移徙', label: '移徙', icon: '🚛' },
  { key: '安香', label: '安香', icon: '🪔' },
  { key: '沐浴', label: '沐浴', icon: '🛁' },
  { key: '剃头', label: '剃头', icon: '💇' },
  { key: '扫舍', label: '扫舍', icon: '🧹' },
]

/** 现代活动类型（30项，按重要性和常用度排序） */
const MODERN_CATEGORIES: CategoryDef[] = [
  { key: '领证', label: '领证', icon: '📜' },
  { key: '签约', label: '签约', icon: '📝' },
  { key: '求职', label: '求职', icon: '📋' },
  { key: '搬家', label: '搬家', icon: '📦' },
  { key: '买车', label: '买车', icon: '🚗' },
  { key: '提车', label: '提车', icon: '🚙' },
  { key: '装修', label: '装修', icon: '🎨' },
  { key: '谈判', label: '谈判', icon: '💬' },
  { key: '会友', label: '会友', icon: '👥' },
  { key: '求医', label: '求医', icon: '🏥' },
  { key: '栽种', label: '栽种', icon: '🌱' },
  { key: '入职', label: '入职', icon: '💼' },
  { key: '投资', label: '投资', icon: '📈' },
  { key: '购房', label: '购房', icon: '🏘️' },
  { key: '出国', label: '出国', icon: '🌍' },
  { key: '出差', label: '出差', icon: '🧳' },
  { key: '考试', label: '考试', icon: '📖' },
  { key: '面试', label: '面试', icon: '🎤' },
  { key: '答辩', label: '答辩', icon: '🗣️' },
  { key: '晋升', label: '晋升', icon: '⬆️' },
  { key: '转行', label: '转行', icon: '🔄' },
  { key: '创业', label: '创业', icon: '🚀' },
  { key: '注册', label: '注册', icon: '🏛️' },
  { key: '专利', label: '专利', icon: '🔬' },
  { key: '发布', label: '发布', icon: '📢' },
  { key: '活动', label: '活动', icon: '🎉' },
  { key: '直播', label: '直播', icon: '📡' },
  { key: '旅游', label: '旅游', icon: '🏖️' },
  { key: '健身', label: '健身', icon: '💪' },
  { key: '美容', label: '美容', icon: '💄' },
]

/** 所有活动类型图标映射（供结果视图使用） */
const ALL_CATEGORY_ICONS: Record<string, string> = {}
for (const c of [...TRADITIONAL_CATEGORIES, ...MODERN_CATEGORIES]) {
  ALL_CATEGORY_ICONS[c.key] = c.icon
}

export default function HuangliDatePicker({
  result,
  setResult,
  containerWidth,
  onToggleCollapse,
  chartCollapsed,
  collapseNonce,
}: HuangliDatePickerProps) {
  const todayRef = useRef(new Date())
  const today = todayRef.current
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1)
  const [monthData, setMonthData] = useState<MonthData | null>(null)
  const [selectedDay, setSelectedDay] = useState<DayHuangli | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [highlightedDates, setHighlightedDates] = useState<Set<string>>(new Set())
  // 人员信息状态（持久化到 sessionStorage，key: huangli_person_info）
  const [personInfo, setPersonInfo] = useState<PersonInfo | null>(() => {
    try {
      const saved = sessionStorage.getItem('huangli_person_info')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [showPersonModal, setShowPersonModal] = useState(false)
  // 档案选择器弹窗状态
  const [showArchivePicker, setShowArchivePicker] = useState(false)
  // 从档案库选中的人员（独立于 BirthInfoForm）
  const [selectedArchivePerson, setSelectedArchivePerson] = useState<ArchiveItem | null>(null)
  // 切换月份时记录上次选中的日期号，用于新月份默认选中
  const pendingDayRef = useRef<number | null>(null)

  // ── 为选中档案人员计算真太阳时 ──
  const archivePersonTrueSolarTime = useMemo(() => {
    if (!selectedArchivePerson) return null
    const { birth_datetime, birthplace } = selectedArchivePerson
    if (!birth_datetime) return null
    const lon = birthplace ? (getLongitudeFromCity(birthplace) || 120) : 120

    let y: number, m: number, d: number, h: number, min: number

    if (birth_datetime.includes('四柱-') || birth_datetime.startsWith('四柱-')) {
      // 四柱档案：从 bazi_result 元数据取干支反推公历日期
      const meta = (selectedArchivePerson.bazi_result as { __birth_meta__?: { pillars?: { yearGan: string; yearZhi: string; monthGan: string; monthZhi: string; dayGan: string; dayZhi: string; hourGan: string; hourZhi: string } } } | null)?.__birth_meta__
      const p = meta?.pillars
      if (!p) return null
      const matches = resolveFourPillarsToSolar(
        p.yearGan, p.yearZhi, p.monthGan, p.monthZhi, p.dayGan, p.dayZhi, p.hourGan, p.hourZhi,
      )
      if (matches.length === 0) return null
      const nowYear = new Date().getFullYear()
      let chosen = matches[0]
      for (const mm of matches) {
        if (mm.year <= nowYear && mm.year > chosen.year) chosen = mm
      }
      y = chosen.year; m = chosen.month; d = chosen.day; h = chosen.hour; min = chosen.minute
    } else {
      const [datePart, timePart] = birth_datetime.split('T')
      if (!datePart || !timePart) return null
      const [yy, mm, dd] = datePart.split('-').map(Number)
      const [hh, mi] = timePart.split(':').map(Number)
      if (isNaN(yy) || isNaN(mm) || isNaN(dd) || isNaN(hh)) return null
      y = yy; m = mm; d = dd; h = hh; min = isNaN(mi) ? 0 : mi
    }

    const tsHour = getTrueSolarTime(y, m, d, h, min, lon)
    const tsDisplayHour = Math.floor(tsHour)
    const tsDisplayMinute = Math.round((tsHour - tsDisplayHour) * 60)
    const tsDate = new Date(y, m - 1, d, tsDisplayHour, tsDisplayMinute, 0)
    const tsY = tsDate.getFullYear()
    const tsM = tsDate.getMonth() + 1
    const tsD = tsDate.getDate()
    const tsH = tsDate.getHours()
    const tsMin = tsDate.getMinutes()
    return `${tsY}-${String(tsM).padStart(2, '0')}-${String(tsD).padStart(2, '0')} ${String(tsH).padStart(2, '0')}:${String(tsMin).padStart(2, '0')}`
  }, [selectedArchivePerson])

  // ── 从 sessionStorage 恢复已选人员 ──
  useEffect(() => {
    if (!selectedArchivePerson && personInfo) {
      const synthetic: ArchiveItem = {
        id: 0,
        user_id: 0,
        name: personInfo.name,
        gender: personInfo.gender,
        birth_datetime: personInfo.birthDateTime,
        birthplace: personInfo.birthplace || null,
        calendar_type: '公历',
        group_name: null,
        bazi_result: null,
        created_at: '',
        updated_at: '',
      }
      setSelectedArchivePerson(synthetic)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 注意：此处命名为 fetchDayDetailByDateStr 以避免遮蔽从 huangliCalculator 导入的 fetchDayDetail(year,month,day)
  const fetchDayDetailByDateStr = async (dateStr: string) => {
    setDetailLoading(true)
    setError('')
    try {
      const [y, m, d] = dateStr.split('-').map(Number)
      const res = await fetch(`${API_BASE}/huangli/day?year=${y}&month=${m}&day=${d}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.success) setSelectedDay(data.data)
    } catch (err) {
      console.warn('[HuangliDatePicker] 加载日详情失败:', err)
      setError('加载日详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const fetchMonth = async (year: number, month: number) => {
    setLoading(true)
    setSelectedDay(null)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/huangli/month?year=${year}&month=${month}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.success) {
        setMonthData(data.data)
        const now = new Date()
        if (year === now.getFullYear() && month === now.getMonth() + 1) {
          // 当前年月：默认选中今天
          const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          fetchDayDetailByDateStr(todayStr)
          pendingDayRef.current = null
        } else if (pendingDayRef.current !== null) {
          // 切换月份：沿用上次选中的日期号（若超出新月份天数则回落到最后一天）
          const daysInMonth = new Date(year, month, 0).getDate()
          const targetDay = Math.min(pendingDayRef.current, daysInMonth)
          const targetStr = `${year}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
          fetchDayDetailByDateStr(targetStr)
          pendingDayRef.current = null
        }
      }
    } catch (err) {
      console.warn('[HuangliDatePicker] 加载黄历数据失败:', err)
      setError('加载黄历数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMonth(viewYear, viewMonth) }, [viewYear, viewMonth])

  const calendarGrid = useMemo(() => {
    if (!monthData) return []
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay()
    const grid: (DayBrief | null)[] = []
    for (let i = 0; i < firstDay; i++) grid.push(null)
    monthData.days.forEach((d) => grid.push(d))
    while (grid.length % 7 !== 0) grid.push(null)
    return grid
  }, [monthData, viewYear, viewMonth])



  // 结果展示（必须在所有 hooks 之后）
  if (result) {
    return (
      <HuangliResultView
        result={result}
        onBack={() => setResult(null)}
        containerWidth={containerWidth}
        onToggleCollapse={onToggleCollapse}
        chartCollapsed={chartCollapsed}
        collapseNonce={collapseNonce}
      />
    )
  }

  const handleDayClick = (brief: DayBrief) => {
    fetchDayDetailByDateStr(brief.date)
  }

  const handleFilter = async (cat: string) => {
    if (activeCategory === cat) {
      setActiveCategory('')
      setHighlightedDates(new Set())
      return
    }
    setActiveCategory(cat)
    // 立即清除当前选中，避免在异步加载第一吉日详情期间当前日期保持选中
    setSelectedDay(null)
    try {
      const res = await fetch(
        `${API_BASE}/huangli/filter?year=${viewYear}&month=${viewMonth}&activity=${encodeURIComponent(cat)}`,
      )
      if (!res.ok) {
        console.warn(`[HuangliDatePicker] 筛选吉日失败: HTTP ${res.status}`)
        return
      }
      const data = await res.json()
      if (data.success) {
        const matchedDates: string[] = data.data.matched_dates
        setHighlightedDates(new Set(matchedDates))
        // 筛选吉日后，默认选中排名第一的吉日（按吉凶等级 吉>平>凶 → 日期 排序）
        if (matchedDates.length > 0 && monthData) {
          const briefMap: Record<string, DayBrief> = {}
          monthData.days.forEach(d => { briefMap[d.date] = d })
          const sorted = [...matchedDates].sort((a, b) => {
            const la = LEVEL_ORDER[briefMap[a]?.level_label ?? ''] ?? 3
            const lb = LEVEL_ORDER[briefMap[b]?.level_label ?? ''] ?? 3
            if (la !== lb) return la - lb
            return a.localeCompare(b)
          })
          fetchDayDetailByDateStr(sorted[0])
        }
      }
    } catch (err) {
      console.warn('[HuangliDatePicker] 筛选吉日异常:', err)
    }
  }

  /** 确认选择此日进行择吉 */
  const handleConfirmSelection = () => {
    if (!selectedDay || !activeCategory) return
    proceedToResult(personInfo)
  }

  /** 提交人员信息后进入结果页 */
  const handlePersonSubmit = (info: BirthInfo) => {
    const pi: PersonInfo = {
      name: info.name,
      gender: info.gender,
      birthDateTime: info.birthDateTime,
      birthplace: info.birthplace,
      longitude: info.longitude,
    }
    setPersonInfo(pi)
    // 同步设置 selectedArchivePerson 以显示人员卡片
    setSelectedArchivePerson({
      id: 0, user_id: 0,
      name: info.name,
      gender: info.gender,
      birth_datetime: info.birthDateTime,
      birthplace: info.birthplace || null,
      calendar_type: info.calendarType,
      group_name: info.selectedGroup,
      bazi_result: null,
      created_at: '', updated_at: '',
    })
    try { sessionStorage.setItem('huangli_person_info', JSON.stringify(pi)) } catch { /* ignore */ }
    setShowPersonModal(false)
    proceedToResult(pi)
  }

  /** 从档案库选择人员 */
  const handleArchiveSelect = (archive: ArchiveItem) => {
    setSelectedArchivePerson(archive)
    const pi: PersonInfo = {
      name: archive.name,
      gender: (archive.gender as '男' | '女') || '男',
      birthDateTime: archive.birth_datetime || '',
      birthplace: archive.birthplace || '',
      longitude: archive.birthplace ? (getLongitudeFromCity(archive.birthplace) || undefined) : undefined,
    }
    setPersonInfo(pi)
    try { sessionStorage.setItem('huangli_person_info', JSON.stringify(pi)) } catch { /* ignore */ }
    setShowArchivePicker(false)
  }

  /** 清除已选人员 */
  const handleClearPerson = () => {
    setSelectedArchivePerson(null)
    setPersonInfo(null)
    try { sessionStorage.removeItem('huangli_person_info') } catch { /* ignore */ }
  }

  /** 通用：携带人员信息跳转结果页（pi 为 null 时不含人员信息） */
  const proceedToResult = (pi: PersonInfo | null) => {
    if (!selectedDay || !activeCategory) return
    const now = new Date()
    const queryTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    setResult({
      selectedDate: selectedDay.date,
      activity: activeCategory,
      dayDetail: selectedDay,
      auspiciousDays: Array.from(highlightedDates),
      queryTime,
      personInfo: pi ?? undefined,
    })
  }

  const prevMonth = () => {
    if (selectedDay) pendingDayRef.current = new Date(selectedDay.date).getDate()
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12) }
    else { setViewMonth(viewMonth - 1) }
  }
  const nextMonth = () => {
    if (selectedDay) pendingDayRef.current = new Date(selectedDay.date).getDate()
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1) }
    else { setViewMonth(viewMonth + 1) }
  }

  return (
    <div className="feature-bazi">
      <div className="bazi-form-card">
        <div className="bazi-form-header">
          <h2 className="bazi-form-title">黄道择吉</h2>
        </div>

        {/* 月份导航 */}
        <div className="huangli-header">
          <div className="huangli-nav">
            <button type="button" className="huangli-nav-btn" onClick={prevMonth}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="huangli-month-title">
              <span className="huangli-month-year">{viewYear}年{viewMonth}月</span>
              {monthData && <span className="huangli-month-lunar">{monthData.lunar_month_info}</span>}
            </div>
            <button type="button" className="huangli-nav-btn" onClick={nextMonth}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* 筛选吉日下拉框 */}
          <div className="huangli-filter-select-wrapper">
            <label className="huangli-filter-select-label">筛选吉日：</label>
            <select
              className="huangli-filter-select"
              value={activeCategory}
              onChange={(e) => handleFilter(e.target.value)}
            >
              <option value="">全部日期</option>
              <optgroup label="传统">
                {TRADITIONAL_CATEGORIES.map(cat => (
                  <option key={cat.key} value={cat.key}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="现代">
                {MODERN_CATEGORIES.map(cat => (
                  <option key={cat.key} value={cat.key}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="button"
              className="huangli-filter-confirm-btn"
              onClick={handleConfirmSelection}
              disabled={!activeCategory || !selectedDay}
            >
              择吉分析
            </button>
          </div>
        </div>

        {/* ── 人员选择区域（新增）── */}
        <div className="huangli-person-section">
          {!selectedArchivePerson ? (
            <div className="huangli-person-picker">
              <button
                type="button"
                className="huangli-person-archive-btn"
                onClick={() => setShowArchivePicker(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                  <path d="M9 18a2 2 0 0 1-2-2V2h10l4 4v10a2 2 0 0 1-2 2h-3" />
                  <path d="M3 7v14a2 2 0 0 0 2 2h12" />
                  <path d="M14 22v-4a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4" />
                </svg>
                <span>从档案库选择人员</span>
              </button>
              <button
                type="button"
                className="huangli-person-manual-btn"
                onClick={() => setShowPersonModal(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                <span>手动输入信息</span>
              </button>
            </div>
          ) : (
            <div className="huangli-person-selected">
              <div className="huangli-person-selected-left">
                <div className="huangli-person-selected-info">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                    <path d="M9 18a2 2 0 0 1-2-2V2h10l4 4v10a2 2 0 0 1-2 2h-3" />
                    <path d="M3 7v14a2 2 0 0 0 2 2h12" />
                    <path d="M14 22v-4a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4" />
                  </svg>
                  <span className="huangli-person-selected-name">
                    {selectedArchivePerson.name}
                  </span>
                  <span className="huangli-person-selected-gender">
                    {selectedArchivePerson.gender}
                  </span>
                </div>
                <div className="huangli-person-selected-meta">
                  <span>出生 {formatArchiveBirth(selectedArchivePerson.birth_datetime, selectedArchivePerson.calendar_type, selectedArchivePerson.bazi_result)}</span>
                  {selectedArchivePerson.birthplace && (
                    <span> · {selectedArchivePerson.birthplace}</span>
                  )}
                </div>
              </div>
              {archivePersonTrueSolarTime && (
                <div className="huangli-person-ts-info">
                  <span className="huangli-person-ts-label">真太阳时</span>
                  <span className="huangli-person-ts-value">{archivePersonTrueSolarTime}</span>
                </div>
              )}
              <button
                type="button"
                className="huangli-person-deselect-btn"
                onClick={handleClearPerson}
                title="取消选择"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>取消</span>
              </button>
            </div>
          )}
        </div>

        {loading && <div className="huangli-loading">加载黄历数据中...</div>}
        {error && !loading && <div className="huangli-error"><span>{error}</span></div>}

        {/* 人员信息弹窗（与八字表单一致） */}
        {showPersonModal && ReactDOM.createPortal(
          <div className="report-modal-overlay" onClick={() => setShowPersonModal(false)}>
            <div className="report-modal bazi-person-info-modal" onClick={(e) => e.stopPropagation()}>
              <button className="report-close-btn" onClick={() => setShowPersonModal(false)} aria-label="关闭">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className="bazi-form-card">
              <BirthInfoForm
                title="输入人员信息"
                calendarTypes={['公历', '农历']}
                showArchive={true}
                showBirthplace={true}
                submitLabel="确认"
                onSubmit={handlePersonSubmit}
                featureId="huangli"
              />
              </div>
            </div>
          </div>,
          document.body,
        )}

        {/* 档案选择弹窗 */}
        <ArchivePickerModal
          isOpen={showArchivePicker}
          onClose={() => setShowArchivePicker(false)}
          onSelectArchive={handleArchiveSelect}
        />

        {/* 日历网格 */}
        {!loading && monthData && (
          <>
            <div className="huangli-calendar">
              <div className="huangli-weekdays">
                {['日', '一', '二', '三', '四', '五', '六'].map(w => (
                  <div key={w} className="huangli-weekday">{w}</div>
                ))}
              </div>
              <div className="huangli-grid">
                {calendarGrid.map((day, idx) => {
                  const isHighlighted = day && highlightedDates.has(day.date)
                  const isDimmed = day && activeCategory && !isHighlighted
                  return (
                    <div
                      key={idx}
                      className={`huangli-cell${day ? ' has-data' : ''}${day && selectedDay?.date === day.date ? ' active' : ''}${day ? ` level-${day.level_label}` : ''}${isHighlighted ? ' highlighted' : ''}${isDimmed ? ' dimmed' : ''}`}
                      onClick={() => day && !isDimmed && handleDayClick(day)}
                      role={day && !isDimmed ? 'button' : undefined}
                      tabIndex={day && !isDimmed ? 0 : undefined}
                    >
                      {day && (
                        <>
                          <span className="huangli-cell-date">{new Date(day.date).getDate()}</span>
                          <span className="huangli-cell-lunar">{day.lunar_day}</span>
                          <span className="huangli-cell-badge">
                            {isHighlighted ? activeCategory : (day.solar_term !== '无' ? day.solar_term : day.level_label)}
                          </span>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="huangli-legend">
              <span className="huangli-legend-item level-吉"><i /> 吉日</span>
              <span className="huangli-legend-item level-平"><i /> 平日</span>
              <span className="huangli-legend-item level-凶"><i /> 凶日</span>
              {activeCategory && <span className="huangli-legend-item highlighted"><i /> 宜{activeCategory}</span>}
            </div>
          </>
        )}

        {/* 日期详情 */}
        {detailLoading && <div className="huangli-detail-loading">加载详情中...</div>}
        {!detailLoading && selectedDay && (
          <div className="huangli-detail">
            <div className="huangli-detail-top">
              <div className="huangli-detail-date">
                <span className="huangli-detail-solar">{selectedDay.date} {selectedDay.weekday}</span>
                <span className="huangli-detail-lunar">
                  {selectedDay.lunar_year} {selectedDay.lunar_month}{selectedDay.lunar_day}
                </span>
              </div>
              <div className={`huangli-detail-level-badge level-${selectedDay.level_label}`}>
                {selectedDay.level_label}
              </div>
            </div>

            <div className="huangli-detail-ganzhi">
              <div className="huangli-ganzhi-row">
                <span className="huangli-ganzhi-label">干支</span>
                <span className="huangli-ganzhi-value">
                  {selectedDay.year_ganzhi}年 {selectedDay.month_ganzhi}月 {selectedDay.day_ganzhi}日
                </span>
              </div>
              <div className="huangli-ganzhi-row">
                <span className="huangli-ganzhi-label">生肖</span>
                <span className="huangli-ganzhi-value">{selectedDay.zodiac} · {selectedDay.clash}</span>
              </div>
              <div className="huangli-ganzhi-row">
                <span className="huangli-ganzhi-label">建除</span>
                <span className="huangli-ganzhi-value">{selectedDay.day_officer}日 · {selectedDay.day_god}</span>
              </div>
            </div>

            <div className="huangli-detail-yiji">
              <div className="huangli-yi-section">
                <h4 className="huangli-yi-title">宜</h4>
                <div className="huangli-tag-list">
                  {selectedDay.good_things.length === 0
                    ? <span className="huangli-no-data">—</span>
                    : selectedDay.good_things.map((t, i) => <span key={i} className="huangli-tag yi">{t}</span>)
                  }
                </div>
              </div>
              <div className="huangli-ji-section">
                <h4 className="huangli-ji-title">忌</h4>
                <div className="huangli-tag-list">
                  {selectedDay.bad_things.length === 0
                    ? <span className="huangli-no-data">—</span>
                    : selectedDay.bad_things.map((t, i) => <span key={i} className="huangli-tag ji">{t}</span>)
                  }
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 结果展示组件 ──

function HuangliResultView({
  result,
  onBack,
  containerWidth,
  onToggleCollapse,
  chartCollapsed,
  collapseNonce,
}: {
  result: HuangliResult
  onBack: () => void
  containerWidth: number
  onToggleCollapse?: () => void
  chartCollapsed?: boolean
  collapseNonce?: number
}) {
  // 卡片展开/收缩状态
  const [cardExpanded, setCardExpanded] = useState(true)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  // 序列化排盘数据为上下文（用于解盘报告和排盘信息弹窗）
  const contextData = useMemo(() => {
    const text = serializeHuangliContext(result)
    const json = serializeHuangliJson(result)
    return `## 排盘 JSON 数据（结构化数据，优先基于此数据进行精确分析）\n\n\`\`\`json\n${json}\n\`\`\`\n\n---\n\n${text}`
  }, [result])

  // 纯 JSON 格式排盘数据（用于排盘信息弹窗，与注入 LLM 的数据一致）
  const jsonData = useMemo(() => serializeHuangliJson(result), [result])

  // 响应外部收缩控制
  useEffect(() => {
    if (chartCollapsed !== undefined) {
      setCardExpanded(!chartCollapsed)
    }
  }, [chartCollapsed])

  useEffect(() => {
    if (collapseNonce !== undefined && collapseNonce > 0) {
      setCardExpanded(false)
    }
  }, [collapseNonce])

  // 从选中日期提取初始年月
  const [initY, initM] = result.selectedDate.split('-').map(Number)
  const [viewYear, setViewYear] = useState(initY)
  const [viewMonth, setViewMonth] = useState(initM)

  // 吉日列表（可随月份切换更新）
  const [auspiciousDays, setAuspiciousDays] = useState<string[]>(result.auspiciousDays)
  const [monthLoading, setMonthLoading] = useState(false)

  // 当前选中的吉日
  const [currentDate, setCurrentDate] = useState(result.selectedDate)
  // 已加载的日详情缓存（懒加载，仅含已查看的日期）
  const [dayDetailsMap, setDayDetailsMap] = useState<Record<string, DayHuangli>>({
    [result.selectedDate]: result.dayDetail,
  })
  // 月简要数据缓存：覆盖全月的 level_label，用于吉日排序（避免依赖稀疏的 dayDetailsMap）
  const [monthBriefMap, setMonthBriefMap] = useState<Record<string, DayBrief>>({})
  const [detailLoading, setDetailLoading] = useState(false)

  const currentDetail = dayDetailsMap[currentDate] || result.dayDetail

  // 初始挂载：加载月简要数据，按吉凶等级排序，选中排名第一的吉日
  // 与 handleMonthChange 同逻辑，确保从"确认择吉"按钮进入时"推荐"在第一张卡片
  useEffect(() => {
    const initMount = async () => {
      try {
        const monthData = await fetchMonthData(initY, initM)
        const briefMap: Record<string, DayBrief> = {}
        monthData.days.forEach(d => { briefMap[d.date] = d })
        setMonthBriefMap(briefMap)

        // 按吉凶等级（吉>平>凶）→ 日期 排序，选中排名第一的吉日
        if (result.auspiciousDays.length > 0) {
          const sorted = [...result.auspiciousDays].sort((a, b) => {
            const la = LEVEL_ORDER[briefMap[a]?.level_label ?? ''] ?? 3
            const lb = LEVEL_ORDER[briefMap[b]?.level_label ?? ''] ?? 3
            if (la !== lb) return la - lb
            return a.localeCompare(b)
          })
          const topDay = sorted[0]
          if (dayDetailsMap[topDay]) {
            setCurrentDate(topDay)
          } else {
            const [y, m, d] = topDay.split('-').map(Number)
            try {
              const detail = await fetchDayDetail(y, m, d)
              setDayDetailsMap(prev => ({ ...prev, [topDay]: detail }))
              setCurrentDate(topDay)
            } catch (err) {
              console.warn('[HuangliResultView] 初始加载首日详情失败:', err)
            }
          }
        }
      } catch (err) {
        console.warn('[HuangliResultView] 初始加载月简要数据失败:', err)
      }
    }
    initMount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initY, initM])

  // 切换吉日：加载详情（已缓存则直接切换）
  const handleSelectDay = async (date: string) => {
    if (date === currentDate) return
    if (dayDetailsMap[date]) {
      setCurrentDate(date)
      return
    }
    setDetailLoading(true)
    try {
      const [y, m, d] = date.split('-').map(Number)
      const detail = await fetchDayDetail(y, m, d)
      setDayDetailsMap(prev => ({ ...prev, [date]: detail }))
      setCurrentDate(date)
    } catch (err) {
      console.warn('[HuangliResultView] 加载日详情失败:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  // 切换月份：并行拉取筛选结果与月简要数据，默认选中排名第一的吉日
  const handleMonthChange = async (year: number, month: number) => {
    setMonthLoading(true)
    try {
      const [filterResult, monthData] = await Promise.all([
        filterAuspiciousDays(year, month, result.activity),
        fetchMonthData(year, month),
      ])
      // 构建月简要映射（本地排序用 + 写入 state 供卡片渲染用）
      const briefMap: Record<string, DayBrief> = {}
      monthData.days.forEach(d => { briefMap[d.date] = d })
      setMonthBriefMap(briefMap)

      const newDays = filterResult.matched_dates
      setAuspiciousDays(newDays)

      // 按吉凶等级（吉>平>凶）→ 日期 排序，选中排名第一的吉日作为默认
      if (newDays.length > 0) {
        const sorted = [...newDays].sort((a, b) => {
          const la = LEVEL_ORDER[briefMap[a]?.level_label ?? ''] ?? 3
          const lb = LEVEL_ORDER[briefMap[b]?.level_label ?? ''] ?? 3
          if (la !== lb) return la - lb
          return a.localeCompare(b)
        })
        const topDay = sorted[0]
        if (dayDetailsMap[topDay]) {
          setCurrentDate(topDay)
        } else {
          const [y, m, d] = topDay.split('-').map(Number)
          try {
            const detail = await fetchDayDetail(y, m, d)
            setDayDetailsMap(prev => ({ ...prev, [topDay]: detail }))
            setCurrentDate(topDay)
          } catch (err) {
            console.warn('[HuangliResultView] 加载首日详情失败:', err)
          }
        }
      }
    } catch (err) {
      console.warn('[HuangliResultView] 切换月份失败:', err)
    } finally {
      setMonthLoading(false)
    }
  }

  const prevMonth = () => {
    const newY = viewMonth === 1 ? viewYear - 1 : viewYear
    const newM = viewMonth === 1 ? 12 : viewMonth - 1
    setViewYear(newY)
    setViewMonth(newM)
    handleMonthChange(newY, newM)
  }
  const nextMonth = () => {
    const newY = viewMonth === 12 ? viewYear + 1 : viewYear
    const newM = viewMonth === 12 ? 1 : viewMonth + 1
    setViewYear(newY)
    setViewMonth(newM)
    handleMonthChange(newY, newM)
  }

  // 吉日排序：按吉凶等级（吉>平>凶）→ 再按推荐得分 → 再按日期
  // level_label 优先取自 monthBriefMap（全月覆盖），回落到 dayDetailsMap
  const rankedDays = useMemo(() => {
    return [...auspiciousDays].sort((a, b) => {
      const la = LEVEL_ORDER[monthBriefMap[a]?.level_label ?? dayDetailsMap[a]?.level_label ?? ''] ?? 3
      const lb = LEVEL_ORDER[monthBriefMap[b]?.level_label ?? dayDetailsMap[b]?.level_label ?? ''] ?? 3
      if (la !== lb) return la - lb
      // 若两日都有完整详情，按推荐得分排序
      const da = dayDetailsMap[a]
      const db = dayDetailsMap[b]
      if (da && db) {
        const sa = getDayScore(da)
        const sb = getDayScore(db)
        if (sa !== sb) return sb - sa
      }
      return a.localeCompare(b)
    })
  }, [auspiciousDays, monthBriefMap, dayDetailsMap])

  // 当前选中日的择吉分析：匹配的宜事项
  const matchedThings = getMatchedThings(currentDetail.good_things, result.activity)
  // 当前选中日的忌事项中与活动相关的（注意事项）
  const cautionThings = currentDetail.bad_things.filter(t => {
    const keywords = ACTIVITY_KEYWORDS[result.activity] || []
    return keywords.some(k => t.includes(k))
  })
  // 当前选中日的吉时
  const luckyHours = currentDetail.twohour_list.filter(h => h.lucky)

  const d = currentDetail

  // 排盘信息弹窗的档案数据
  const pi = result.personInfo
  const archiveData = {
    name: pi ? pi.name : `黄道择吉_${result.activity}_${result.selectedDate}`,
    gender: pi ? pi.gender : '未知',
    birth_datetime: pi?.birthDateTime || result.queryTime,
    birthplace: pi?.birthplace || null,
    calendar_type: '公历',
    bazi_result: result as unknown as Record<string, unknown>,
  }
  const chartName = pi
    ? `${pi.name}_${result.activity}_${result.selectedDate}`
    : `黄道择吉_${result.activity}_${result.selectedDate}`

  return (
    <div className="feature-bazi huangli-result-feature">
      <div className="bazi-combined-card huangli-result-card">
        {/* 卡片头部：返回 + 排盘信息 + 标题 + 展开/收缩 + 解盘报告 */}
        <div className="bazi-card-header" onClick={() => setCardExpanded(!cardExpanded)}>
          <div className="bazi-left-actions" onClick={(e) => e.stopPropagation()}>
            <BackButton onClick={onBack} />
            <button
              type="button"
              className="bazi-toolbar-btn"
              title="排盘信息"
              onClick={() => setShowInfoModal(true)}
            >
              排盘信息
            </button>
          </div>

          <div className="bazi-card-title">
            <div className="bazi-info-card">
              {pi ? (
                <>
                  <h2 className="bazi-name">
                    {pi.name}
                    <span className="bazi-gender-tag">
                      {pi.gender} · {ALL_CATEGORY_ICONS[result.activity] || '📅'} {result.activity}
                    </span>
                  </h2>
                  <p className="bazi-desc">
                    择吉日期 {result.selectedDate} · {result.dayDetail.weekday}
                  </p>
                  <p className="bazi-pattern-desc">
                    {pi.birthDateTime && (
                      <>出生 {pi.birthDateTime.replace('T', ' ')}{pi.birthplace ? ` · ${pi.birthplace}` : ''} · </>
                    )}
                    吉凶 <span className="bazi-pattern-value">{result.dayDetail.level_label}</span>
                    · 建除 <span className="bazi-pattern-value">{result.dayDetail.day_officer}</span>
                  </p>
                </>
              ) : (
                <>
                  <h2 className="bazi-name">
                    黄道择吉
                    <span className="bazi-gender-tag">
                      {ALL_CATEGORY_ICONS[result.activity] || '📅'} {result.activity}
                    </span>
                  </h2>
                  <p className="bazi-desc">
                    择吉日期 {result.selectedDate} · {result.dayDetail.weekday}
                  </p>
                  <p className="bazi-pattern-desc">
                    吉凶 <span className="bazi-pattern-value">{result.dayDetail.level_label}</span>
                    · 建除 <span className="bazi-pattern-value">{result.dayDetail.day_officer}</span>
                  </p>
                </>
              )}
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
                  <path d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* 卡片内容区：可展开/收缩 */}
        <div className={`bazi-card-content ${cardExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="bazi-chart-content-wrapper">
            {/* 择吉事项概览 + 月份切换 */}
            <div className="huangli-result-header">
              <div className="huangli-result-activity">
                {ALL_CATEGORY_ICONS[result.activity] || '📅'} 择吉事项：{result.activity}
              </div>
              <div className="huangli-result-month-nav">
                <button type="button" className="huangli-nav-btn" onClick={prevMonth} disabled={monthLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="huangli-result-month-label">{viewYear}年{viewMonth}月</span>
                <button type="button" className="huangli-nav-btn" onClick={nextMonth} disabled={monthLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
              <div className="huangli-result-summary">
                {monthLoading ? '筛选吉日中...' : <>本月宜<strong>{result.activity}</strong>的吉日共 <strong>{auspiciousDays.length}</strong> 天</>}
              </div>
            </div>

            {/* 吉日推荐列表 - 可点击切换 */}
            {rankedDays.length > 0 ? (
              <div className="huangli-auspicious-list">
                <h4 className="huangli-auspicious-title">吉日推荐（按推荐度排序）</h4>
                <div className="huangli-auspicious-grid">
                  {rankedDays.map((date, idx) => {
                    const brief = monthBriefMap[date]
                    const detail = dayDetailsMap[date]
                    const isActive = date === currentDate
                    const isTop = idx === 0 && (brief?.level_label === '吉' || detail?.level_label === '吉')
                    const levelLabel = brief?.level_label || detail?.level_label || ''
                    const weekday = brief?.weekday || detail?.weekday || '—'
                    return (
                      <button
                        key={date}
                        type="button"
                        className={`huangli-auspicious-card${isActive ? ' active' : ''}`}
                        onClick={() => handleSelectDay(date)}
                      >
                        {isTop && <span className="huangli-auspicious-rank">推荐</span>}
                        <span className="huangli-auspicious-date">{date.slice(8)}</span>
                        <span className="huangli-auspicious-weekday">{weekday}</span>
                        {levelLabel && (
                          <span className={`huangli-auspicious-level level-${levelLabel}`}>
                            {levelLabel}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              !monthLoading && !detailLoading && (
                <div className="huangli-auspicious-empty">
                  <div className="huangli-auspicious-empty-icon">📅</div>
                  <div className="huangli-auspicious-empty-text">
                    本月暂无宜「{result.activity}」的吉日
                  </div>
                  <div className="huangli-auspicious-empty-hint">请切换其他月份查看</div>
                </div>
              )
            )}

            {detailLoading && <div className="huangli-detail-loading">加载详情中...</div>}

            {/* 选中日详情 - 仅当本月有吉日时才渲染 */}
            {!detailLoading && auspiciousDays.length > 0 && (
              <>
                {/* 日期与吉凶 */}
                <div className="huangli-detail-top">
                  <div className="huangli-detail-date">
                    <span className="huangli-detail-solar">{d.date} {d.weekday}</span>
                    <span className="huangli-detail-lunar">
                      {d.lunar_year} {d.lunar_month}{d.lunar_day}
                    </span>
                  </div>
                  <div className={`huangli-detail-level-badge level-${d.level_label}`}>
                    {d.level_label}
                  </div>
                </div>

                {/* 择吉分析 */}
                <div className="huangli-analysis">
                  <h4 className="huangli-analysis-title">择吉分析</h4>
                  {matchedThings.length > 0 ? (
                    <div className="huangli-analysis-row">
                      <span className="huangli-analysis-label">宜</span>
                      <span className="huangli-analysis-value">
                        本日宜 <strong>{matchedThings.join('、')}</strong>，与所选事项「{result.activity}」相合
                      </span>
                    </div>
                  ) : (
                    <div className="huangli-analysis-row">
                      <span className="huangli-analysis-label">宜</span>
                      <span className="huangli-analysis-value">本日宜事项中未见与「{result.activity}」直接相关项</span>
                    </div>
                  )}
                  {cautionThings.length > 0 && (
                    <div className="huangli-analysis-row caution">
                      <span className="huangli-analysis-label">忌</span>
                      <span className="huangli-analysis-value">
                        本日忌 <strong>{cautionThings.join('、')}</strong>，需注意
                      </span>
                    </div>
                  )}
                  {luckyHours.length > 0 && (
                    <div className="huangli-analysis-row">
                      <span className="huangli-analysis-label">吉时</span>
                      <span className="huangli-analysis-value">
                        {luckyHours.map(h => TWO_HOUR_NAMES[h.hour]).join('、')}
                      </span>
                    </div>
                  )}
                </div>

                {/* 干支核心信息 */}
                <div className="huangli-detail-ganzhi">
                  <div className="huangli-ganzhi-row">
                    <span className="huangli-ganzhi-label">干支</span>
                    <span className="huangli-ganzhi-value">{d.year_ganzhi}年 {d.month_ganzhi}月 {d.day_ganzhi}日</span>
                  </div>
                  <div className="huangli-ganzhi-row">
                    <span className="huangli-ganzhi-label">生肖</span>
                    <span className="huangli-ganzhi-value">{d.zodiac} · {d.clash}</span>
                  </div>
                  <div className="huangli-ganzhi-row">
                    <span className="huangli-ganzhi-label">建除</span>
                    <span className="huangli-ganzhi-value">{d.day_officer}日 · {d.day_god}</span>
                  </div>
                  <div className="huangli-ganzhi-row">
                    <span className="huangli-ganzhi-label">星宿</span>
                    <span className="huangli-ganzhi-value">{d.star_28}</span>
                  </div>
                  {d.nayin && (
                    <div className="huangli-ganzhi-row">
                      <span className="huangli-ganzhi-label">纳音</span>
                      <span className="huangli-ganzhi-value">{d.nayin}</span>
                    </div>
                  )}
                  <div className="huangli-ganzhi-row">
                    <span className="huangli-ganzhi-label">五行</span>
                    <span className="huangli-ganzhi-value">{d.elements}</span>
                  </div>
                </div>

                {/* 宜忌 */}
                <div className="huangli-detail-yiji">
                  <div className="huangli-yi-section">
                    <h4 className="huangli-yi-title">宜</h4>
                    <div className="huangli-tag-list">
                      {d.good_things.length === 0
                        ? <span className="huangli-no-data">—</span>
                        : d.good_things.map((t, i) => <span key={i} className="huangli-tag yi">{t}</span>)
                      }
                    </div>
                  </div>
                  <div className="huangli-ji-section">
                    <h4 className="huangli-ji-title">忌</h4>
                    <div className="huangli-tag-list">
                      {d.bad_things.length === 0
                        ? <span className="huangli-no-data">—</span>
                        : d.bad_things.map((t, i) => <span key={i} className="huangli-tag ji">{t}</span>)
                      }
                    </div>
                  </div>
                </div>

                {/* 吉神凶煞 */}
                <div className="huangli-detail-gods">
                  <div className="huangli-gods-row">
                    <span className="huangli-gods-label">吉神</span>
                    <span className="huangli-gods-value">{d.good_gods.join('、') || '—'}</span>
                  </div>
                  <div className="huangli-gods-row">
                    <span className="huangli-gods-label">凶煞</span>
                    <span className="huangli-gods-value">{d.bad_gods.join('、') || '—'}</span>
                  </div>
                </div>

                {/* 时辰吉凶 */}
                <div className="huangli-detail-hours">
                  <h4 className="huangli-hours-title">时辰吉凶</h4>
                  <div className="huangli-hours-grid">
                    {d.twohour_list.map((h, i) => (
                      <div key={i} className={`huangli-hour-cell${h.lucky ? ' lucky' : ' unlucky'}`}>
                        <span className="huangli-hour-name">{TWO_HOUR_NAMES[h.hour]}</span>
                        <span className="huangli-hour-ganzhi">{h.ganzhi}</span>
                        <span className="huangli-hour-badge">{h.lucky ? '吉' : '凶'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 排盘信息弹窗 */}
      {showInfoModal && (
        <DivinationInfoModal
          title="黄道择吉排盘信息"
          chartType="黄历择吉"
          chartName={chartName}
          contextData={contextData}
          jsonData={jsonData}
          archiveData={archiveData}
          onClose={() => setShowInfoModal(false)}
        />
      )}

      {/* 解盘报告弹窗 */}
      {showReportModal && (
        <BaziReportModal
          chartType="黄历择吉"
          chartName={chartName}
          contextData={contextData}
          archiveData={archiveData}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}
