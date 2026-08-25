/**
 * 档案新增/编辑表单弹窗
 *
 * 从 ArchiveManager.tsx 迁移表单逻辑，包含：
 * - 基本信息表单（姓名/性别/历法/出生时间/出生地/分组）
 * - 日期时间选择器（公历/农历/四柱三种模式）
 * - 城市选择器
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { getErrorMessage } from '../utils/helpers'
import ReactDOM from 'react-dom'
import { useArchive, type ArchiveItem } from '../context/ArchiveContext'
import PickerColumn from './PickerColumn'
import RegionPicker from './RegionPicker'

interface ArchiveFormModalProps {
  isOpen: boolean
  editingId: number | null
  initialData?: ArchiveItem | null
  onClose: () => void
  onSuccess?: (archive: ArchiveItem) => void
}

interface FormData {
  name: string
  gender: string
  birth_datetime: string
  birthplace: string
  calendar_type: string
  group_name: string
}

const GROUPS = ['家人', '朋友', '客户', '其他']

const emptyForm: FormData = {
  name: '',
  gender: '男',
  birth_datetime: '',
  birthplace: '',
  calendar_type: '公历',
  group_name: '家人',
}

export default function ArchiveFormModal({ isOpen, editingId, initialData, onClose, onSuccess }: ArchiveFormModalProps) {
  const { saveArchive, updateArchive } = useArchive()
  const [formData, setFormData] = useState<FormData>(() => {
    if (initialData) {
      return {
        name: initialData.name,
        gender: initialData.gender,
        birth_datetime: fixDateTimeFormat(initialData.birth_datetime),
        birthplace: initialData.birthplace || '',
        // 四柱录入方式已移除，历史四柱档案编辑时回退到「公历」
        calendar_type: initialData.calendar_type === '四柱' ? '公历' : initialData.calendar_type,
        group_name: initialData.group_name || '全部',
      }
    }
    return { ...emptyForm }
  })
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [showDateTimeModal, setShowDateTimeModal] = useState(false)
  const [showCityPicker, setShowCityPicker] = useState(false)

  // 日期时间选择器临时状态
  const [tempYear, setTempYear] = useState('')
  const [tempMonth, setTempMonth] = useState('')
  const [tempDay, setTempDay] = useState('')
  const [tempHour, setTempHour] = useState('12')
  const [tempMinute, setTempMinute] = useState('00')
  const [quickInput, setQuickInput] = useState('')
  const [tempYearGan, setTempYearGan] = useState('')
  const [tempYearZhi, setTempYearZhi] = useState('')
  const [tempMonthGan, setTempMonthGan] = useState('')
  const [tempMonthZhi, setTempMonthZhi] = useState('')
  const [tempDayGan, setTempDayGan] = useState('')
  const [tempDayZhi, setTempDayZhi] = useState('')
  const [tempHourGan, setTempHourGan] = useState('')
  const [tempHourZhi, setTempHourZhi] = useState('')

  function fixDateTimeFormat(dateTime: string): string {
    if (!dateTime || !dateTime.includes('T')) return dateTime
    const [datePart, timePart] = dateTime.split('T')
    const [y, m, d] = datePart.split('-')
    const [h, min] = (timePart || '00:00').split(':')
    return `${y}-${String(parseInt(m, 10)).padStart(2, '0')}-${String(parseInt(d, 10)).padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${(min || '00').padStart(2, '0')}`
  }

  // ── 弹窗打开时根据 initialData 重新初始化表单 ──
  // useState 初始化函数仅在组件首次挂载时执行一次，而本组件通过 if(!isOpen) return null
  // 控制显隐（组件实例不会卸载），因此需要在 isOpen/editingId 变化时手动同步表单数据
  useEffect(() => {
    if (!isOpen) return
    if (editingId !== null && initialData) {
      setFormData({
        name: initialData.name,
        gender: initialData.gender,
        birth_datetime: fixDateTimeFormat(initialData.birth_datetime),
        birthplace: initialData.birthplace || '',
        // 四柱录入方式已移除，历史四柱档案编辑时回退到「公历」
        calendar_type: initialData.calendar_type === '四柱' ? '公历' : initialData.calendar_type,
        group_name: initialData.group_name || '全部',
      })
    } else {
      setFormData({ ...emptyForm })
    }
    setFormErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingId])

  // ── Picker 选项 ──
  const yearOptions = useMemo(() => {
    if (formData.calendar_type === '农历') {
      const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
      const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
      const ganzhi60 = Array.from({ length: 60 }, (_, i) => `${GAN[i % 10]}${ZHI[i % 12]}`)
      return Array.from({ length: 101 }, (_, i) => {
        const y = 1950 + i
        return { value: String(y), label: `${y} ${ganzhi60[(y - 4) % 60]}` }
      })
    }
    return Array.from({ length: 201 }, (_, i) => {
      const y = 1950 + i
      return { value: String(y), label: String(y) }
    })
  }, [formData.calendar_type])

  const monthOptions = useMemo(() => {
    if (formData.calendar_type === '农历') {
      const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
      return lunarMonths.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = (i + 1).toString().padStart(2, '0')
      return { value: m, label: m }
    })
  }, [formData.calendar_type])

  const dayOptions = useMemo(() => {
    const days = formData.calendar_type === '农历' ? 30 : 31
    if (formData.calendar_type === '农历') {
      const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十']
      return lunarDays.slice(0, days).map((d, i) => ({ value: String(i + 1).padStart(2, '0'), label: d }))
    }
    return Array.from({ length: days }, (_, i) => {
      const d = (i + 1).toString().padStart(2, '0')
      return { value: d, label: d }
    })
  }, [formData.calendar_type])

  const hourOptions = useMemo(() => {
    if (formData.calendar_type === '农历') {
      const shichenList = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时']
      return Array.from({ length: 24 }, (_, i) => {
        const h = (i + 1).toString().padStart(2, '0')
        const shichenIdx = Math.floor(i % 24 / 2)
        return { value: h, label: `${h} ${shichenList[shichenIdx]}` }
      })
    }
    return Array.from({ length: 24 }, (_, i) => {
      const h = (i + 1).toString().padStart(2, '0')
      return { value: h, label: h }
    })
  }, [formData.calendar_type])

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

  const isDtFormValid = useMemo(() => {
    if (formData.calendar_type === '四柱') {
      return !!(tempYearGan && tempYearZhi && tempMonthGan && tempMonthZhi &&
        tempDayGan && tempDayZhi && tempHourGan && tempHourZhi)
    }
    return !!(tempYear && tempMonth && tempDay && tempHour)
  }, [formData.calendar_type, tempYear, tempMonth, tempDay, tempHour, tempYearGan, tempYearZhi, tempMonthGan, tempMonthZhi, tempDayGan, tempDayZhi, tempHourGan, tempHourZhi])

  // ── 日期时间弹窗 ──
  const openDateTimeModal = useCallback(() => {
    if (formData.birth_datetime && formData.calendar_type !== '四柱' && formData.birth_datetime.includes('T')) {
      const [datePart, timePart] = formData.birth_datetime.split('T')
      const [y, m, d] = datePart.split('-')
      const [h, min] = (timePart || '00:00').split(':')
      setTempYear(y)
      // 统一为补零格式(01-12/01-31)，与 monthOptions/dayOptions.value 一致
      setTempMonth(m)
      setTempDay(d)
      setTempHour((h || '12') === '00' ? '24' : (h || '12'))
      setTempMinute(min || '00')
    } else {
      const now = new Date()
      setTempYear(String(now.getFullYear()))
      setTempMonth(String(now.getMonth() + 1).padStart(2, '0'))
      setTempDay(String(now.getDate()).padStart(2, '0'))
      const nowHour = now.getHours()
      setTempHour(nowHour === 0 ? '24' : String(nowHour).padStart(2, '0'))
      setTempMinute(String(now.getMinutes()).padStart(2, '0'))
    }
    setQuickInput('')
    setTempYearGan(''); setTempYearZhi('')
    setTempMonthGan(''); setTempMonthZhi('')
    setTempDayGan(''); setTempDayZhi('')
    setTempHourGan(''); setTempHourZhi('')
    setShowDateTimeModal(true)
  }, [formData.birth_datetime, formData.calendar_type])

  const handleQuickInput = () => {
    const val = quickInput.trim()
    if (!/^\d+$/.test(val)) return
    // 农历格式：YYYYMMDDhh（年月日时，8 位，无分钟）；公历格式：YYYYMMDDhhmm（12 位）
    if (formData.calendar_type === '农历') {
      if (val.length !== 8) return
      const y = val.substring(0, 4)
      const m = val.substring(4, 6)
      const d = val.substring(6, 8)
      const h = val.substring(8, 10)
      setTempYear(y); setTempMonth(m); setTempDay(d)
      setTempHour(h); setTempMinute('00')
    } else {
      if (val.length < 8) return
      const y = val.substring(0, 4)
      // 全部统一为补零格式(01-12/01-31/00-24/00-59)，与 monthOptions/dayOptions/hourOptions/minuteOptions 的 value 一致
      const m = val.substring(4, 6)
      const d = val.substring(6, 8)
      const h = val.substring(8, 10) || '00'
      const min = val.substring(10, 12) || '00'
      setTempYear(y); setTempMonth(m); setTempDay(d)
      setTempHour(h); setTempMinute(min)
    }
    setQuickInput('')
  }

  const confirmDateTime = () => {
    if (formData.calendar_type === '四柱') {
      if (!tempYearGan || !tempYearZhi || !tempMonthGan || !tempMonthZhi ||
          !tempDayGan || !tempDayZhi || !tempHourGan || !tempHourZhi) return
      setFormData((f) => ({
        ...f,
        birth_datetime: `${tempYearGan}${tempYearZhi}年${tempMonthGan}${tempMonthZhi}月${tempDayGan}${tempDayZhi}日${tempHourGan}${tempHourZhi}时`,
      }))
    } else {
      if (!tempYear || !tempMonth || !tempDay) return
      const m = tempMonth.padStart(2, '0')
      const d = tempDay.padStart(2, '0')
      const h = (tempHour === '24' ? '00' : (tempHour || '00')).padStart(2, '0')
      const min = formData.calendar_type === '农历' ? '00' : (tempMinute || '00').padStart(2, '0')
      setFormData((f) => ({ ...f, birth_datetime: `${tempYear}-${m}-${d}T${h}:${min}` }))
    }
    setFormErrors((e) => ({ ...e, birth_datetime: undefined }))
    setShowDateTimeModal(false)
  }

  const formatDateTimeDisplay = () => {
    if (!formData.birth_datetime) return '请选择出生时间'
    // 标注录入方式（公历/农历/四柱），让用户能区分
    const prefix = formData.calendar_type === '农历' ? '农历 ' : formData.calendar_type === '四柱' ? '四柱 ' : '公历 '
    if (formData.calendar_type === '四柱') return `${prefix}${formData.birth_datetime}`
    if (!formData.birth_datetime.includes('T') && formData.birth_datetime.length <= 10) {
      return `${prefix}${formData.birth_datetime.replace(/-/g, '年').replace(/(\d{4}年\d{1,2}年)(\d{1,2})/, '$1$2日')}`
    }
    const [datePart, timePart] = formData.birth_datetime.split('T')
    const [year, month, day] = datePart.split('-')
    const time = timePart || '00:00'
    return `${prefix}${year}年${month}月${day}日 ${time}`
  }

  // ── 表单验证与提交 ──
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {}
    if (!formData.name.trim()) errors.name = '请输入姓名'
    if (!formData.gender) errors.gender = '请选择性别'
    if (!formData.birth_datetime.trim()) errors.birth_datetime = '请输入出生时间'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)

    // 保留原始历法类型与日期数值（农历/四柱不转公历），
    // 保证数据库按用户选择的方式存储。
    const data = {
      name: formData.name.trim(),
      gender: formData.gender,
      birth_datetime: fixDateTimeFormat(formData.birth_datetime),
      birthplace: formData.birthplace || null,
      calendar_type: formData.calendar_type,
      group_name: formData.group_name,
      bazi_result: null,
    }

    try {
      if (editingId !== null) {
        const result = await updateArchive(editingId, data)
        if (result) {
          onSuccess?.(result)
          onClose()
        }
      } else {
        const result = await saveArchive(data)
        if (result) {
          onSuccess?.(result)
          onClose()
        }
      }
    } catch (e: unknown) {
      // 姓名重复等后端校验错误，显示在姓名字段下方
      setFormErrors((prev) => ({ ...prev, name: getErrorMessage(e) || '操作失败，请稍后重试' }))
    } finally {
      setFormSubmitting(false)
    }
  }

  if (!isOpen) return null

  return ReactDOM.createPortal(
    <>
      {/* 表单弹窗 */}
      <div className="ak-form-overlay" onClick={onClose}>
        <div className="ak-form-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ak-form-header">
            <h3>{editingId !== null ? '编辑档案' : '新增档案'}</h3>
            <button className="ak-close-btn" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="bazi-form-card" style={{ margin: 0, borderRadius: 0 }}>
            <div className="bazi-form-row">
              <label className="bazi-form-label">姓名 <span className="bazi-required">*</span></label>
              <input
                type="text"
                className={`bazi-form-input${formErrors.name ? ' error' : ''}`}
                value={formData.name}
                onChange={(e) => { setFormData((f) => ({ ...f, name: e.target.value })); setFormErrors((e) => ({ ...e, name: undefined })) }}
                placeholder="请输入姓名"
                maxLength={64}
              />
              {formErrors.name && <span className="bazi-form-error">{formErrors.name}</span>}
            </div>

            <div className="bazi-form-row">
              <label className="bazi-form-label">性别</label>
              <div className="bazi-gender-toggle">
                {['男', '女'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`bazi-gender-btn${formData.gender === g ? ' active' : ''}`}
                    onClick={() => setFormData((f) => ({ ...f, gender: g }))}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="bazi-form-row">
              <label className="bazi-form-label" />
              <div className="bazi-calendar-toggle">
                {(['公历', '农历'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`bazi-calendar-btn${formData.calendar_type === t ? ' active' : ''}`}
                    onClick={() => setFormData((f) => ({ ...f, calendar_type: t }))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bazi-form-row">
              <label className="bazi-form-label">
                出生时间
                <span className="bazi-required">*</span>
              </label>
              <div className="bazi-datetime-picker">
                <input
                  type="hidden"
                  className="bazi-datetime-input"
                  value={formData.birth_datetime}
                  step="3600"
                />
                <div className="bazi-datetime-display" onClick={openDateTimeModal}>
                  {formatDateTimeDisplay()}
                </div>
              </div>
              {formErrors.birth_datetime && <span className="bazi-form-error">{formErrors.birth_datetime}</span>}
            </div>

            <div className="bazi-form-row bazi-location-row">
              <label className="bazi-form-label">出生地点</label>
              <div className="bazi-location-wrapper">
                <div className="bazi-location-input">
                  <input
                    type="text"
                    className="bazi-form-input"
                    placeholder="未知地 北京时间 --"
                    value={formData.birthplace}
                    onChange={(e) => setFormData((f) => ({ ...f, birthplace: e.target.value }))}
                    maxLength={64}
                  />
                  <button
                    type="button"
                    className="bazi-location-btn"
                    title="选择地点"
                    onClick={() => setShowCityPicker(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="bazi-form-row">
              <label className="bazi-form-label">分组</label>
              <select
                className="bazi-form-select"
                value={formData.group_name}
                onChange={(e) => setFormData((f) => ({ ...f, group_name: e.target.value }))}
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="ak-form-footer">
              <button className="am-btn am-btn-ghost" onClick={onClose}>取消</button>
              <button className="bazi-submit-btn" style={{ margin: 0, width: 'auto', padding: 'var(--space-3) var(--space-8)' }} onClick={handleSubmit} disabled={formSubmitting}>
                {formSubmitting ? '提交中...' : (editingId !== null ? '保存修改' : '新增档案')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 日期时间选择弹窗 */}
      {showDateTimeModal && ReactDOM.createPortal(
        <div className="bazi-datetime-overlay" onClick={() => setShowDateTimeModal(false)}>
          <div className="bazi-datetime-modal-picker" onClick={(e) => e.stopPropagation()}>
            <div className="bazi-dt-top-bar">
              <div className="bazi-dt-calendar-toggle">
                {(['公历', '农历'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`bazi-dt-calendar-btn${formData.calendar_type === t ? ' active' : ''}`}
                    onClick={() => setFormData((f) => ({ ...f, calendar_type: t }))}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button type="button" className="bazi-dt-close-btn" onClick={() => setShowDateTimeModal(false)} title="关闭">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {formData.calendar_type !== '四柱' && (
              <div className="bazi-dt-quick-input-row">
                <input
                  type="text"
                  className="bazi-dt-quick-input"
                  placeholder={formData.calendar_type === '农历' ? '输入农历年月日时(格式1993032702)' : '输入出生年月日时分(格式199303270255)'}
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  maxLength={formData.calendar_type === '农历' ? 8 : 12}
                />
                <button type="button" className="bazi-dt-quick-confirm" onClick={handleQuickInput} disabled={quickInput.length < 8}>
                  确定
                </button>
              </div>
            )}

            <div className="bazi-dt-picker-body">
              {(formData.calendar_type === '公历' || formData.calendar_type === '农历') ? (
                <div className="bazi-dt-picker-columns">
                  <PickerColumn label="年" options={yearOptions} value={tempYear} onChange={setTempYear} />
                  <PickerColumn label="月" options={monthOptions} value={tempMonth} onChange={setTempMonth} />
                  <PickerColumn label="日" options={dayOptions} value={tempDay} onChange={setTempDay} />
                  <PickerColumn label="时" options={hourOptions} value={tempHour} onChange={setTempHour} />
                  {formData.calendar_type === '公历' && (
                    <PickerColumn label="分" options={minuteOptions} value={tempMinute} onChange={setTempMinute} />
                  )}
                </div>
              ) : (
                <div className="bazi-dt-picker-columns bazi-dt-picker-pillar">
                  {([
                    { label: '年柱', gan: tempYearGan, setGan: setTempYearGan, zhi: tempYearZhi, setZhi: setTempYearZhi },
                    { label: '月柱', gan: tempMonthGan, setGan: setTempMonthGan, zhi: tempMonthZhi, setZhi: setTempMonthZhi },
                    { label: '日柱', gan: tempDayGan, setGan: setTempDayGan, zhi: tempDayZhi, setZhi: setTempDayZhi },
                    { label: '时柱', gan: tempHourGan, setGan: setTempHourGan, zhi: tempHourZhi, setZhi: setTempHourZhi },
                  ]).map((p) => (
                    <div className="bazi-dt-pillar-group" key={p.label}>
                      <span className="bazi-dt-pillar-group-label">{p.label}</span>
                      <div className="bazi-dt-pillar-group-cols">
                        <PickerColumn label="干" options={ganOptions} value={p.gan} onChange={p.setGan} />
                        <PickerColumn label="支" options={zhiOptions} value={p.zhi} onChange={p.setZhi} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bazi-dt-bottom-bar">
              <button type="button" className="bazi-dt-confirm-btn" onClick={confirmDateTime} disabled={!isDtFormValid}>
                确定
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 城市选择器 */}
      <RegionPicker
        open={showCityPicker}
        onClose={() => setShowCityPicker(false)}
        onSelect={(fullPath) => {
          setFormData((f) => ({ ...f, birthplace: fullPath }))
          setShowCityPicker(false)
        }}
      />
    </>,
    document.body
  )
}
