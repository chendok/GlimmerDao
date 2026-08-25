import { createContext } from 'react'
import type { Message, SessionInfo, Theme, ModelMode } from '../types'

export type FeatureKey =
  | '四柱八字' | '黄历择吉'
  | '麻衣神相' | '六爻占卜' | '梅花易数'
  | '紫微斗数' | '档案库' | '知识库' | '系统管理'

export interface ChatContextValue {
  // Theme
  theme: Theme
  setTheme: (t: Theme) => void

  // Sessions
  sessionId: string
  sessions: SessionInfo[]
  sessionsHasMore: boolean
  sessionsLoading: boolean

  // Messages
  messages: Message[]
  loading: boolean
  error: string
  setError: (e: string) => void

  // Actions
  sendMessage: (content: string, contextData?: string, skillId?: string) => Promise<void>
  stopGeneration: () => void
  resetSession: () => void
  switchSession: (s: SessionInfo) => void
  deleteSession: (sid: string) => void
  clearAllSessions: () => Promise<boolean>
  clearingAll: boolean
  copyToClipboard: (content: string) => Promise<void>
  searchSessions: (q: string) => void
  loadMoreSessions: () => void

  // Model
  modelMode: ModelMode
  setModelMode: (m: ModelMode) => void

  // Feature (split-screen)
  selectedFeature: FeatureKey | null
  setSelectedFeature: (f: FeatureKey | null) => void

  // Refs
  chatWindowRef: React.RefObject<HTMLDivElement>
  abortControllerRef: React.RefObject<AbortController | null>
}

export const ChatContext = createContext<ChatContextValue | null>(null)