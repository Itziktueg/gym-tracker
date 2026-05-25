import { useEffect, useState, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Profile } from './types/database'
import AuthPage from './pages/AuthPage'
import WorkoutPage from './pages/WorkoutPage'

export default function App() {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [confirmExit, setConfirmExit] = useState(false)
  const exitHandlerRef = useRef<(() => void) | null>(null)

  // ── Back-button exit guard (only when logged in) ───────────
  useEffect(() => {
    if (!session) return

    // Push a dummy state so the back button hits us first
    window.history.pushState({ gymTracker: true }, '')

    const handler = () => {
      // Re-push so we stay here while the modal is open
      window.history.pushState({ gymTracker: true }, '')
      setConfirmExit(true)
    }

    exitHandlerRef.current = handler
    window.addEventListener('popstate', handler)
    return () => {
      window.removeEventListener('popstate', handler)
      exitHandlerRef.current = null
    }
  }, [session])

  function handleStay() {
    setConfirmExit(false)
  }

  function handleLeave() {
    setConfirmExit(false)
    // Remove the listener so back button is no longer intercepted
    if (exitHandlerRef.current) {
      window.removeEventListener('popstate', exitHandlerRef.current)
      exitHandlerRef.current = null
    }
    // Go back one step — on Android one more back swipe will close the app
    window.history.go(-1)
  }

  // ── Auth ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  if (!session) return <AuthPage />

  return (
    <>
      <WorkoutPage
        userId={session.user.id}
        restTimerSeconds={profile?.rest_timer_seconds ?? 90}
        isAdmin={profile?.role === 'admin'}
      />

      {/* Exit confirmation modal */}
      {confirmExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-5">
            <p className="text-gray-800 font-bold text-lg text-center">
              האם אתה רוצה לצאת מהאפליקציה?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleStay}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-base"
              >
                לא
              </button>
              <button
                onClick={handleLeave}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-base"
              >
                כן
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
