import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { getErrorMessage } from '../utils/helpers'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { useAuth } from './AuthContext'

export interface ArchiveItem {
  id: number
  user_id: number
  name: string
  gender: string
  birth_datetime: string
  birthplace: string | null
  calendar_type: string
  group_name: string | null
  bazi_result: Record<string, unknown> | null
  supplemental_info?: string | null
  report_count?: number
  created_at: string
  updated_at: string
}

export interface ArchiveListResponse {
  total: number
  page: number
  page_size: number
  items: ArchiveItem[]
}

interface ArchiveContextValue {
  archives: ArchiveItem[]
  total: number
  loading: boolean
  saveArchive: (data: Omit<ArchiveItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>, overwrite?: boolean) => Promise<ArchiveItem | null>
  updateArchive: (id: number, data: Omit<ArchiveItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<ArchiveItem | null>
  fetchArchives: (keyword?: string, group?: string, page?: number, page_size?: number, signal?: AbortSignal) => Promise<void>
  deleteArchive: (id: number) => Promise<boolean>
  batchDeleteArchives: (ids: number[]) => Promise<boolean>
}

const ArchiveContext = createContext<ArchiveContextValue | null>(null)

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, openLoginModal } = useAuth()
  const [archives, setArchives] = useState<ArchiveItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchArchives = useCallback(async (keyword?: string, group?: string, page: number = 1, page_size: number = 20, signal?: AbortSignal) => {
    const token = getToken()
    if (!token) {
      setArchives([])
      setTotal(0)
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('page_size', String(page_size))
      if (keyword) params.append('keyword', keyword)
      if (group) params.append('group', group)

      const res = await fetch(`${API_BASE}/archives/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
      if (!res.ok) {
        throw new Error('获取档案列表失败')
      }
      const data: ArchiveListResponse = await res.json()
      setArchives(data.items)
      setTotal(data.total)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setArchives([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveArchive = useCallback(async (data: Omit<ArchiveItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>, overwrite: boolean = false) => {
    if (!isLoggedIn) {
      openLoginModal()
      return null
    }

    const token = getToken()
    if (!token) return null

    try {
      const res = await fetch(`${API_BASE}/archives/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: data.name,
          gender: data.gender,
          birth_datetime: data.birth_datetime,
          birthplace: data.birthplace,
          calendar_type: data.calendar_type,
          group_name: data.group_name,
          bazi_result: data.bazi_result,
          supplemental_info: data.supplemental_info,
          overwrite,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || getErrorMessage(err) || `保存失败 (HTTP ${res.status})`)
      }
      const saved: ArchiveItem = await res.json()
      setArchives((prev) => [saved, ...prev])
      setTotal((t) => t + 1)
      return saved
    } catch (e: unknown) {
      console.error('Save archive failed:', getErrorMessage(e))
      throw e
    }
  }, [isLoggedIn, openLoginModal])

  const deleteArchive = useCallback(async (id: number) => {
    const token = getToken()
    if (!token) return false

    try {
      const res = await fetch(`${API_BASE}/archives/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('删除失败')
      setArchives((prev) => prev.filter((a) => a.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      return true
    } catch {
      return false
    }
  }, [])

  const updateArchive = useCallback(async (id: number, data: Omit<ArchiveItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    const token = getToken()
    if (!token) return null

    try {
      const res = await fetch(`${API_BASE}/archives/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: data.name,
          gender: data.gender,
          birth_datetime: data.birth_datetime,
          birthplace: data.birthplace,
          calendar_type: data.calendar_type,
          group_name: data.group_name,
          bazi_result: data.bazi_result,
          supplemental_info: data.supplemental_info,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `更新失败 (HTTP ${res.status})`)
      }
      const updated: ArchiveItem = await res.json()
      setArchives((prev) => prev.map((a) => (a.id === id ? updated : a)))
      return updated
    } catch (e: unknown) {
      console.error('Update archive failed:', getErrorMessage(e))
      throw e
    }
  }, [])

  const batchDeleteArchives = useCallback(async (ids: number[]) => {
    const token = getToken()
    if (!token) return false

    try {
      const res = await fetch(`${API_BASE}/archives/batch-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('批量删除失败')
      setArchives((prev) => prev.filter((a) => !ids.includes(a.id)))
      setTotal((t) => Math.max(0, t - ids.length))
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <ArchiveContext.Provider value={{ archives, total, loading, saveArchive, updateArchive, fetchArchives, deleteArchive, batchDeleteArchives }}>
      {children}
    </ArchiveContext.Provider>
  )
}

export function useArchive() {
  const ctx = useContext(ArchiveContext)
  if (!ctx) throw new Error('useArchive must be used within ArchiveProvider')
  return ctx
}
