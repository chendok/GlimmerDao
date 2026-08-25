import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import PickerColumn from './PickerColumn'
import RegionPicker from './RegionPicker'
import ArchivePickerModal from './ArchivePickerModal'
import ConfirmDialog from './ConfirmDialog'
import { useArchive, type ArchiveItem } from '../context/ArchiveContext'
import { useAuth } from '../context/AuthContext'
import { getTrueSolarTime, resolveFourPillarsToSolar } from '../utils/baziCalculator'
import { getLongitudeFromCity, getLatitudeFromCity } from '../utils/cityLongitudeMap'
import { LunarYear, Lunar, Solar } from 'lunar-javascript'
import { useBirthInfoFormState, type BirthInfoFormState as PersistentFormState } from '../hooks/useBirthInfoFormState'
import { getErrorMessage } from '../utils/helpers'
import { formatArchiveBirth } from '../utils/formatBirth'

export type CalendarType = '公历' | '农历' | '四柱'

/**
 * 出生时间元信息：用于在档案中持久化农历闰月与四柱干支等原始输入，
 * 避免从档案读取后重新排盘时丢失关键信息导致结果错误。
 */
export interface BirthMeta {
  /** 农历输入模式下的闰月标记 */
  isLeapMonth?: boolean
  /** 四柱输入模式下的八字符号（年干年支月干月支日干日支时干时支） */
  pillars?: {
    yearGan: string
    yearZhi: string
    monthGan: string
    monthZhi: string
    dayGan: string
    dayZhi: string
    hourGan: string
    hourZhi: string
  }
}

/**
 * 将出生信息规范化为「公历日期」字符串（YYYY-MM-DDTHH:mm），
 * 并返回原始输入元信息（闰月/四柱干支）。
 *
 * - 公历：原样返回。
 * - 农历：通过 lunar-javascript 将农历日期（含闰月）转换为公历。
 * - 四柱：无法唯一反推公历日期，返回空字符串（调用方应保留干支元信息）。
 */
export function normalizeBirthDateTime(
  calendarType: CalendarType,
  birthDateTime: string,
  isLeapMonth?: boolean,
): { solarDateTime: string; meta: BirthMeta } {
  if (!birthDateTime) {
    return { solarDateTime: '', meta: {} }
  }

  if (calendarType === '农历' && birthDateTime.includes('T')) {
    const [datePart, timePart] = birthDateTime.split('T')
    const parts = datePart.split('-')
    if (parts.length === 3) {
      const lunarYear = parseInt(parts[0], 10)
      const lunarMonth = parseInt(parts[1], 10)
      const lunarDay = parseInt(parts[2], 10)
      const hour = timePart ? parseInt(timePart.split(':')[0], 10) : 0
      const minute = timePart ? parseInt(timePart.split(':')[1], 10) : 0
      if (!isNaN(lunarYear) && !isNaN(lunarMonth) && !isNaN(lunarDay)) {
        try {
          // 闰月：lunar-javascript 用负数月表示（如 -2 = 闰二月）
          const effectiveMonth = isLeapMonth ? -lunarMonth : lunarMonth
          const lunar = Lunar.fromYmdHms(lunarYear, effectiveMonth, lunarDay, hour, minute, 0)
          const solar = lunar.getSolar()
          const sy = solar.getYear()
          const sm = String(solar.getMonth()).padStart(2, '0')
          const sd = String(solar.getDay()).padStart(2, '0')
          const sh = String(solar.getHour()).padStart(2, '0')
          const smin = String(solar.getMinute()).padStart(2, '0')
          return {
            solarDateTime: `${sy}-${sm}-${sd}T${sh}:${smin}`,
            meta: { isLeapMonth: !!isLeapMonth },
          }
        } catch {
          // 转换失败则回退为原始值
        }
      }
    }
  }

  if (calendarType === '四柱') {
    return { solarDateTime: '', meta: {} }
  }

  // 公历：原样返回
  return { solarDateTime: birthDateTime, meta: {} }
}

/**
 * 将后端返回的原始错误信息转换为更友好的提示文案
 */
function friendlySaveError(raw: string): string {
  if (!raw) return '保存失败，请稍后重试'
  if (raw.includes('已存在') || raw.includes('不能重复')) {
    return '该姓名在档案库中已存在，请更换姓名'
  }
  if (raw.includes('未登录') || raw.includes('登录') || raw.includes('认证') || raw.includes('401')) {
    return '登录已过期，请重新登录后再保存'
  }
  if (raw.includes('网络') || raw.includes('连接') || raw.includes('Failed to fetch')) {
    return '网络连接异常，请检查网络后重试'
  }
  // 其他情况：去掉技术细节，给出通用提示
  return '保存失败，请稍后重试'
}

export interface BirthInfo {
  name: string
  gender: '男' | '女'
  calendarType: CalendarType
  birthDateTime: string
  birthplace: string
  longitude: number
  selectedGroup: string
  /** 农历输入模式下是否为闰月 */
  isLeapMonth?: boolean
  yearGan: string
  yearZhi: string
  monthGan: string
  monthZhi: string
  dayGan: string
  dayZhi: string
  hourGan: string
  hourZhi: string
}

export interface BirthInfoFormProps {
  title?: string
  description?: string
  calendarTypes?: CalendarType[]
  showArchive?: boolean
  showBirthplace?: boolean
  submitLabel?: string
  onSubmit: (info: BirthInfo) => void
  /** 功能标识，用于状态持久化（如 'bazi', 'ziwei'）。不提供则不持久化 */
  featureId?: string
}

