import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { API_BASE } from '../utils/constants'

// ── Types ──

interface TwoHourItem {
  hour: number
  ganzhi: string
  lucky: boolean
}

interface DayHuangli {
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

interface DayBrief {
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

interface MonthData {
  year: number
  month: number
  month_days: number
  lunar_month_info: string
  days: DayBrief[]
}

interface FilterResult {
  category: string
  matched_dates: string[]
  total: number
}

interface CategoryItem {
  key: string
  label: string
  icon: string
  count: number
}

// ── Constants ──

const TWO_HOUR_NAMES = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']

const CATEGORY_ICONS: Record<string, string> = {
  '婚嫁': '💒', '开业': '🏪', '搬家': '🏠', '动土': '🔨',
  '安葬': '🪦', '出行': '✈️', '祭祀': '🙏', '栽种': '🌱',
  '求医': '🏥', '上官': '💼', '会友': '👥', '安床': '🛏',
  '签约': '📝', '装修': '🎨', '入学': '🎓', '求职': '📋',
  '买车': '🚗', '领证': '📜', '提车': '🚙', '谈判': '🤝',
}

// ── Component ──

export default function HuangliPanel() {
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
  const [filterResults, setFilterResults] = useState<Record<string, FilterResult>>({})
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [highlightedDates, setHighlightedDates] = useState<Set<string>>(new Set())

  // Fetch full detail for a specific day
  const fetchDayDetail = useCallback(async (dateStr: string) => {
    setDetailLoading(true)
    setError('')
    try {
      const [y, m, d] = dateStr.split('-').map(Number)
      const res = await fetch(`${API_BASE}/huangli/day?year=${y}&month=${m}&day=${d}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      if (data.success) setSelectedDay(data.data)
    } catch {
      setError('加载日详情失败，请稍后重试')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // Fetch month data
  const fetchMonth = useCallback(async (year: number, month: number) => {
    setLoading(true)
    setSelectedDay(null)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/huangli/month?year=${year}&month=${month}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      if (data.success) {
        setMonthData(data.data)
        // Auto-load today's detail
        const now = new Date()
        const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        if (year === now.getFullYear() && month === now.getMonth() + 1) {
          fetchDayDetail(todayStr)
        }
      }
    } catch {
      setError('加载黄历数据失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }, [fetchDayDetail])

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/huangli/categories`)
      if (!res.ok) return
      const data = await res.json()
      if (data.success) setCategories(data.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchMonth(viewYear, viewMonth) }, [viewYear, viewMonth, fetchMonth])
  useEffect(() => { fetchCategories() }, [fetchCategories])

  const handleDayClick = useCallback((brief: DayBrief) => {
    fetchDayDetail(brief.date)
  }, [fetchDayDetail])

  const handleDayKeyDown = useCallback((e: React.KeyboardEvent, brief: DayBrief) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fetchDayDetail(brief.date)
    }
  }, [fetchDayDetail])

  // Filter by activity
  const handleFilter = useCallback(async (cat: string) => {
    if (activeCategory === cat) {
      setActiveCategory('')
      setHighlightedDates(new Set())
      return
    }
    setActiveCategory(cat)
    try {
      const res = await fetch(
        `${API_BASE}/huangli/filter?year=${viewYear}&month=${viewMonth}&activity=${encodeURIComponent(cat)}`
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.success) {
        setFilterResults(prev => ({ ...prev, [cat]: data.data }))
        setHighlightedDates(new Set(data.data.matched_dates))
      }
    } catch { /* ignore */ }
  }, [activeCategory, viewYear, viewMonth])

  // Navigation
  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12) }
    else { setViewMonth(viewMonth - 1) }
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1) }
    else { setViewMonth(viewMonth + 1) }
  }

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    if (!monthData) return []
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay()
    const grid: (DayBrief | null)[] = []

    // Fill leading empty cells
    for (let i = 0; i < firstDay; i++) grid.push(null)

    // Fill day cells
    monthData.days.forEach((d) => grid.push(d))

    // Fill trailing empty cells to complete last row
    while (grid.length % 7 !== 0) grid.push(null)

    return grid
  }, [monthData, viewYear, viewMonth])

  const isToday = (dateStr: string) => {
    const t = new Date()
    return dateStr === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }

  // ── Render ──

  return (
    <div className="huangli-panel">
      {/* Header: Month navigator */}
      <div className="huangli-header">
        <div className="huangli-nav">
          <button type="button" className="huangli-nav-btn" onClick={prevMonth} aria-label="上月">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="huangli-month-title">
            <span className="huangli-month-year">{viewYear}年{viewMonth}月</span>
            {monthData && (
              <span className="huangli-month-lunar">{monthData.lunar_month_info}</span>
            )}
          </div>
          <button type="button" className="huangli-nav-btn" onClick={nextMonth} aria-label="下月">
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
            {categories.map(cat => (
              <option key={cat.key} value={cat.key}>
                {CATEGORY_ICONS[cat.key] || '📅'} {cat.label}
              </option>
            ))}
          </select>
          {activeCategory && filterResults[activeCategory] && (
            <span className="huangli-filter-result-inline">
              共 <strong>{filterResults[activeCategory].total}</strong> 天
            </span>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && <div className="huangli-loading">加载黄历数据中...</div>}

      {/* Error */}
      {error && !loading && !detailLoading && (
        <div className="huangli-error">
          <span>{error}</span>
          <button type="button" onClick={() => fetchMonth(viewYear, viewMonth)}>重试</button>
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && monthData && (
        <>
          <div className="huangli-calendar">
            {/* Weekday headers */}
            <div className="huangli-weekdays">
              {['日', '一', '二', '三', '四', '五', '六'].map(w => (
                <div key={w} className="huangli-weekday">{w}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="huangli-grid">
              {calendarGrid.map((day, idx) => (
                <div
                  key={idx}
                  className={`huangli-cell${day ? ' has-data' : ''}${day && isToday(day.date) ? ' today' : ''}${day && selectedDay?.date === day.date ? ' active' : ''}${day ? ` level-${day.level_label}` : ''}${day && highlightedDates.has(day.date) ? ' highlighted' : ''}`}
                  onClick={() => day && handleDayClick(day)}
                  onKeyDown={(e) => day && handleDayKeyDown(e, day)}
                  role={day ? 'button' : undefined}
                  tabIndex={day ? 0 : undefined}
                  aria-label={day ? `${day.date} ${day.lunar_day} ${day.level_label}` : undefined}
                >
                  {day && (
                    <>
                      <span className="huangli-cell-date">{new Date(day.date).getDate()}</span>
                      <span className="huangli-cell-lunar">{day.lunar_day}</span>
                      <span className="huangli-cell-badge">
                        {day.solar_term !== '无' ? day.solar_term : day.level_label}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="huangli-legend">
            <span className="huangli-legend-item level-吉"><i /> 吉日</span>
            <span className="huangli-legend-item level-平"><i /> 平日</span>
            <span className="huangli-legend-item level-凶"><i /> 凶日</span>
            {activeCategory && (
              <span className="huangli-legend-item highlighted"><i /> 宜{activeCategory}</span>
            )}
          </div>
        </>
      )}

      {/* Day Detail */}
      {detailLoading && (
        <div className="huangli-detail-loading">加载详情中...</div>
      )}
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

          {/* GanZhi & core info */}
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
            <div className="huangli-ganzhi-row">
              <span className="huangli-ganzhi-label">星宿</span>
              <span className="huangli-ganzhi-value">{selectedDay.star_28}</span>
            </div>
            {selectedDay.nayin && (
              <div className="huangli-ganzhi-row">
                <span className="huangli-ganzhi-label">纳音</span>
                <span className="huangli-ganzhi-value">{selectedDay.nayin}</span>
              </div>
            )}
          </div>

          {/* Good / Bad things */}
          <div className="huangli-detail-yiji">
            <div className="huangli-yi-section">
              <h4 className="huangli-yi-title">宜</h4>
              <div className="huangli-tag-list">
                {selectedDay.good_things.length === 0 ? (
                  <span className="huangli-no-data">—</span>
                ) : (
                  selectedDay.good_things.map((t, i) => (
                    <span key={i} className="huangli-tag yi">{t}</span>
                  ))
                )}
              </div>
            </div>
            <div className="huangli-ji-section">
              <h4 className="huangli-ji-title">忌</h4>
              <div className="huangli-tag-list">
                {selectedDay.bad_things.length === 0 ? (
                  <span className="huangli-no-data">—</span>
                ) : (
                  selectedDay.bad_things.map((t, i) => (
                    <span key={i} className="huangli-tag ji">{t}</span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Gods */}
          <div className="huangli-detail-gods">
            <div className="huangli-gods-row">
              <span className="huangli-gods-label">吉神</span>
              <span className="huangli-gods-value">{selectedDay.good_gods.join('、') || '—'}</span>
            </div>
            <div className="huangli-gods-row">
              <span className="huangli-gods-label">凶煞</span>
              <span className="huangli-gods-value">{selectedDay.bad_gods.join('、') || '—'}</span>
            </div>
          </div>

          {/* Directions & extras */}
          <div className="huangli-detail-extras">
            {selectedDay.lucky_directions.length > 0 && (
              <div className="huangli-extras-row">
                <span className="huangli-extras-label">吉神方位</span>
                <span className="huangli-extras-value">{selectedDay.lucky_directions.join(' ')}</span>
              </div>
            )}
            {selectedDay.peng_taboo && (
              <div className="huangli-extras-row">
                <span className="huangli-extras-label">彭祖百忌</span>
                <span className="huangli-extras-value">{selectedDay.peng_taboo}</span>
              </div>
            )}
            {selectedDay.fetal_god && (
              <div className="huangli-extras-row">
                <span className="huangli-extras-label">胎神</span>
                <span className="huangli-extras-value">{selectedDay.fetal_god}</span>
              </div>
            )}
            {selectedDay.solar_term !== '无' && (
              <div className="huangli-extras-row">
                <span className="huangli-extras-label">节气</span>
                <span className="huangli-extras-value">{selectedDay.solar_term}</span>
              </div>
            )}
            {selectedDay.next_solar_term && (
              <div className="huangli-extras-row">
                <span className="huangli-extras-label">下一节气</span>
                <span className="huangli-extras-value">{selectedDay.next_solar_term} ({selectedDay.next_solar_term_date})</span>
              </div>
            )}
            <div className="huangli-extras-row">
              <span className="huangli-extras-label">五行</span>
              <span className="huangli-extras-value">{selectedDay.elements}</span>
            </div>
            <div className="huangli-extras-row">
              <span className="huangli-extras-label">六合·三合</span>
              <span className="huangli-extras-value">
                {selectedDay.zodiac_mark6} · {selectedDay.zodiac_mark3?.join('、')}
              </span>
            </div>
          </div>

          {/* Hour luck */}
          <div className="huangli-detail-hours">
            <h4 className="huangli-hours-title">时辰吉凶</h4>
            <div className="huangli-hours-grid">
              {selectedDay.twohour_list.map((h, i) => (
                <div key={i} className={`huangli-hour-cell${h.lucky ? ' lucky' : ' unlucky'}`}>
                  <span className="huangli-hour-name">{TWO_HOUR_NAMES[h.hour]}</span>
                  <span className="huangli-hour-ganzhi">{h.ganzhi}</span>
                  <span className="huangli-hour-badge">{h.lucky ? '吉' : '凶'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}