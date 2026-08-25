/**
 * 四柱八字排盘表单状态持久化 Hook
 *
 * 使用模块级单例 + sessionStorage 存储表单状态，确保在组件卸载/重新挂载时
 * （如切换功能模块、页面刷新）状态不丢失。
 */
import { useState, useCallback } from 'react'
import type { CalendarType } from '../components/BirthInfoForm'

export interface BaziFormState {
  name: string
  gender: '男' | '女'
  birthplace: string
  longitude: string
  latitude: string
  calendarType: CalendarType
  selectedGroup: string
  tempYear: string
  tempMonth: string
  tempDay: string
  tempHour: string
  tempMinute: string
  quickInput: string
  tempYearGan: string
  tempYearZhi: string
  tempMonthGan: string
  tempMonthZhi: string
  tempDayGan: string
  tempDayZhi: string
  tempHourGan: string
  tempHourZhi: string
}

const DEFAULT_STATE: BaziFormState = {
  name: '',
  gender: '男',
  birthplace: '',
  longitude: '',
  latitude: '',
  calendarType: '公历',
  selectedGroup: '家人',
  tempYear: '',
  tempMonth: '',
  tempDay: '',
  tempHour: '12',
  tempMinute: '00',
  quickInput: '',
  tempYearGan: '',
  tempYearZhi: '',
  tempMonthGan: '',
  tempMonthZhi: '',
  tempDayGan: '',
  tempDayZhi: '',
  tempHourGan: '',
  tempHourZhi: '',
}

const STORAGE_KEY = 'glimmerdao_bazi_form_state'
const MAX_STORAGE_BYTES = 4 * 1024 * 1024

let _cachedState: BaziFormState | null = null

function loadFromStorage(): BaziFormState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return { ...DEFAULT_STATE, ...parsed }
    }
  } catch {
    // 忽略损坏的存储数据
  }
  return null
}

function saveToStorage(state: BaziFormState): boolean {
  try {
    const serialized = JSON.stringify(state)
    if (serialized.length > MAX_STORAGE_BYTES) {
      return false
    }
    sessionStorage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function clearBaziFormState(): void {
  _cachedState = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}

export function useBaziFormState() {
  // 初始化：每次都从缓存或 sessionStorage 恢复（不使用 _initialized 标志）
  if (!_cachedState) {
    _cachedState = loadFromStorage() || { ...DEFAULT_STATE }
  }

  const [formState, setFormStateInternal] = useState<BaziFormState>(_cachedState)

  const setFormState = useCallback((updater: BaziFormState | ((prev: BaziFormState) => BaziFormState)) => {
    setFormStateInternal(updater)
    // 立即同步更新缓存
    if (_cachedState) {
      if (typeof updater === 'function') {
        _cachedState = (updater as (prev: BaziFormState) => BaziFormState)(_cachedState)
      } else {
        _cachedState = { ...updater }
      }
      // 异步保存到 sessionStorage
      saveToStorage(_cachedState)
    }
  }, [])

  const resetForm = useCallback(() => {
    const newState = { ...DEFAULT_STATE }
    setFormStateInternal(newState)
    _cachedState = newState
    saveToStorage(newState)
  }, [])

  return {
    formState,
    setFormState,
    resetForm,
  }
}
