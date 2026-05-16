import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setMessage(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

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
          {mode === 'login' ? 'כניסה לחשבון' : 'יצירת חשבון חדש'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-500">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="bg-gray-100 text-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 border border-gray-200"
              placeholder="לפחות 6 תווים"
            />
          </div>

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
            {loading ? '...' : mode === 'login' ? 'כניסה' : 'הרשמה'}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-5">
          {mode === 'login' ? 'אין לך חשבון?' : 'יש לך חשבון?'}{' '}
          <button
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            {mode === 'login' ? 'הרשמה' : 'כניסה'}
          </button>
        </p>

      </div>
    </div>
  )
}
