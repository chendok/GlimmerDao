/** 共享类型定义 */

export type Message = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  thinking?: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  feedback?: 'good' | 'bad'
  suggestions?: string[]
}

export type ToolCall = {
  name: string
  args: Record<string, unknown>
}

export type ToolResult = {
  name: string
  output: string
}

export type SessionInfo = {
  id: string
  created_at: string
  updated_at?: string
  message_count: number
  preview?: string
  title?: string
}

export type SessionListData = {
  sessions: SessionInfo[]
  total: number
  page: number
  page_size: number
  total_pages: number
  has_more: boolean
}

export type SessionMessageInfo = {
  id: number
  role: string
  content: string
  thinking?: string | null
  tool_calls?: Array<{ name: string; args: Record<string, unknown> }> | null
  tool_results?: Array<{ name: string; output: string }> | null
  created_at: string
}

export type Theme = 'dark' | 'light'

export type ModelMode = 'fast' | 'think'

export type SSEEvent =
  | { event: 'session'; data: string }
  | { event: 'content'; data: string }
  | { event: 'thinking'; data: string }
  | { event: 'tool_call'; data: string }
  | { event: 'tool_start'; data: string }
  | { event: 'tool_end'; data: string }
  | { event: 'response'; data: string }
  | { event: 'done'; data: string }
  | { event: 'error'; data: string }

// ── 认证类型 ──

export type UserInfo = {
  id: number
  username?: string | null
  phone?: string | null
  email?: string | null
  avatar_url?: string | null
  gender?: string | null
  wechat_nickname?: string | null
  is_verified: boolean
  is_admin?: boolean
  created_at?: string | null
}

export type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  user: UserInfo
}