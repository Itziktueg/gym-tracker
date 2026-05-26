import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onDone: () => void
}

export default function ResetPasswordPage({ onDone }: Props) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else onDone()
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-1">מעקב אימונים</h1>
        <p className="text-gray-500 text-center text-sm mb-6">הגדרת סיסמה חדשה</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-500">סיסמה חדשה</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
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

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-500">אימות סיסמה</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full bg-gray-100 text-gray-800 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 border border-gray-200"
              placeholder="הכנס סיסמה שנית"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950 rounded-lg py-2 px-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg py-3 transition-colors mt-1"
          >
            {loading ? '...' : 'שמור סיסמה חדשה'}
          </button>
        </form>
      </div>
    </div>
  )
}