function DateTimeModal({
  calendarType,
  tempYear,
  tempMonth,
  tempIsLeapMonth,
  leapMonthOfYear,
  tempDay,
  tempHour,
  tempMinute,
  tempYearGan,
  tempYearZhi,
  tempMonthGan,
  tempMonthZhi,
  tempDayGan,
  tempDayZhi,
  tempHourGan,
  tempHourZhi,
  onTempYearChange,
  onTempMonthChange,
  onTempIsLeapMonthChange,
  onTempDayChange,
  onTempHourChange,
  onTempMinuteChange,
  onTempYearGanChange,
  onTempYearZhiChange,
  onTempMonthGanChange,
  onTempMonthZhiChange,
  onTempDayGanChange,
  onTempDayZhiChange,
  onTempHourGanChange,
  onTempHourZhiChange,
  quickInput,
  onQuickInputChange,
  onQuickInputConfirm,
  isDtFormValid,
  onConfirm,
  onClose,
}: {
  calendarType: CalendarType
  tempYear: string
  tempMonth: string
  tempIsLeapMonth: boolean
  leapMonthOfYear: number
  tempDay: string
  tempHour: string
  tempMinute: string
  tempYearGan: string
  tempYearZhi: string
  tempMonthGan: string
  tempMonthZhi: string
  tempDayGan: string
  tempDayZhi: string
  tempHourGan: string
  tempHourZhi: string
  onTempYearChange: (val: string) => void
  onTempMonthChange: (val: string) => void
  onTempIsLeapMonthChange: (val: boolean) => void
  onTempDayChange: (val: string) => void
  onTempHourChange: (val: string) => void
  onTempMinuteChange: (val: string) => void
  onTempYearGanChange: (val: string) => void
  onTempYearZhiChange: (val: string) => void
  onTempMonthGanChange: (val: string) => void
  onTempMonthZhiChange: (val: string) => void
  onTempDayGanChange: (val: string) => void
  onTempDayZhiChange: (val: string) => void
  onTempHourGanChange: (val: string) => void
  onTempHourZhiChange: (val: string) => void
  quickInput: string
  onQuickInputChange: (val: string) => void
  onQuickInputConfirm: () => void
  isDtFormValid: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const yearOptions = useMemo(() => {
    if (calendarType === '农历') {
      const years: { value: string; label: string }[] = []
      const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
      const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
      const ganzhi60 = Array.from({ length: 60 }, (_, i) => `${GAN[i % 10]}${ZHI[i % 12]}`)
      for (let y = 1950; y <= 2050; y++) {
        const ganzhi = ganzhi60[(y - 4) % 60]
        years.push({ value: String(y), label: `${y} ${ganzhi}` })
      }
      return years
    }
    return Array.from({ length: 201 }, (_, i) => {
      const y = 1950 + i
      return { value: String(y), label: String(y) }
    })
  }, [calendarType])

  const monthOptions = useMemo(() => {
    if (calendarType === '农历') {
      const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
      return lunarMonths.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = (i + 1).toString().padStart(2, '0')
      return { value: m, label: m }
    })
  }, [calendarType])

  const dayOptions = useMemo(() => {
    const days = calendarType === '农历' ? 30 : 31
    if (calendarType === '农历') {
      const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
      return lunarDays.slice(0, days).map((d, i) => ({ value: String(i + 1).padStart(2, '0'), label: d }))
    }
    return Array.from({ length: days }, (_, i) => {
      const d = (i + 1).toString().padStart(2, '0')
      return { value: d, label: d }
    })
  }, [calendarType])

  const hourOptions = useMemo(() => {
    if (calendarType === '农历') {
      // 农历「时」维度只显示十二时辰（无数字），value 存各时辰的代表小时数
      // 用于 lunar 转换：子=00, 丑=02, 寅=04, 卯=06, 辰=08, 巳=10, 午=12,
      // 未=14, 申=16, 酉=18, 戌=20, 亥=22（取各时辰中点）
      const shichenList = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']
      const shichenHours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
      return shichenList.map((s, i) => ({
        value: String(shichenHours[i]).padStart(2, '0'),
        label: s,
      }))
    }
    return Array.from({ length: 24 }, (_, i) => {
      const h = (i + 1).toString().padStart(2, '0')
      return { value: h, label: h }
    })
  }, [calendarType])

  const minuteOptions = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => {
      const m = i.toString().padStart(2, '0')
      return { value: m, label: m }
    })
  }, [])

  const ganOptions = useMemo(() => [
    { value: '甲', label: '甲' }, { value: '乙', label: '乙' }, { value: '丙', label: '丙' },
    { value: '丁', label: '丁' }, { value: '戊', label: '戊' }, { value: '己', label: '己' },
    { value: '庚', label: '庚' }, { value: '辛', label: '辛' }, { value: '壬', label: '壬' },
    { value: '癸', label: '癸' },
  ], [])

  const zhiOptions = useMemo(() => [
    { value: '子', label: '子' }, { value: '丑', label: '丑' }, { value: '寅', label: '寅' },
    { value: '卯', label: '卯' }, { value: '辰', label: '辰' }, { value: '巳', label: '巳' },
    { value: '午', label: '午' }, { value: '未', label: '未' }, { value: '申', label: '申' },
    { value: '酉', label: '酉' }, { value: '戌', label: '戌' }, { value: '亥', label: '亥' },
  ], [])

  return ReactDOM.createPortal(
    <div className="bazi-datetime-overlay" onClick={onClose}>
      <div className="bazi-datetime-modal-picker" onClick={(e) => e.stopPropagation()}>
        <div className="bazi-dt-top-bar">
          <div className="bazi-dt-current-type">
            {calendarType === '四柱' ? '四柱' : calendarType === '农历' ? '农历' : '公历'}
          </div>

          <button
            type="button"
            className="bazi-dt-close-btn"
            onClick={onClose}
            title="关闭"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {calendarType !== '四柱' && (
          <div className="bazi-dt-quick-input-row">
            <input
              type="text"
              className="bazi-dt-quick-input"
              placeholder={calendarType === '农历' ? '输入农历年月日时(格式1993032702)' : '输入出生年月日时分(格式199303270255)'}
              value={quickInput}
              onChange={(e) => onQuickInputChange(e.target.value)}
              maxLength={calendarType === '农历' ? 8 : 12}
            />
            <button
              type="button"
              className="bazi-dt-quick-confirm"
              onClick={onQuickInputConfirm}
              disabled={quickInput.length < 8}
            >
              确定
            </button>
          </div>
        )}

        <div className="bazi-dt-picker-body">
          {(calendarType === '公历' || calendarType === '农历') ? (
            <div className="bazi-dt-picker-columns">
              <PickerColumn
                label="年"
                options={yearOptions}
                value={tempYear}
                onChange={onTempYearChange}
              />
              <PickerColumn
                label="月"
                options={monthOptions}
                value={tempMonth}
                onChange={onTempMonthChange}
              />
              {calendarType === '农历' && leapMonthOfYear > 0 && (
                <div className="bazi-dt-leap-month-toggle">
                  <button
                    type="button"
                    className={`bazi-dt-leap-month-btn${tempIsLeapMonth ? ' active' : ''}`}
                    onClick={() => onTempIsLeapMonthChange(!tempIsLeapMonth)}
                  >
                    闰{monthOptions.find((m) => parseInt(m.value, 10) === leapMonthOfYear)?.label || `${leapMonthOfYear}月`}
                  </button>
                </div>
              )}
              <PickerColumn
                label="日"
                options={dayOptions}
                value={tempDay}
                onChange={onTempDayChange}
              />
              <PickerColumn
                label="时"
                options={hourOptions}
                value={tempHour}
                onChange={onTempHourChange}
              />
              {calendarType === '公历' && (
                <PickerColumn
                  label="分"
                  options={minuteOptions}
                  value={tempMinute}
                  onChange={onTempMinuteChange}
                />
              )}
            </div>
          ) : (
            <div className="bazi-dt-picker-columns bazi-dt-picker-pillar">
              <div className="bazi-dt-pillar-group">
                <span className="bazi-dt-pillar-group-label">年柱</span>
                <div className="bazi-dt-pillar-group-cols">
                  <PickerColumn
                    label="干"
                    options={ganOptions}
                    value={tempYearGan}
                    onChange={onTempYearGanChange}
                  />
                  <PickerColumn
                    label="支"
                    options={zhiOptions}
                    value={tempYearZhi}
                    onChange={onTempYearZhiChange}
                  />
                </div>
              </div>
              <div className="bazi-dt-pillar-group">
                <span className="bazi-dt-pillar-group-label">月柱</span>
                <div className="bazi-dt-pillar-group-cols">
                  <PickerColumn
                    label="干"
                    options={ganOptions}
                    value={tempMonthGan}
                    onChange={onTempMonthGanChange}
                  />
                  <PickerColumn
                    label="支"
                    options={zhiOptions}
                    value={tempMonthZhi}
                    onChange={onTempMonthZhiChange}
                  />
                </div>
              </div>
              <div className="bazi-dt-pillar-group">
                <span className="bazi-dt-pillar-group-label">日柱</span>
                <div className="bazi-dt-pillar-group-cols">
                  <PickerColumn
                    label="干"
                    options={ganOptions}
                    value={tempDayGan}
                    onChange={onTempDayGanChange}
                  />
                  <PickerColumn
                    label="支"
                    options={zhiOptions}
                    value={tempDayZhi}
                    onChange={onTempDayZhiChange}
                  />
                </div>
              </div>
              <div className="bazi-dt-pillar-group">
                <span className="bazi-dt-pillar-group-label">时柱</span>
                <div className="bazi-dt-pillar-group-cols">
                  <PickerColumn
                    label="干"
                    options={ganOptions}
                    value={tempHourGan}
                    onChange={onTempHourGanChange}
                  />
                  <PickerColumn
                    label="支"
                    options={zhiOptions}
                    value={tempHourZhi}
                    onChange={onTempHourZhiChange}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bazi-dt-bottom-bar">
          <button
            type="button"
            className="bazi-dt-confirm-btn"
            onClick={onConfirm}
            disabled={!isDtFormValid}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function GroupSelector({
  selectedGroup,
  onGroupChange,
  isOpen,
  onToggle,
}: {
  selectedGroup: string
  onGroupChange: (group: string) => void
  isOpen: boolean
  onToggle: () => void
}) {
  const groups = ['家人', '朋友', '客户', '其他']

  return (
    <div className="bazi-group-wrapper">
      <button
        type="button"
        className="bazi-group-select"
        onClick={onToggle}
      >
        <span>{selectedGroup}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="bazi-group-dropdown">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`bazi-group-item${selectedGroup === g ? ' active' : ''}`}
              onClick={() => { onGroupChange(g); onToggle() }}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BirthInfoForm({
  title,
  description,
  calendarTypes = ['公历', '农历'],
  showArchive = true,
  showBirthplace = true,
  submitLabel = '排盘',
  onSubmit,
  featureId,
}: BirthInfoFormProps) {
  // 如果提供了 featureId，使用持久化状态
  const persisted = featureId ? useBirthInfoFormState(featureId) : null
  const initialState = persisted?.formState

  const [name, setName] = useState('')
  const [birthDateTime, setBirthDateTime] = useState('')
  const [gender, setGender] = useState<'男' | '女'>(initialState?.gender || '男')
  const [birthplace, setBirthplace] = useState('')
  const [longitude, setLongitude] = useState('')
  const [latitude, setLatitude] = useState('')
  useEffect(() => {
    if (birthplace) {
      const lon = getLongitudeFromCity(birthplace)
      const lat = getLatitudeFromCity(birthplace)
      if (lon && lon !== 120) {
        setLongitude(String(lon))
      }
      if (lat && lat !== 30) {
        setLatitude(String(lat))
      }
    }
  }, [birthplace])
  const [calendarType, setCalendarType] = useState<CalendarType>(initialState?.calendarType || calendarTypes[0])
  const [selectedGroup, setSelectedGroup] = useState(initialState?.selectedGroup || '家人')
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const [showArchivePicker, setShowArchivePicker] = useState(false)
  const [selectedFromArchive, setSelectedFromArchive] = useState<ArchiveItem | null>(null)
  const [showDateTimeModal, setShowDateTimeModal] = useState(false)
  const [tempYear, setTempYear] = useState('')
  const [tempMonth, setTempMonth] = useState('')
  const [tempIsLeapMonth, setTempIsLeapMonth] = useState(false)
  const [tempDay, setTempDay] = useState('')
  const [tempHour, setTempHour] = useState('12')
  const [tempMinute, setTempMinute] = useState('00')
  // 当前选中农历年份的闰月（0=无闰月，正数=闰几月）
  const leapMonthOfYear = useMemo(() => {
    if (calendarType !== '农历') return 0
    const y = parseInt(tempYear, 10)
    if (isNaN(y) || y < 1900 || y > 2100) return 0
    try {
      return LunarYear.fromYear(y).getLeapMonth()
    } catch {
      return 0
    }
  }, [calendarType, tempYear])
  const [quickInput, setQuickInput] = useState('')
  const [tempYearGan, setTempYearGan] = useState('')
  const [tempYearZhi, setTempYearZhi] = useState('')
  const [tempMonthGan, setTempMonthGan] = useState('')
  const [tempMonthZhi, setTempMonthZhi] = useState('')
  const [tempDayGan, setTempDayGan] = useState('')
  const [tempDayZhi, setTempDayZhi] = useState('')
  const [tempHourGan, setTempHourGan] = useState('')
  const [tempHourZhi, setTempHourZhi] = useState('')
  const dateInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 组件卸载时清除保存状态定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  // 状态变化时同步到持久化存储
  useEffect(() => {
    if (persisted) {
      const newState: PersistentFormState = {
        name: '', gender, birthplace: '', longitude: '', latitude: '',
        calendarType, selectedGroup,
        tempYear: '', tempMonth: '', tempDay: '', tempHour: '12', tempMinute: '00',
        quickInput: '',
        tempYearGan: '', tempYearZhi: '', tempMonthGan: '', tempMonthZhi: '',
        tempDayGan: '', tempDayZhi: '', tempHourGan: '', tempHourZhi: '',
      }
      persisted.setFormState(newState)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, gender, birthplace, longitude, latitude, calendarType, selectedGroup,
      tempYear, tempMonth, tempDay, tempHour, tempMinute, quickInput,
      tempYearGan, tempYearZhi, tempMonthGan, tempMonthZhi,
      tempDayGan, tempDayZhi, tempHourGan, tempHourZhi])

  const { saveArchive } = useArchive()
  const { isLoggedIn, openLoginModal } = useAuth()

  const fixDateTimeFormat = useCallback((dateTime: string): string => {
    if (!dateTime || !dateTime.includes('T')) return dateTime
    const [datePart, timePart] = dateTime.split('T')
    const [y, m, d] = datePart.split('-')
    const [h, min] = (timePart || '00:00').split(':')
    return `${y}-${String(parseInt(m, 10)).padStart(2, '0')}-${String(parseInt(d, 10)).padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${(min || '00').padStart(2, '0')}`
  }, [])

  useEffect(() => {
    if (birthDateTime && birthDateTime.includes('T')) {
      const fixed = fixDateTimeFormat(birthDateTime)
      if (fixed !== birthDateTime) {
        setBirthDateTime(fixed)
      }
    }
  }, [birthDateTime, fixDateTimeFormat])

  const isDtFormValid = useMemo(() => {
    if (calendarType === '四柱') {
      return !!(tempYearGan && tempYearZhi && tempMonthGan && tempMonthZhi &&
        tempDayGan && tempDayZhi && tempHourGan && tempHourZhi)
    }
    return !!(tempYear && tempMonth && tempDay && tempHour)
  }, [calendarType, tempYear, tempMonth, tempDay, tempHour, tempYearGan, tempYearZhi, tempMonthGan, tempMonthZhi, tempDayGan, tempDayZhi, tempHourGan, tempHourZhi])

  const trueSolarTimeDisplay = useMemo(() => {
    if (!birthDateTime) return '--'

    const lon = parseFloat(longitude) || 120

    // 计算真太阳时所需的公历年月日时分
    let y: number, m: number, d: number, h: number, min: number

    if (birthDateTime.startsWith('四柱-')) {
      // 四柱：反推公历日期（取时辰代表小时）
      // 干支 state 可能未同步，优先从 birthDateTime 字符串解析，缺失时回退 state
      const pillarStr = birthDateTime.replace('四柱-', '')
      const yg = pillarStr[0] || tempYearGan
      const yz = pillarStr[1] || tempYearZhi
      const mg = pillarStr[2] || tempMonthGan
      const mz = pillarStr[3] || tempMonthZhi
      const dg = pillarStr[4] || tempDayGan
      const dz = pillarStr[5] || tempDayZhi
      const hg = pillarStr[6] || tempHourGan
      const hz = pillarStr[7] || tempHourZhi
      if (!yg || !yz || !mg || !mz || !dg || !dz || !hg || !hz) return '--'
      const matches = resolveFourPillarsToSolar(yg, yz, mg, mz, dg, dz, hg, hz)
      if (matches.length === 0) return '--'
      const nowYear = new Date().getFullYear()
      let chosen = matches[0]
      for (const mm of matches) {
        if (mm.year <= nowYear && mm.year > chosen.year) chosen = mm
      }
      y = chosen.year; m = chosen.month; d = chosen.day; h = chosen.hour; min = chosen.minute
    } else {
      const [datePart, timePart] = birthDateTime.split('T')
      if (!datePart || !timePart) return '--'
      const [yy, mm, dd] = datePart.split('-').map(Number)
      const [hh, mi] = timePart.split(':').map(Number)
      if (isNaN(yy) || isNaN(mm) || isNaN(dd) || isNaN(hh)) return '--'
      if (calendarType === '农历') {
        // 农历日期转公历（含闰月）；闰月转换失败时回退非闰月
        let { solarDateTime } = normalizeBirthDateTime('农历', birthDateTime, tempIsLeapMonth)
        if (!solarDateTime && tempIsLeapMonth) {
          solarDateTime = normalizeBirthDateTime('农历', birthDateTime, false).solarDateTime
        }
        if (!solarDateTime) return '--'
        const [sd, st] = solarDateTime.split('T')
        const [sy, sm, sdd] = sd.split('-').map(Number)
        const [sh, smin] = st.split(':').map(Number)
        y = sy; m = sm; d = sdd; h = sh; min = smin
      } else {
        y = yy; m = mm; d = dd; h = hh; min = isNaN(mi) ? 0 : mi
      }
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
  }, [birthDateTime, longitude, calendarType, tempIsLeapMonth, tempYearGan, tempYearZhi, tempMonthGan, tempMonthZhi, tempDayGan, tempDayZhi, tempHourGan, tempHourZhi])

  const formatDisplay = useCallback(() => {
    if (!birthDateTime) return '请选择出生时间'

    if (calendarType === '四柱') {
      const pillarStr = birthDateTime.startsWith('四柱-') ? birthDateTime.replace('四柱-', '') : `${tempYearGan}${tempYearZhi}${tempMonthGan}${tempMonthZhi}${tempDayGan}${tempDayZhi}${tempHourGan}${tempHourZhi}`
      return `四柱 ${pillarStr.slice(0, 2)}年 ${pillarStr.slice(2, 4)}月 ${pillarStr.slice(4, 6)}日 ${pillarStr.slice(6, 8)}时`
    }

    const [datePart, timePart] = birthDateTime.split('T')
    const [y, m, d] = datePart.split('-')
    const [h, min] = (timePart || '00:00').split(':')

    if (calendarType === '农历') {
      // 农历中文格式：2026丙午年七月初五亥时
      const ly = parseInt(y, 10)
      const lm = parseInt(m, 10)
      const ld = parseInt(d, 10)
      const lh = parseInt(h, 10)
      if ([ly, lm, ld, lh].some(Number.isNaN)) return `${y}年${m}月${d}日 ${h}:${min}`
      try {
        // 闰月用负数表示
        const effectiveMonth = tempIsLeapMonth ? -lm : lm
        const lunar = Lunar.fromYmdHms(ly, effectiveMonth, ld, lh, 0, 0)
        const ganzhi = lunar.getYearInGanZhi()
        // getMonthInChinese 返回如「七」「闰七」，需补「月」字
        const monthName = `${lunar.getMonthInChinese()}月`
        const dayName = lunar.getDayInChinese()
        const timeZhi = lunar.getTimeZhi()
        return `${ly}${ganzhi}年${monthName}${dayName}${timeZhi}时`
      } catch {
        return `${y}年${m}月${d}日 ${h}:${min}`
      }
    }

    // 公历
    return `公历 ${y}年${m}月${d}日 ${h}:${min}`
  }, [birthDateTime, calendarType, tempIsLeapMonth, tempYearGan, tempYearZhi, tempMonthGan, tempMonthZhi, tempDayGan, tempDayZhi, tempHourGan, tempHourZhi])

  const handleQuickInput = () => {
    const val = quickInput.trim()
    if (!/^\d+$/.test(val)) return
    // 农历格式：YYYYMMDDhh（年月日时，8 位，无分钟）；公历格式：YYYYMMDDhhmm（12 位）
    if (calendarType === '农历') {
      if (val.length !== 8) return
      const y = val.substring(0, 4)
      const m = val.substring(4, 6)
      const d = val.substring(6, 8)
      // 任意小时映射到时辰代表小时（子=00,丑=02,…,亥=22），与 hourOptions 的 value 一致
      const rawHour = parseInt(val.substring(8, 10), 10)
      const shichenIdx = Math.floor(((isNaN(rawHour) ? 0 : rawHour) + 1) / 2) % 12
      const h = String(shichenIdx * 2).padStart(2, '0')
      setTempYear(y)
      setTempMonth(m)
      setTempDay(d)
      setTempHour(h)
      setTempMinute('00')
    } else {
      if (val.length < 8) return
      const y = val.substring(0, 4)
      // 全部统一为补零格式(01-12/01-31/00-24/00-59)，与 monthOptions/dayOptions/hourOptions/minuteOptions 的 value 一致
      const m = val.substring(4, 6)
      const d = val.substring(6, 8)
      const h = val.substring(8, 10) || '00'
      const min = val.substring(10, 12) || '00'
      setTempYear(y)
      setTempMonth(m)
      setTempDay(d)
      setTempHour(h)
      setTempMinute(min)
    }
    setQuickInput('')
  }

  const openDateTimeModal = () => {
    // 把任意小时数映射到「时辰代表小时」（子=00,丑=02,…,亥=22），用于农历模式定位
    const toShichenHour = (hour: number): string => {
      const idx = Math.floor((hour + 1) / 2) % 12
      return String(idx * 2).padStart(2, '0')
    }
    if (!birthDateTime) {
      const now = new Date()
      setTempYear(String(now.getFullYear()))
      setTempMonth(String(now.getMonth() + 1).padStart(2, '0'))
      setTempDay(String(now.getDate()).padStart(2, '0'))
      const nowHour = now.getHours()
      setTempHour(calendarType === '农历' ? toShichenHour(nowHour) : (nowHour === 0 ? '24' : String(nowHour).padStart(2, '0')))
      setTempMinute(String(now.getMinutes()).padStart(2, '0'))
    } else if (!birthDateTime.startsWith('四柱-')) {
      const [datePart, timePart] = birthDateTime.split('T')
      const [y, m, d] = datePart.split('-')
      const [h, min] = (timePart || '00:00').split(':')
      setTempYear(y)
      setTempMonth(m)
      setTempDay(d)
      if (calendarType === '农历') {
        setTempHour(toShichenHour(parseInt(h, 10)))
      } else {
        setTempHour(h === '00' ? '24' : h)
      }
      setTempMinute(min)
    }
    setShowDateTimeModal(true)
  }

  const confirmDateTime = () => {
    if (!isDtFormValid) return

    if (calendarType === '四柱') {
      const pillarStr = `${tempYearGan}${tempYearZhi}${tempMonthGan}${tempMonthZhi}${tempDayGan}${tempDayZhi}${tempHourGan}${tempHourZhi}`
      setBirthDateTime(`四柱-${pillarStr}`)
    } else {
      const dateStr = `${tempYear}-${tempMonth.padStart(2, '0')}-${tempDay.padStart(2, '0')}`
      const hourStr = tempHour === '24' ? '00' : tempHour.padStart(2, '0')
      const minStr = calendarType === '农历' ? '00' : (tempMinute || '00').padStart(2, '0')
      const timeStr = `${hourStr}:${minStr}`
      setBirthDateTime(`${dateStr}T${timeStr}`)
    }
    setShowDateTimeModal(false)
  }

  const handleCalendarTypeChange = (target: CalendarType) => {
    if (target === calendarType) return

    // 无日期时仅切换类型
    if (!birthDateTime) {
      setCalendarType(target)
      return
    }

    // 四柱 → 公历/农历：反推公历日期
    if (calendarType === '四柱') {
      // 干支 state 可能未同步，优先从 birthDateTime 字符串解析，缺失时回退 state
      const pillarStr = birthDateTime.startsWith('四柱-') ? birthDateTime.replace('四柱-', '') : ''
      const yg = pillarStr[0] || tempYearGan
      const yz = pillarStr[1] || tempYearZhi
      const mg = pillarStr[2] || tempMonthGan
      const mz = pillarStr[3] || tempMonthZhi
      const dg = pillarStr[4] || tempDayGan
      const dz = pillarStr[5] || tempDayZhi
      const hg = pillarStr[6] || tempHourGan
      const hz = pillarStr[7] || tempHourZhi
      if (!yg || !yz || !mg || !mz || !dg || !dz || !hg || !hz) {
        setCalendarType(target)
        return
      }
      const matches = resolveFourPillarsToSolar(yg, yz, mg, mz, dg, dz, hg, hz)
      if (matches.length === 0) {
        setCalendarType(target)
        return
      }
      const nowYear = new Date().getFullYear()
      let chosen = matches[0]
      for (const mm of matches) {
        if (mm.year <= nowYear && mm.year > chosen.year) chosen = mm
      }
      const solar = Solar.fromYmdHms(chosen.year, chosen.month, chosen.day, chosen.hour, chosen.minute, 0)
      if (target === '公历') {
        setBirthDateTime(
          `${chosen.year}-${String(chosen.month).padStart(2, '0')}-${String(chosen.day).padStart(2, '0')}T${String(chosen.hour).padStart(2, '0')}:${String(chosen.minute).padStart(2, '0')}`,
        )
      } else {
        // 四柱 → 农历
        const lunar = solar.getLunar()
        const lm = lunar.getMonth()
        setBirthDateTime(
          `${lunar.getYear()}-${String(Math.abs(lm)).padStart(2, '0')}-${String(lunar.getDay()).padStart(2, '0')}T${String(lunar.getHour()).padStart(2, '0')}:00`,
        )
        setTempIsLeapMonth(lm < 0)
      }
      setCalendarType(target)
      return
    }

    // 解析当前年月日时分（公历或农历的 birthDateTime 都是 YYYY-MM-DDTHH:mm）
    const [datePart, timePart] = birthDateTime.split('T')
    if (!datePart || !timePart) {
      setCalendarType(target)
      return
    }
    const [y, m, d] = datePart.split('-').map(Number)
    const [h, min] = timePart.split(':').map(Number)
    if ([y, m, d, h].some(Number.isNaN)) {
      setCalendarType(target)
      return
    }

    // 公历 ↔ 农历 互转
    const isFromLunar = calendarType === '农历'
    const isToLunar = target === '农历'

    if (isFromLunar && !isToLunar) {
      // 农历 → 公历
      const lunar = Lunar.fromYmdHms(y, tempIsLeapMonth ? -m : m, d, h, isNaN(min) ? 0 : min, 0)
      const solar = lunar.getSolar()
      const sy = solar.getYear(), sm = solar.getMonth(), sd = solar.getDay()
      const sh = solar.getHour(), smin = solar.getMinute()
      if (target === '公历') {
        setBirthDateTime(`${sy}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}T${String(sh).padStart(2, '0')}:${String(smin).padStart(2, '0')}`)
      } else {
        // 农历 → 四柱
        const ec = solar.getLunar().getEightChar()
        setTempYearGan(ec.getYearGan()); setTempYearZhi(ec.getYearZhi())
        setTempMonthGan(ec.getMonthGan()); setTempMonthZhi(ec.getMonthZhi())
        setTempDayGan(ec.getDayGan()); setTempDayZhi(ec.getDayZhi())
        setTempHourGan(ec.getTimeGan()); setTempHourZhi(ec.getTimeZhi())
        setBirthDateTime(`四柱-${ec.getYearGan()}${ec.getYearZhi()}${ec.getMonthGan()}${ec.getMonthZhi()}${ec.getDayGan()}${ec.getDayZhi()}${ec.getTimeGan()}${ec.getTimeZhi()}`)
      }
    } else if (!isFromLunar && isToLunar) {
      // 公历 → 农历
      const solar = Solar.fromYmdHms(y, m, d, h, isNaN(min) ? 0 : min, 0)
      const lunar = solar.getLunar()
      const lm = lunar.getMonth()
      setBirthDateTime(`${lunar.getYear()}-${String(Math.abs(lm)).padStart(2, '0')}-${String(lunar.getDay()).padStart(2, '0')}T${String(lunar.getHour()).padStart(2, '0')}:00`)
      setTempIsLeapMonth(lm < 0)
    } else if (calendarType === '公历' && target === '四柱') {
      // 公历 → 四柱
      const solar = Solar.fromYmdHms(y, m, d, h, isNaN(min) ? 0 : min, 0)
      const ec = solar.getLunar().getEightChar()
      setTempYearGan(ec.getYearGan()); setTempYearZhi(ec.getYearZhi())
      setTempMonthGan(ec.getMonthGan()); setTempMonthZhi(ec.getMonthZhi())
      setTempDayGan(ec.getDayGan()); setTempDayZhi(ec.getDayZhi())
      setTempHourGan(ec.getTimeGan()); setTempHourZhi(ec.getTimeZhi())
      setBirthDateTime(`四柱-${ec.getYearGan()}${ec.getYearZhi()}${ec.getMonthGan()}${ec.getMonthZhi()}${ec.getDayGan()}${ec.getDayZhi()}${ec.getTimeGan()}${ec.getTimeZhi()}`)
    }

    setCalendarType(target)
  }

  const handleSelectArchive = (archive: ArchiveItem) => {
    setName(archive.name)
    setGender((archive.gender as '男' | '女') || '男')
    setBirthDateTime(fixDateTimeFormat(archive.birth_datetime || ''))
    setBirthplace(archive.birthplace || '')
    // 四柱录入方式已移除，历史四柱档案回退到「公历」
    const archiveType = (archive.calendar_type as CalendarType) || calendarTypes[0]
    setCalendarType(archiveType === '四柱' ? calendarTypes[0] : archiveType)
    setSelectedGroup(archive.group_name || '全部')

    // 从 bazi_result 元数据恢复四柱干支 / 农历闰月信息，
    // 确保从档案选择后重新排盘结果正确。
    const meta = (archive.bazi_result as { __birth_meta__?: BirthMeta } | null)?.__birth_meta__
    if (meta?.pillars) {
      setTempYearGan(meta.pillars.yearGan)
      setTempYearZhi(meta.pillars.yearZhi)
      setTempMonthGan(meta.pillars.monthGan)
      setTempMonthZhi(meta.pillars.monthZhi)
      setTempDayGan(meta.pillars.dayGan)
      setTempDayZhi(meta.pillars.dayZhi)
      setTempHourGan(meta.pillars.hourGan)
      setTempHourZhi(meta.pillars.hourZhi)
    }
    if (meta?.isLeapMonth !== undefined) {
      setTempIsLeapMonth(meta.isLeapMonth)
    }

    setSelectedFromArchive(null)
  }

  const doSave = async (overwrite: boolean) => {
    // 保留原始历法类型与日期数值，农历的闰月/四柱干支等信息存入 bazi_result 元数据，
    // 供从档案读取后正确还原排盘。
    const meta: BirthMeta = {}
    if (calendarType === '农历') {
      meta.isLeapMonth = !!tempIsLeapMonth
    }
    if (calendarType === '四柱') {
      meta.pillars = {
        yearGan: tempYearGan,
        yearZhi: tempYearZhi,
        monthGan: tempMonthGan,
        monthZhi: tempMonthZhi,
        dayGan: tempDayGan,
        dayZhi: tempDayZhi,
        hourGan: tempHourGan,
        hourZhi: tempHourZhi,
      }
    }
    const birthMetaRecord: Record<string, unknown> = {
      __birth_meta__: { ...meta, originalCalendarType: calendarType },
    }
    return saveArchive(
      {
        name: name.trim(),
        gender,
        birth_datetime: birthDateTime,
        birthplace,
        calendar_type: calendarType,
        group_name: selectedGroup,
        bazi_result: birthMetaRecord,
      },
      overwrite,
    )
  }

  const saveNow = async (overwrite: boolean) => {
    setSaveStatus('saving')
    setSaveError('')
    try {
      const saved = await doSave(overwrite)
      if (saved) {
        setSaveStatus('saved')
        // 「已保存」提示 2 秒后自动恢复为「保存」
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          setSaveStatus('idle')
          saveTimerRef.current = null
        }, 2000)
      } else {
        setSaveStatus('error')
        setSaveError('保存失败，请稍后重试')
      }
    } catch (e) {
      const msg = getErrorMessage(e)
      // 姓名重复：弹出友好确认框
      if (msg.includes('已存在') || msg.includes('不能重复')) {
        setShowOverwriteConfirm(true)
        setSaveStatus('idle')
        setSaveError('')
        return
      }
      setSaveStatus('error')
      setSaveError(friendlySaveError(msg))
    }
  }

  const handleSave = async () => {
    if (!name.trim() || !birthDateTime) return
    if (!isLoggedIn) {
      openLoginModal()
      return
    }
    await saveNow(false)
  }

  const handleOverwriteConfirm = async () => {
    setShowOverwriteConfirm(false)
    await saveNow(true)
  }

  const handleOverwriteCancel = () => {
    setShowOverwriteConfirm(false)
    setSaveStatus('idle')
    setSaveError('')
  }

  const handleSubmit = async () => {
    if (!name.trim() || !birthDateTime) return
    setSubmitting(true)

    const info: BirthInfo = {
      name: name.trim(),
      gender,
      calendarType,
      birthDateTime,
      birthplace,
      longitude: parseFloat(longitude) || 120,
      selectedGroup,
      isLeapMonth: calendarType === '农历' ? tempIsLeapMonth : undefined,
      yearGan: tempYearGan,
      yearZhi: tempYearZhi,
      monthGan: tempMonthGan,
      monthZhi: tempMonthZhi,
      dayGan: tempDayGan,
      dayZhi: tempDayZhi,
      hourGan: tempHourGan,
      hourZhi: tempHourZhi,
    }

    onSubmit(info)
    setSubmitting(false)
  }

  const isValid = name.trim() && birthDateTime

  return (
    <>
      {title && (
        <div className="bazi-form-header">
          <h2 className="bazi-form-title">{title}</h2>
          {description && <p className="bazi-form-desc">{description}</p>}
        </div>
      )}

      <div className="bazi-form-row">
        <label className="bazi-form-label">姓名</label>
        <div className="bazi-name-input-group">
          <input
            type="text"
            className="bazi-form-input"
            placeholder="请输入姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {showArchive && (
            <button
              type="button"
              className="bazi-archive-pick-btn"
              onClick={() => setShowArchivePicker(true)}
              title="从档案库中选择"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                <path d="M9 18a2 2 0 0 1-2-2V2h10l4 4v10a2 2 0 0 1-2 2h-3" />
                <path d="M3 7v14a2 2 0 0 0 2 2h12" />
                <path d="M14 22v-4a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {selectedFromArchive && (
        <div className="bazi-archive-selected">
          <div className="bazi-archive-selected-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
              <path d="M9 18a2 2 0 0 1-2-2V2h10l4 4v10a2 2 0 0 1-2 2h-3" />
              <path d="M3 7v14a2 2 0 0 0 2 2h12" />
              <path d="M14 22v-4a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4" />
            </svg>
            <span className="bazi-archive-selected-name">{selectedFromArchive.name}</span>
            <span className="bazi-archive-selected-meta">
              {selectedFromArchive.gender} · {formatArchiveBirth(selectedFromArchive.birth_datetime, selectedFromArchive.calendar_type, selectedFromArchive.bazi_result)}
              {selectedFromArchive.birthplace ? ` · ${selectedFromArchive.birthplace}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="bazi-archive-deselect-btn"
            onClick={() => {
              setSelectedFromArchive(null)
              setName('')
              setGender('男')
              setBirthDateTime('')
              setBirthplace('')
              setCalendarType(calendarTypes[0])
              setSelectedGroup('全部')
            }}
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

      <div className="bazi-form-row">
        <label className="bazi-form-label">性别</label>
        <div className="bazi-gender-calendar-group">
          <div className="bazi-gender-toggle">
            <button
              type="button"
              className={`bazi-gender-btn${gender === '男' ? ' active' : ''}`}
              onClick={() => setGender('男')}
            >
              男
            </button>
            <button
              type="button"
              className={`bazi-gender-btn${gender === '女' ? ' active' : ''}`}
              onClick={() => setGender('女')}
            >
              女
            </button>
          </div>
          <div className="bazi-calendar-toggle">
            {calendarTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`bazi-calendar-btn${calendarType === t ? ' active' : ''}`}
                onClick={() => handleCalendarTypeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bazi-form-row">
        <label className="bazi-form-label">出生时间</label>
        <div className="bazi-datetime-picker">
          <input
            ref={dateInputRef}
            type="hidden"
            className="bazi-datetime-input"
            value={birthDateTime}
            step="3600"
          />
          <div
            className="bazi-datetime-display"
            onClick={openDateTimeModal}
          >
            {formatDisplay()}
          </div>
        </div>
      </div>

      {showBirthplace && (
        <div className="bazi-form-row bazi-location-row">
          <label className="bazi-form-label">出生地点</label>
          <div className="bazi-location-wrapper">
            <div className="bazi-location-input">
              <input
                type="text"
                className="bazi-form-input"
                placeholder=""
                value={birthplace}
                onChange={(e) => setBirthplace(e.target.value)}
              />
              <button
                type="button"
                className="bazi-location-btn"
                title="选择地点"
                onClick={() => setShowCityPicker(!showCityPicker)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </button>
            </div>
            <RegionPicker
              open={showCityPicker}
              onClose={() => setShowCityPicker(false)}
              onSelect={(fullPath) => {
                setBirthplace(fullPath)
                setShowCityPicker(false)
              }}
            />
          </div>
        </div>
      )}

      {showBirthplace && (
        <div className="bazi-info-panel">
          <div className="bazi-info-row">
            <span className="bazi-info-label">真太阳时</span>
            <span className="bazi-info-value">{trueSolarTimeDisplay}</span>
          </div>
          <div className="bazi-info-row">
            <span className="bazi-info-label">地址经纬</span>
            <span className="bazi-info-value">北纬{(latitude ? parseFloat(latitude).toFixed(4) : '--')} 东经{(longitude ? parseFloat(longitude).toFixed(4) : '--')}</span>
          </div>
        </div>
      )}

      <div className="bazi-save-row">
        <div className="bazi-form-row bazi-form-row-inline">
          <label className="bazi-form-label">分组</label>
          <GroupSelector
            selectedGroup={selectedGroup}
            onGroupChange={setSelectedGroup}
            isOpen={showGroupPicker}
            onToggle={() => setShowGroupPicker(!showGroupPicker)}
          />
        </div>

        <button
          type="button"
          className={`bazi-save-btn${saveStatus === 'saved' ? ' active' : ''}`}
          onClick={handleSave}
          disabled={!isValid || saveStatus === 'saving'}
          title={isValid ? '保存到档案库' : '请先完善姓名和出生时间'}
        >
          <span className="bazi-save-btn-icon">
            {saveStatus === 'saved' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : null}
          </span>
          <span className="bazi-save-btn-label">
            {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存'}
          </span>
        </button>
        {saveStatus === 'error' && (
          <span className="bazi-save-indicator error">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {saveError || '保存失败，请重试'}
          </span>
        )}
      </div>

      <button
        type="button"
        className="bazi-submit-btn"
        disabled={!isValid || submitting}
        onClick={handleSubmit}
      >
        {submitting ? '排盘中...' : submitLabel}
      </button>

      <ArchivePickerModal
        isOpen={showArchivePicker && showArchive}
        onClose={() => setShowArchivePicker(false)}
        onSelectArchive={handleSelectArchive}
      />

      {showDateTimeModal && (
        <DateTimeModal
          calendarType={calendarType}
          tempYear={tempYear}
          tempMonth={tempMonth}
          tempIsLeapMonth={tempIsLeapMonth}
          leapMonthOfYear={leapMonthOfYear}
          tempDay={tempDay}
          tempHour={tempHour}
          tempMinute={tempMinute}
          tempYearGan={tempYearGan}
          tempYearZhi={tempYearZhi}
          tempMonthGan={tempMonthGan}
          tempMonthZhi={tempMonthZhi}
          tempDayGan={tempDayGan}
          tempDayZhi={tempDayZhi}
          tempHourGan={tempHourGan}
          tempHourZhi={tempHourZhi}
          onTempYearChange={setTempYear}
          onTempMonthChange={setTempMonth}
          onTempIsLeapMonthChange={setTempIsLeapMonth}
          onTempDayChange={setTempDay}
          onTempHourChange={setTempHour}
          onTempMinuteChange={setTempMinute}
          onTempYearGanChange={setTempYearGan}
          onTempYearZhiChange={setTempYearZhi}
          onTempMonthGanChange={setTempMonthGan}
          onTempMonthZhiChange={setTempMonthZhi}
          onTempDayGanChange={setTempDayGan}
          onTempDayZhiChange={setTempDayZhi}
          onTempHourGanChange={setTempHourGan}
          onTempHourZhiChange={setTempHourZhi}
          quickInput={quickInput}
          onQuickInputChange={setQuickInput}
          onQuickInputConfirm={handleQuickInput}
          isDtFormValid={isDtFormValid}
          onConfirm={confirmDateTime}
          onClose={() => setShowDateTimeModal(false)}
        />
      )}

      <ConfirmDialog
        open={showOverwriteConfirm}
        title="姓名已存在"
        message={`档案库中已存在姓名「${name.trim()}」的档案。是否用当前信息覆盖原档案？覆盖后原档案将被更新。`}
        confirmText="覆盖保存"
        cancelText="取消"
        danger
        onConfirm={handleOverwriteConfirm}
        onCancel={handleOverwriteCancel}
      />
    </>
  )
}