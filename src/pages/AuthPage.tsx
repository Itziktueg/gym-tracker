import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'forgot'

export default function AuthPage() {
  const [mode, setMode]               = useState<Mode>('login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [message, setMessage]         = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setMessage(null)
    setPassword('')
    setShowPassword(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: window.location.origin }
      )
      if (error) setError(error.message)
      else setMessage('נשלח קישור לאיפוס סיסמה — בדוק את תיבת הדואר שלך')
      setLoading(false)
      return
    }

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('אימייל או סיסמה שגויים')
    } else {
      // Check allowlist before signing up
      const { data: invite } = await supabase
        .from('invited_emails')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .single()

      if (!invite) {
        setError('אימייל זה אינו מורשה להרשמה — פנה למנהל המערכת')
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('ההרשמה הושלמה — כעת ניתן להתחבר')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">

        <h1 className="text-2xl font-bold text-gray-800 text-center mb-1">
          מעקב אימונים
        </h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          {mode === 'login' ? 'כניסה לחשבון' : mode === 'signup' ? 'יצירת חשבון חדש' : 'איפוס סיסמה'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-500">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-gray-100 text-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400 border border-gray-200"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-500">סיסמה</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-gray-100 text-gray-800 rounded-lg px-4 py-3 pl-16 outline-none focus:ring-2 focus:ring-blue-400 border border-gray-200"
                  placeholder="לפחות 6 תווים"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium"
                >
                  {showPassword ? 'הסתר' : 'הצג'}
                </button>
              </div>
            </div>
          )}

          {/* Forgot password link */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="text-blue-400 hover:text-blue-300 text-xs self-start -mt-2"
            >
              שכחתי סיסמה
            </button>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950 rounded-lg py-2 px-3">
              {error}
            </p>
          )}
          {message && (
            <p className="text-green-400 text-sm text-center bg-green-950 rounded-lg py-2 px-3">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors mt-1"
          >
            {loading ? '...' : mode === 'login' ? 'כניסה' : mode === 'signup' ? 'הרשמה' : 'שלח קישור לאיפוס'}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-5">
          {mode === 'forgot' ? (
            <button
              onClick={() => switchMode('login')}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              חזור לכניסה
            </button>
          ) : mode === 'login' ? (
            <>
              אין לך חשבון?{' '}
              <button
                onClick={() => switchMode('signup')}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                הרשמה
              </button>
            </>
          ) : (
            <>
              יש לך חשבון?{' '}
              <button
                onClick={() => switchMode('login')}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                כניסה
              </button>
            </>
          )}
        </p>

      </div>
    </div>
  )
}
