import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './types/database'
import AuthPage from './pages/AuthPage'
import WorkoutPage from './pages/WorkoutPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

export default function App() {
  const [session, setSession]         = useState<Session | null>(null)
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [loading, setLoading]         = useState(true)
  const [resetPassword, setResetPassword] = useState(false)

  // ── Auth ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setResetPassword(true)
      }
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">טוען...</p>
      </div>
    )
  }

  if (resetPassword) {
    return <ResetPasswordPage onDone={() => setResetPassword(false)} />
  }

  if (!session) return <AuthPage />

  return (
    <WorkoutPage
      userId={session.user.id}
      restTimerSeconds={profile?.rest_timer_seconds ?? 90}
      isAdmin={profile?.role === 'admin'}
    />
  )
}
