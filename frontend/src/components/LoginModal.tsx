import { useState, useCallback, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useAuth } from '../context/AuthContext'
import './LoginModal.css'

type ViewState = 'login' | 'register' | 'reset-password'

const validateEmail = (email: string): string | null => {
  if (!email) return null
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  if (!emailRegex.test(email)) {
    return '请输入正确的邮箱格式'
  }
  return null
}

const validatePassword = (pwd: string): string | null => {
  if (pwd.length < 8) return '密码长度至少8位'
  if (!/[A-Z]/.test(pwd)) return '密码必须包含大写字母'
  if (!/[a-z]/.test(pwd)) return '密码必须包含小写字母'
  if (!/\d/.test(pwd)) return '密码必须包含数字'
  return null
}

export default function LoginModal() {
  const {
    loginModalOpen,
    loginError,
    loginLoading,
    closeLoginModal,
    setLoginError,
    passwordLogin,
    passwordRegister,
    resetPassword,
    sendEmailCode,
  } = useAuth()

  const [view, setView] = useState<ViewState>('login')
  const [account, setAccount] = useState('')
  const [accountError, setAccountError] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreePolicy, setAgreePolicy] = useState(false)

  // 注册表单
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerEmailError, setRegisterEmailError] = useState('')
  const [registerPwd, setRegisterPwd] = useState('')
  const [registerShowPwd, setRegisterShowPwd] = useState(false)
  const [registerConfirmPwd, setRegisterConfirmPwd] = useState('')
  const [registerCode, setRegisterCode] = useState('')
  const [registerCodeError, setRegisterCodeError] = useState('')
  
  // 验证码发送状态
  const [codeSending, setCodeSending] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)
  const codeTimerRef = useRef<number | null>(null)

  // 重置密码表单
  const [resetEmail, setResetEmail] = useState('')
  const [resetEmailError, setResetEmailError] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetCodeError, setResetCodeError] = useState('')
  const [resetCodeSending, setResetCodeSending] = useState(false)
  const [resetCodeCountdown, setResetCodeCountdown] = useState(0)
  const resetCodeTimerRef = useRef<number | null>(null)
  const [resetNewPwd, setResetNewPwd] = useState('')
  const [resetShowPwd, setResetShowPwd] = useState(false)
  const [resetConfirmPwd, setResetConfirmPwd] = useState('')
  const [resetConfirmError, setResetConfirmError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  useEffect(() => {
    return () => {
      if (codeTimerRef.current) {
        window.clearInterval(codeTimerRef.current)
      }
      if (resetCodeTimerRef.current) {
        window.clearInterval(resetCodeTimerRef.current)
      }
    }
  }, [])

  const startCountdown = (seconds: number) => {
    setCodeCountdown(seconds)
    if (codeTimerRef.current) {
      window.clearInterval(codeTimerRef.current)
    }
    codeTimerRef.current = window.setInterval(() => {
      setCodeCountdown((prev) => {
        if (prev <= 1) {
          if (codeTimerRef.current) {
            window.clearInterval(codeTimerRef.current)
            codeTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const startResetCodeCountdown = (seconds: number) => {
    setResetCodeCountdown(seconds)
    if (resetCodeTimerRef.current) {
      window.clearInterval(resetCodeTimerRef.current)
    }
    resetCodeTimerRef.current = window.setInterval(() => {
      setResetCodeCountdown((prev) => {
        if (prev <= 1) {
          if (resetCodeTimerRef.current) {
            window.clearInterval(resetCodeTimerRef.current)
            resetCodeTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleSendCode = useCallback(async () => {
    if (!registerEmail) {
      setLoginError('请先输入邮箱')
      return
    }
    const emailErr = validateEmail(registerEmail)
    if (emailErr) {
      setRegisterEmailError(emailErr)
      setLoginError(emailErr)
      return
    }
    setCodeSending(true)
    setLoginError('')
    try {
      const result = await sendEmailCode(registerEmail, 'register')
      if (result.success) {
        startCountdown(result.cooldown || 60)
      } else {
        setLoginError(result.message)
      }
    } finally {
      setCodeSending(false)
    }
  }, [registerEmail, sendEmailCode, setLoginError])

  const handleClose = useCallback(() => {
    if (codeTimerRef.current) {
      window.clearInterval(codeTimerRef.current)
      codeTimerRef.current = null
    }
    setCodeCountdown(0)
    setView('login')
    setAccount('')
    setAccountError('')
    setPassword('')
    setAgreePolicy(false)
    setResetSuccess(false)
    setRegisterEmail('')
    setRegisterEmailError('')
    setRegisterPwd('')
    setRegisterConfirmPwd('')
    setRegisterCode('')
    setRegisterCodeError('')
    setResetEmail('')
    setResetEmailError('')
    setResetNewPwd('')
    closeLoginModal()
  }, [closeLoginModal])

  const handleBack = useCallback(() => {
    setView('login')
    setLoginError('')
  }, [setLoginError])

  const handleLoginSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account) {
      setLoginError('请输入邮箱')
      return
    }
    const emailErr = validateEmail(account)
    if (emailErr) {
      setLoginError(emailErr)
      return
    }
    if (!password) {
      setLoginError('请输入密码')
      return
    }
    if (!agreePolicy) {
      setLoginError('请先阅读并同意用户协议和隐私政策')
      return
    }
    await passwordLogin(account, password)
  }, [account, password, agreePolicy, passwordLogin, setLoginError])

  const handleRegisterSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!registerEmail) {
      setLoginError('请输入邮箱')
      return
    }
    const emailErr = validateEmail(registerEmail)
    if (emailErr) {
      setLoginError(emailErr)
      return
    }
    if (!registerCode) {
      setLoginError('请输入验证码')
      return
    }
    if (!/^\d{6}$/.test(registerCode)) {
      setLoginError('验证码为6位数字')
      return
    }
    if (!registerPwd) {
      setLoginError('请设置密码')
      return
    }
    const pwdError = validatePassword(registerPwd)
    if (pwdError) {
      setLoginError(pwdError)
      return
    }
    if (!registerConfirmPwd) {
      setLoginError('请再次输入密码确认')
      return
    }
    if (registerPwd !== registerConfirmPwd) {
      setLoginError('两次输入的密码不一致')
      return
    }
    if (!agreePolicy) {
      setLoginError('请先阅读并同意用户协议和隐私政策')
      return
    }
    await passwordRegister(registerEmail, registerPwd, registerCode)
  }, [registerEmail, registerPwd, registerConfirmPwd, registerCode, agreePolicy, passwordRegister, setLoginError])

  const handleSendResetCode = useCallback(async () => {
    if (!resetEmail) {
      setLoginError('请先输入邮箱')
      return
    }
    const emailErr = validateEmail(resetEmail)
    if (emailErr) {
      setResetEmailError(emailErr)
      setLoginError(emailErr)
      return
    }
    setResetCodeSending(true)
    setLoginError('')
    try {
      const result = await sendEmailCode(resetEmail, 'reset_password')
      if (result.success) {
        startResetCodeCountdown(result.cooldown || 60)
      } else {
        setLoginError(result.message)
      }
    } finally {
      setResetCodeSending(false)
    }
  }, [resetEmail, sendEmailCode, setLoginError])

  const handleResetSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      setLoginError('请输入注册邮箱')
      return
    }
    const emailErr = validateEmail(resetEmail)
    if (emailErr) {
      setLoginError(emailErr)
      return
    }
    if (!resetCode) {
      setLoginError('请输入验证码')
      return
    }
    if (!/^\d{6}$/.test(resetCode)) {
      setLoginError('验证码必须为6位数字')
      return
    }
    if (!resetNewPwd) {
      setLoginError('请输入新密码')
      return
    }
    const pwdError = validatePassword(resetNewPwd)
    if (pwdError) {
      setLoginError(pwdError)
      return
    }
    if (!resetConfirmPwd) {
      setLoginError('请再次输入密码确认')
      return
    }
    if (resetNewPwd !== resetConfirmPwd) {
      setResetConfirmError('两次输入的密码不一致')
      setLoginError('两次输入的密码不一致')
      return
    }
    setResetConfirmError('')
    const success = await resetPassword(resetEmail, resetNewPwd, resetCode)
    if (success) {
      setResetSuccess(true)
      setTimeout(() => {
        setView('login')
        setResetSuccess(false)
      }, 3000)
    }
  }, [resetEmail, resetCode, resetNewPwd, resetConfirmPwd, resetPassword, setLoginError])

  const goToRegister = useCallback(() => {
    setView('register')
    setLoginError('')
  }, [setLoginError])

  const goToReset = useCallback(() => {
    setView('reset-password')
    setLoginError('')
    setResetEmail('')
    setResetEmailError('')
    setResetCode('')
    setResetCodeError('')
    setResetCodeCountdown(0)
    setResetNewPwd('')
    setResetConfirmPwd('')
    setResetConfirmError('')
    setResetShowPwd(false)
  }, [setLoginError])

  const handleLoginEmailChange = useCallback((val: string) => {
    setAccount(val)
    if (accountError) {
      setAccountError(validateEmail(val) || '')
    }
  }, [accountError])

  const handleRegisterEmailChange = useCallback((val: string) => {
    setRegisterEmail(val)
    if (registerEmailError) {
      setRegisterEmailError(validateEmail(val) || '')
    }
  }, [registerEmailError])

  const handleResetEmailChange = useCallback((val: string) => {
    setResetEmail(val)
    if (resetEmailError) {
      setResetEmailError(validateEmail(val) || '')
    }
  }, [resetEmailError])

  const handleLoginEmailBlur = useCallback(() => {
    setAccountError(validateEmail(account) || '')
  }, [account])

  const handleRegisterEmailBlur = useCallback(() => {
    setRegisterEmailError(validateEmail(registerEmail) || '')
  }, [registerEmail])

  const handleResetEmailBlur = useCallback(() => {
    setResetEmailError(validateEmail(resetEmail) || '')
  }, [resetEmail])

  if (!loginModalOpen) return null

  return ReactDOM.createPortal(
    <div className="login-overlay" onClick={handleClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="login-top-bar">
          {view !== 'login' && (
            <button type="button" className="login-back-btn" onClick={handleBack}>
              <svg width="24" height="25" fill="none" viewBox="0 0 24 25">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7.5h10a6 6 0 0 1 0 12H4m0-12 4-4m-4 4 4 4" />
              </svg>
              <span>返回</span>
            </button>
          )}
          <button type="button" className="login-close-btn" onClick={handleClose} aria-label="关闭">
            <svg width="12" height="13" fill="none" viewBox="0 0 12 13">
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.667" d="m11 1.5-10 10m0-10 10 10" />
            </svg>
          </button>
        </div>

        {view === 'reset-password' ? (
          <div className="reset-password-view">
            <div className="reset-pwd-header">
              <div className="reset-pwd-title">重置密码</div>
              <div className="reset-pwd-desc">通过邮箱验证码重置密码</div>
            </div>

            {resetSuccess ? (
              <div className="reset-pwd-success">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" fill="hsl(140, 60%, 50%, 0.15)" />
                  <path stroke="hsl(140, 60%, 50%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M14 24l7 7 13-13" />
                </svg>
                <p>密码重置成功</p>
                <span>即将跳转到登录页面...</span>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit}>
                <div className="login-form">
                  <div className="login-input-group">
                    <div className={`login-pwd-row ${resetEmailError ? 'has-error' : ''}`}>
                      <input
                        className="login-input flex-1"
                        type="email"
                        placeholder="输入注册邮箱"
                        value={resetEmail}
                        onChange={(e) => handleResetEmailChange(e.target.value.trim())}
                        onBlur={handleResetEmailBlur}
                        autoComplete="email"
                      />
                    </div>
                    {resetEmailError && <div className="login-field-error">{resetEmailError}</div>}
                  </div>
                  <div className="login-input-group">
                    <div className="login-code-row">
                      <div className="login-code-input-wrap flex-1">
                        <input
                          className="login-input"
                          type="text"
                          placeholder="输入6位验证码"
                          value={resetCode}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                            setResetCode(v)
                            if (resetCodeError) setResetCodeError(v ? '' : '请输入验证码')
                          }}
                          maxLength={6}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                        />
                      </div>
                      <button
                        type="button"
                        className="login-code-btn"
                        onClick={handleSendResetCode}
                        disabled={resetCodeSending || resetCodeCountdown > 0}
                        tabIndex={0}
                      >
                        {resetCodeSending ? '发送中...' : resetCodeCountdown > 0 ? `${resetCodeCountdown}s 后重试` : '获取验证码'}
                      </button>
                    </div>
                  </div>
                  <div className="login-input-group">
                    <div className="login-pwd-row">
                      <input
                        className="login-input flex-1"
                        type={resetShowPwd ? 'text' : 'password'}
                        placeholder="输入新密码"
                        value={resetNewPwd}
                        onChange={(e) => setResetNewPwd(e.target.value)}
                        maxLength={40}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="login-pwd-toggle"
                        tabIndex={-1}
                        onClick={() => setResetShowPwd(!resetShowPwd)}
                      >
                        <svg width="21" height="21" fill="none" viewBox="0 0 21 21">
                          <path fill="#98A2B3" d="M10.155 5.203c.745 0 1.5.158 2.246.47A8.6 8.6 0 0 1 14.4 6.878c.98.774 1.92 1.78 2.876 3.078a.62.62 0 0 1 0 .664c-.598.81-1.577 1.974-2.848 2.91-1.4 1.029-2.838 1.55-4.275 1.55a6.1 6.1 0 0 1-2.24-.431 8.2 8.2 0 0 1-1.931-1.108c-.95-.721-1.855-1.676-2.77-2.92a.62.62 0 0 1 0-.663c.733-.997 1.64-2.143 2.8-3.09.635-.52 1.285-.923 1.928-1.197a5.6 5.6 0 0 1 2.215-.468m0-1.079c-3.803 0-6.458 3.358-7.81 5.194-.408.554-.408 1.391 0 1.945 1.352 1.835 4.007 4.899 7.81 4.899s6.637-3.062 7.99-4.899c.408-.554.408-1.391 0-1.945-1.353-1.836-4.187-5.194-7.99-5.194" />
                          <path fill="#98A2B3" d="M10.245 12.324c-1.203 0-2.18-.979-2.18-2.18a2.182 2.182 0 0 1 4.363 0c0 1.201-.98 2.18-2.183 2.18m0-3.283a1.102 1.102 0 1 0 .001 2.204 1.102 1.102 0 0 0-.001-2.204" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="login-input-group">
                    <div className={`login-pwd-row ${resetConfirmError ? 'has-error' : ''}`}>
                      <input
                        className="login-input flex-1"
                        type={resetShowPwd ? 'text' : 'password'}
                        placeholder="再次输入新密码"
                        value={resetConfirmPwd}
                        onChange={(e) => {
                          setResetConfirmPwd(e.target.value)
                          if (resetConfirmError) {
                            setResetConfirmError(e.target.value !== resetNewPwd ? '两次输入的密码不一致' : '')
                          }
                        }}
                        maxLength={40}
                        autoComplete="new-password"
                      />
                    </div>
                    {resetConfirmError && <div className="login-field-error">{resetConfirmError}</div>}
                  </div>
                  <div className="reset-pwd-hint">*密码至少8位，需包含大小写字母和数字</div>
                  <button
                    type="submit"
                    className="login-submit-btn"
                    disabled={loginLoading}
                  >
                    {loginLoading ? '处理中...' : '确认重置'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : view === 'register' ? (
          <div className="register-view">
            <div className="login-body">
              <p className="login-title">注册账号</p>
              <form onSubmit={handleRegisterSubmit}>
                <div className="login-form">
                  <div className="login-input-group">
                    <div className={`login-pwd-row ${registerEmailError ? 'has-error' : ''}`}>
                      <input
                        className="login-input flex-1"
                        type="email"
                        placeholder="输入邮箱"
                        value={registerEmail}
                        onChange={(e) => handleRegisterEmailChange(e.target.value.trim())}
                        onBlur={handleRegisterEmailBlur}
                        autoComplete="email"
                      />
                    </div>
                    {registerEmailError && <div className="login-field-error">{registerEmailError}</div>}
                  </div>
                  <div className="login-input-group">
                    <div className={`login-pwd-row ${registerCodeError ? 'has-error' : ''}`}>
                      <input
                        className="login-input flex-1"
                        type="text"
                        placeholder="输入6位验证码"
                        value={registerCode}
                        maxLength={6}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setRegisterCode(val)
                          if (registerCodeError) setRegisterCodeError('')
                        }}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        className={`login-code-btn ${codeCountdown > 0 || codeSending ? 'disabled' : ''}`}
                        onClick={handleSendCode}
                        disabled={codeCountdown > 0 || codeSending}
                      >
                        {codeSending ? '发送中...' : codeCountdown > 0 ? `${codeCountdown}s 后重发` : '获取验证码'}
                      </button>
                    </div>
                    {registerCodeError && <div className="login-field-error">{registerCodeError}</div>}
                  </div>
                  <div className="login-input-group">
                    <div className="login-pwd-row">
                      <input
                        className="login-input flex-1"
                        type={registerShowPwd ? 'text' : 'password'}
                        placeholder="设置密码（至少8位，含大小写字母和数字）"
                        value={registerPwd}
                        onChange={(e) => setRegisterPwd(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="login-pwd-toggle"
                        tabIndex={-1}
                        onClick={() => setRegisterShowPwd(!registerShowPwd)}
                      >
                        <svg width="21" height="21" fill="none" viewBox="0 0 21 21">
                          <path fill="#98A2B3" d="M10.155 5.203c.745 0 1.5.158 2.246.47A8.6 8.6 0 0 1 14.4 6.878c.98.774 1.92 1.78 2.876 3.078a.62.62 0 0 1 0 .664c-.598.81-1.577 1.974-2.848 2.91-1.4 1.029-2.838 1.55-4.275 1.55a6.1 6.1 0 0 1-2.24-.431 8.2 8.2 0 0 1-1.931-1.108c-.95-.721-1.855-1.676-2.77-2.92a.62.62 0 0 1 0-.663c.733-.997 1.64-2.143 2.8-3.09.635-.52 1.285-.923 1.928-1.197a5.6 5.6 0 0 1 2.215-.468m0-1.079c-3.803 0-6.458 3.358-7.81 5.194-.408.554-.408 1.391 0 1.945 1.352 1.835 4.007 4.899 7.81 4.899s6.637-3.062 7.99-4.899c.408-.554.408-1.391 0-1.945-1.353-1.836-4.187-5.194-7.99-5.194" />
                          <path fill="#98A2B3" d="M10.245 12.324c-1.203 0-2.18-.979-2.18-2.18a2.182 2.182 0 0 1 4.363 0c0 1.201-.98 2.18-2.183 2.18m0-3.283a1.102 1.102 0 1 0 .001 2.204 1.102 1.102 0 0 0-.001-2.204" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="login-input-group">
                    <div className="login-pwd-row">
                      <input
                        className="login-input flex-1"
                        type={registerShowPwd ? 'text' : 'password'}
                        placeholder="再次确认密码"
                        value={registerConfirmPwd}
                        onChange={(e) => setRegisterConfirmPwd(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="login-submit-btn"
                    disabled={loginLoading || !agreePolicy}
                  >
                    {loginLoading ? '注册中...' : '立即注册'}
                  </button>
                </div>
                <div className="login-policy">
                  <label className={`login-policy-label${registerEmail.trim() && registerPwd && registerConfirmPwd && !agreePolicy ? ' policy-attention' : ''}`}>
                    <input
                      type="checkbox"
                      checked={agreePolicy}
                      onChange={(e) => setAgreePolicy(e.target.checked)}
                    />
                    <span className="login-checkbox-custom" />
                    <span className="login-policy-text">
                      我已阅读并同意
                      <a href="/meta-user-policy" target="_blank" rel="noopener">《用户协议》</a>
                      和
                      <a href="/meta-private-policy" target="_blank" rel="noopener">《隐私政策》</a>
                    </span>
                  </label>
                </div>
                <div className="login-switch-link">
                  已有账号？
                  <button type="button" onClick={handleBack}>立即登录</button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="login-view">
            <div className="login-body">
              <p className="login-title">登录</p>
              <form onSubmit={handleLoginSubmit}>
                <div className="login-form">
                  <div className="login-input-group">
                    <div className={`login-pwd-row ${accountError ? 'has-error' : ''}`}>
                      <input
                        className="login-input flex-1"
                        type="email"
                        placeholder="输入邮箱"
                        value={account}
                        onChange={(e) => handleLoginEmailChange(e.target.value.trim())}
                        onBlur={handleLoginEmailBlur}
                        autoComplete="username"
                      />
                    </div>
                    {accountError && <div className="login-field-error">{accountError}</div>}
                  </div>
                  <div className="login-input-group">
                    <div className="login-pwd-row">
                      <input
                        className="login-input flex-1"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="输入登录密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="login-pwd-toggle"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        <svg width="21" height="21" fill="none" viewBox="0 0 21 21">
                          <path fill="#98A2B3" d="M10.155 5.203c.745 0 1.5.158 2.246.47A8.6 8.6 0 0 1 14.4 6.878c.98.774 1.92 1.78 2.876 3.078a.62.62 0 0 1 0 .664c-.598.81-1.577 1.974-2.848 2.91-1.4 1.029-2.838 1.55-4.275 1.55a6.1 6.1 0 0 1-2.24-.431 8.2 8.2 0 0 1-1.931-1.108c-.95-.721-1.855-1.676-2.77-2.92a.62.62 0 0 1 0-.663c.733-.997 1.64-2.143 2.8-3.09.635-.52 1.285-.923 1.928-1.197a5.6 5.6 0 0 1 2.215-.468m0-1.079c-3.803 0-6.458 3.358-7.81 5.194-.408.554-.408 1.391 0 1.945 1.352 1.835 4.007 4.899 7.81 4.899s6.637-3.062 7.99-4.899c.408-.554.408-1.391 0-1.945-1.353-1.836-4.187-5.194-7.99-5.194" />
                          <path fill="#98A2B3" d="M10.245 12.324c-1.203 0-2.18-.979-2.18-2.18a2.182 2.182 0 0 1 4.363 0c0 1.201-.98 2.18-2.183 2.18m0-3.283a1.102 1.102 0 1 0 .001 2.204 1.102 1.102 0 0 0-.001-2.204" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="login-submit-btn"
                    disabled={loginLoading || !agreePolicy}
                  >
                    {loginLoading ? '登录中...' : '登 录'}
                  </button>
                  <div className="login-action-row">
                    <button type="button" className="login-forgot-btn" onClick={goToReset}>
                      忘记密码?
                    </button>
                    <button type="button" className="login-register-btn" onClick={goToRegister}>
                      注册新账号
                    </button>
                  </div>
                </div>
                <div className="login-policy">
                  <label className={`login-policy-label${account.trim() && password && !agreePolicy ? ' policy-attention' : ''}`}>
                    <input
                      type="checkbox"
                      checked={agreePolicy}
                      onChange={(e) => setAgreePolicy(e.target.checked)}
                    />
                    <span className="login-checkbox-custom" />
                    <span className="login-policy-text">
                      我已阅读并同意
                      <a href="/meta-user-policy" target="_blank" rel="noopener">《用户协议》</a>
                      和
                      <a href="/meta-private-policy" target="_blank" rel="noopener">《隐私政策》</a>
                    </span>
                  </label>
                </div>
              </form>
            </div>
          </div>
        )}

        {loginError && (
          <div className="login-error-toast">
            <span>{loginError}</span>
            <button type="button" onClick={() => setLoginError('')} aria-label="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}