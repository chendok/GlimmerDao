/**
 * 出生信息表单状态持久化 Hook
 *
 * 四柱八字和紫微斗数共用的 BirthInfoForm 状态持久化。
 * 使用模块级单例 + sessionStorage 存储表单状态，确保在组件卸载/重新挂载时
 * （如切换功能模块、页面刷新）状态不丢失。
 *
 * 支持通过 storageKey 区分不同功能的表单状态。
 */
import { useState, useCallback } from 'react'
import type { CalendarType } from '../components/BirthInfoForm'

export interface BirthInfoFormState {
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

const DEFAULT_STATE: BirthInfoFormState = {
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

const MAX_STORAGE_BYTES = 4 * 1024 * 1024

// 模块级缓存映射：按 storageKey 存储不同功能的表单状态
const _cachedStates: Map<string, BirthInfoFormState> = new Map()

function getStorageKey(featureId: string): string {
  return `glimmerdao_birth_form_${featureId}`
}

function loadFromStorage(storageKey: string): BirthInfoFormState | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
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

function saveToStorage(storageKey: string, state: BirthInfoFormState): boolean {
  try {
    const serialized = JSON.stringify(state)
    if (serialized.length > MAX_STORAGE_BYTES) {
      return false
    }
    sessionStorage.setItem(storageKey, serialized)
    return true
  } catch {
    return false
  }
}

export function clearBirthInfoFormState(featureId: string): void {
  const storageKey = getStorageKey(featureId)
  _cachedStates.delete(storageKey)
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // 忽略
  }
}

/**
 * 出生信息表单状态持久化 Hook
 * @param featureId 功能标识，用于区分不同功能的表单状态（如 'bazi', 'ziwei'）
 */
export function useBirthInfoFormState(featureId: string) {
  const storageKey = getStorageKey(featureId)

  // 初始化：每次都从缓存或 sessionStorage 恢复
  if (!_cachedStates.has(storageKey)) {
    _cachedStates.set(storageKey, loadFromStorage(storageKey) || { ...DEFAULT_STATE })
  }

  const cached = _cachedStates.get(storageKey)!
  const [formState, setFormStateInternal] = useState<BirthInfoFormState>(cached)

  const setFormState = useCallback((updater: BirthInfoFormState | ((prev: BirthInfoFormState) => BirthInfoFormState)) => {
    setFormStateInternal(updater)
    // 立即同步更新缓存
    const current = _cachedStates.get(storageKey) || { ...DEFAULT_STATE }
    if (typeof updater === 'function') {
      const newState = (updater as (prev: BirthInfoFormState) => BirthInfoFormState)(current)
      _cachedStates.set(storageKey, newState)
      saveToStorage(storageKey, newState)
    } else {
      _cachedStates.set(storageKey, { ...updater })
      saveToStorage(storageKey, updater)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId])

  const resetForm = useCallback(() => {
    const newState = { ...DEFAULT_STATE }
    setFormStateInternal(newState)
    _cachedStates.set(storageKey, newState)
    saveToStorage(storageKey, newState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId])

  return {
    formState,
    setFormState,
    resetForm,
  }
}
