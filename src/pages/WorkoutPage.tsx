import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ExerciseUser, WorkoutLog } from '../types/database'
import DailySummary from '../components/workout/DailySummary'
import ExerciseTile from '../components/workout/ExerciseTile'
import RestTimer from '../components/workout/RestTimer'
import LogModal from '../components/workout/LogModal'
import ManageExercisesPage from './ManageExercisesPage'
import AdminPage from './AdminPage'
import AdminHub from './AdminHub'
import ProgressPage from './ProgressPage'
import DensityPage from './DensityPage'
import AdminProgressPage from './AdminProgressPage'
import AdminDensityPage from './AdminDensityPage'
import WorkoutHistoryPage from './WorkoutHistoryPage'
import UserGuidePage from './UserGuidePage'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  restTimerSeconds: number
  isAdmin: boolean
}

function startOfDay(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfDay(date: Date): string {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function WorkoutPage({ userId, restTimerSeconds, isAdmin }: Props) {
  const [exercises, setExercises] = useState<ExerciseUser[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [viewLogs, setViewLogs] = useState<WorkoutLog[]>([])
  const [selected, setSelected] = useState<ExerciseUser | null>(null)
  const [managing, setManaging] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [adminHubOpen, setAdminHubOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [densityOpen, setDensityOpen] = useState(false)
  const [adminProgressOpen, setAdminProgressOpen] = useState(false)
  const [adminDensityOpen, setAdminDensityOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const isToday = isSameDay(selectedDate, new Date())

  // ── Fetch exercises (once) ─────────────────────────────────
  const fetchExercises = useCallback(async () => {
    // Seed personal library on first login
    const { data: existing } = await supabase
      .from('exercises_user')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (!existing || existing.length === 0) {
      const { data: globals } = await supabase
        .from('exercises_global')
        .select('*')
        .order('sort_order')

      if (globals && globals.length > 0) {
        await supabase.from('exercises_user').insert(
          globals.map(ex => ({
            user_id: userId,
            global_exercise_id: ex.id,
            name_he: ex.name_he,
            name_en: ex.name_en,
            image_url: ex.image_url,
            video_url: ex.video_url,
            default_sets: ex.default_sets,
            default_reps: ex.default_reps,
            default_weight: ex.default_weight,
            is_bilateral: ex.is_bilateral,
            notes: ex.notes,
            category: ex.category,
            sort_order: ex.sort_order,
          }))
        )
      }
    }

    const { data: exData } = await supabase
      .from('exercises_user')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name_he')

    setExercises(exData ?? [])
    setLoading(false)
  }, [userId])

  // ── Fetch logs for a specific day ─────────────────────────
  const fetchLogsForDate = useCallback(async (date: Date) => {
    const { data } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', startOfDay(date))
      .lte('logged_at', endOfDay(date))
    setViewLogs(data ?? [])
  }, [userId])

  useEffect(() => { fetchExercises() }, [fetchExercises])
  useEffect(() => { fetchLogsForDate(selectedDate) }, [fetchLogsForDate, selectedDate])

  // ── Date navigation ────────────────────────────────────────
  function goBack() {
    setSelectedDate(d => {
      const nd = new Date(d)
      nd.setDate(nd.getDate() - 1)
      return nd
    })
  }

  function goForward() {
    if (!isToday) {
      setSelectedDate(d => {
        const nd = new Date(d)
        nd.setDate(nd.getDate() + 1)
        return nd
      })
    }
  }

  // ── Log callbacks ──────────────────────────────────────────
  function handleSaved(exerciseId: string, newLogs: WorkoutLog[]) {
    setViewLogs(prev => [
      ...prev.filter(l => l.exercise_id !== exerciseId),
      ...newLogs,
    ])
    setSelected(null)
  }

  function handleUndo(exerciseId: string) {
    setViewLogs(prev => prev.filter(l => l.exercise_id !== exerciseId))
    setSelected(null)
  }

  const loggedIds = new Set(viewLogs.map(l => l.exercise_id))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">טוען אימון...</p>
      </div>
    )
  }

  if (historyOpen) {
    return <WorkoutHistoryPage userId={userId} onClose={() => setHistoryOpen(false)} />
  }

  if (adminHubOpen) {
    return (
      <AdminHub
        onClose={() => setAdminHubOpen(false)}
        onAdminPage={() => { setAdminHubOpen(false); setAdminOpen(true) }}
        onAdminProgress={() => { setAdminHubOpen(false); setAdminProgressOpen(true) }}
        onAdminDensity={() => { setAdminHubOpen(false); setAdminDensityOpen(true) }}
      />
    )
  }

  if (adminOpen) {
    return <AdminPage onClose={() => setAdminOpen(false)} adminId={userId} />
  }

  if (progressOpen) {
    return <ProgressPage userId={userId} onClose={() => setProgressOpen(false)} />
  }

  if (densityOpen) {
    return <DensityPage userId={userId} onClose={() => setDensityOpen(false)} />
  }

  if (adminProgressOpen) {
    return <AdminProgressPage onClose={() => setAdminProgressOpen(false)} />
  }

  if (adminDensityOpen) {
    return <AdminDensityPage onClose={() => setAdminDensityOpen(false)} />
  }

  if (guideOpen) {
    return <UserGuidePage isAdmin={isAdmin} onClose={() => setGuideOpen(false)} />
  }

  if (managing) {
    return (
      <ManageExercisesPage
        userId={userId}
        onClose={() => { setManaging(false); fetchExercises() }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setManaging(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="ניהול תרגילים"
            >
              ⚙️
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="היסטוריית אימונים"
            >
              📋
            </button>
            <button
              onClick={() => setProgressOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="התקדמות"
            >
              📊
            </button>
            <button
              onClick={() => setDensityOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="צפיפות יומית"
            >
              📈
            </button>
          </div>
          <span className="text-gray-700 font-bold text-base">מעקב אימונים</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGuideOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="מדריך למשתמש"
            >
              📖
            </button>
            <button
              onClick={() => setHelpOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
              title="עזרה מהירה"
            >
              ?
            </button>
            {isAdmin && (
              <button
                onClick={() => setAdminHubOpen(true)}
                className="hover:opacity-70 transition-opacity"
                title="ניהול מערכת"
              >
                <span className="text-xl">🛡️</span>
              </button>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              className="hover:opacity-70 transition-opacity"
              title="התנתק"
            >
              <img src="/exit.jpeg" alt="exit" className="w-8 h-8 rounded-full object-cover" />
            </button>
          </div>
        </div>
        <RestTimer defaultSeconds={restTimerSeconds} />
      </div>

      <DailySummary
        exercises={exercises}
        logs={viewLogs}
        selectedDate={selectedDate}
        isToday={isToday}
        onPrev={goBack}
        onNext={goForward}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        {exercises.map(ex => (
          <ExerciseTile
            key={ex.id}
            exercise={ex}
            completedToday={loggedIds.has(ex.id)}
            onPress={() => setSelected(ex)}
          />
        ))}
      </div>

      {selected && (
        <LogModal
          exercise={selected}
          todayLogs={viewLogs.filter(l => l.exercise_id === selected.id)}
          userId={userId}
          logDate={selectedDate}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onUndo={handleUndo}
        />
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'רישום תרגיל', body: 'לחץ על תרגיל לפתיחת מסך הרישום. תרגיל עם מסגרת ירוקה כבר בוצע היום.' },
          { title: 'טיימר מנוחה', body: 'לחץ על הטיימר בפס הכחול/אפור להפעלה. כוונן זמן עם + / −.' },
          { title: 'ניווט תאריכים', body: 'חץ שמאלה = יום קודם. חץ ימינה = יום הבא (עד היום).' },
          { title: 'כפתורי ניווט', body: '⚙️ ניהול תרגילים · 📋 היסטוריה · 📊 התקדמות · 📈 עצימות יומית' },
          ...( isAdmin ? [
            { title: 'ניהול מערכת (אדמין)', body: '🛡️ כניסה לניהול משתמשים, תרגילים גלובליים ודוחות לכל המשתמשים.' },
          ] : []),
        ]} />
      )}
    </div>
  )
}
