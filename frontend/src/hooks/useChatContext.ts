import { useContext } from 'react'
import { ChatContext } from '../context/ChatContext'
import type { ChatContextValue } from '../context/ChatContext'

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) {
    throw new Error('useChatContext must be used within ChatProvider')
  }
  return ctx
}