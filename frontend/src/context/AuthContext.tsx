import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { UserInfo, TokenResponse } from '../types'
import { API_BASE, TOKEN_KEY } from '../utils/constants'
import { getErrorMessage } from '../utils/helpers'

interface AuthContextValue {
  user: UserInfo | null
  token: string | null
  isLoggedIn: boolean
  loginModalOpen: boolean
  loginError: string
  loginLoading: boolean
  openLoginModal: () => void
  closeLoginModal: () => void
  setLoginError: (err: string) => void
  passwordLogin: (account: string, password: string) => Promise<boolean>
  passwordRegister: (account: string, password: string, verificationCode: string) => Promise<boolean>
  resetPassword: (account: string, newPassword: string, verificationCode: string) => Promise<boolean>
  sendEmailCode: (email: string, purpose?: string) => Promise<{ success: boolean; message: string; cooldown: number }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USER_KEY = 'glimmerdao_user'

function loadStoredAuth(): { token: string | null; user: UserInfo | null } {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    const userStr = sessionStorage.getItem(USER_KEY)
    if (token && userStr) {
      return { token, user: JSON.parse(userStr) }
    }
  } catch { /* ignore */ }
  return { token: null, user: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStoredAuth()
  const [user, setUser] = useState<UserInfo | null>(stored.user)
  const [token, setToken] = useState<string | null>(stored.token)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const saveAuth = useCallback((t: string, u: UserInfo) => {
    sessionStorage.setItem(TOKEN_KEY, t)
    sessionStorage.setItem(USER_KEY, JSON.stringify(u))
    setToken(t)
    setUser(u)
  }, [])

  const clearAuth = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const openLoginModal = useCallback(() => {
    setLoginError('')
    setLoginModalOpen(true)
  }, [])

  const closeLoginModal = useCallback(() => {
    setLoginModalOpen(false)
    setLoginError('')
  }, [])

  const handleLoginResponse = useCallback(async (res: Response) => {
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: '请求失败' }))
      let message = '操作失败'
      if (typeof data.detail === 'string') {
        message = data.detail
      } else if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0]
        if (first && typeof first === 'object' && first.msg) {
          message = first.msg
        }
      } else if (data.message) {
        message = data.message
      }
      throw new Error(message)
    }
    const data: TokenResponse = await res.json()
    saveAuth(data.access_token, data.user)
    setLoginModalOpen(false)
    setLoginError('')
    return true
  }, [saveAuth])

  const passwordLogin = useCallback(async (account: string, password: string) => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password }),
      })
      return await handleLoginResponse(res)
    } catch (e: unknown) {
      setLoginError(getErrorMessage(e))
      return false
    } finally {
      setLoginLoading(false)
    }
  }, [handleLoginResponse])

  const passwordRegister = useCallback(async (account: string, password: string, verificationCode: string) => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password, verification_code: verificationCode }),
      })
      return await handleLoginResponse(res)
    } catch (e: unknown) {
      setLoginError(getErrorMessage(e))
      return false
    } finally {
      setLoginLoading(false)
    }
  }, [handleLoginResponse])

  const parseErrorDetail = (data: any, defaultMsg: string): string => {
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const first = data.detail[0]
      if (first && typeof first === 'object' && first.msg) return first.msg
    }
    if (data.message) return data.message
    return defaultMsg
  }

  const sendEmailCode = useCallback(async (email: string, purpose: string = 'register') => {
    try {
      const res = await fetch(`${API_BASE}/auth/email/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: '发送失败' }))
        throw new Error(parseErrorDetail(data, '发送失败'))
      }
      const data = await res.json()
      return { success: true, message: data.message || '验证码已发送', cooldown: data.cooldown_seconds || 60 }
    } catch (e: unknown) {
      return { success: false, message: getErrorMessage(e, '发送失败'), cooldown: 0 }
    }
  }, [])

  const resetPassword = useCallback(async (account: string, newPassword: string, verificationCode: string) => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch(`${API_BASE}/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, new_password: newPassword, verification_code: verificationCode }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: '重置失败' }))
        throw new Error(parseErrorDetail(data, '重置失败'))
      }
      return true
    } catch (e: unknown) {
      setLoginError(getErrorMessage(e))
      return false
    } finally {
      setLoginLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    // 通知后端记录登出日志（fire-and-forget，失败不阻塞登出）
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    clearAuth()
  }, [token, clearAuth])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Token invalid')
        return res.json()
      })
      .then((u: UserInfo) => {
        sessionStorage.setItem(USER_KEY, JSON.stringify(u))
        setUser(u)
      })
      .catch(() => {
        clearAuth()
      })
  }, [token, clearAuth])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoggedIn: !!token,
        loginModalOpen,
        loginError,
        loginLoading,
        openLoginModal,
        closeLoginModal,
        setLoginError,
        passwordLogin,
        passwordRegister,
        resetPassword,
        sendEmailCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}