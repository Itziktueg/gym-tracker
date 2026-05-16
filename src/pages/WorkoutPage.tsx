import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ExerciseUser, WorkoutLog } from '../types/database'
import DailySummary from '../components/workout/DailySummary'
import ExerciseTile from '../components/workout/ExerciseTile'
import RestTimer from '../components/workout/RestTimer'
import LogModal from '../components/workout/LogModal'
import ManageExercisesPage from './ManageExercisesPage'
import AdminPage from './AdminPage'

interface Props {
  userId: string
  restTimerSeconds: number
  isAdmin: boolean
}

function getTodayStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function WorkoutPage({ userId, restTimerSeconds, isAdmin }: Props) {
  const [exercises, setExercises] = useState<ExerciseUser[]>([])
  const [todayLogs, setTodayLogs] = useState<WorkoutLog[]>([])
  const [selected, setSelected] = useState<ExerciseUser | null>(null)
  const [managing, setManaging] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
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

    const [{ data: exData }, { data: logsData }] = await Promise.all([
      supabase
        .from('exercises_user')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('logged_at', getTodayStart()),
    ])

    setExercises(exData ?? [])
    setTodayLogs(logsData ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchData() }, [fetchData])

  function handleLogged(log: WorkoutLog) {
    setTodayLogs(prev => [...prev, log])
    setSelected(null)
  }

  const loggedIds = new Set(todayLogs.map(l => l.exercise_id))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">טוען אימון...</p>
      </div>
    )
  }

  if (adminOpen) {
    return <AdminPage onClose={() => setAdminOpen(false)} adminId={userId} />
  }

  if (managing) {
    return (
      <ManageExercisesPage
        userId={userId}
        onClose={() => { setManaging(false); fetchData() }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-28">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shadow-sm">
        <button
          onClick={() => setManaging(true)}
          className="text-gray-400 hover:text-gray-600 text-xl"
          title="ניהול תרגילים"
        >
          ⚙️
        </button>
        <span className="text-gray-700 font-bold text-base">מעקב אימונים</span>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setAdminOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="ניהול מערכת"
            >
              🛡️
            </button>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-gray-400 hover:text-gray-600 text-xl"
            title="התנתק"
          >
            🚪
          </button>
        </div>
      </div>

      <DailySummary exercises={exercises} logs={todayLogs} />

      <div className="grid grid-cols-4 gap-1.5 p-2">
        {exercises.map(ex => (
          <ExerciseTile
            key={ex.id}
            exercise={ex}
            completedToday={loggedIds.has(ex.id)}
            onPress={() => setSelected(ex)}
          />
        ))}
      </div>

      <RestTimer defaultSeconds={restTimerSeconds} />

      {selected && (
        <LogModal
          exercise={selected}
          todayLogs={todayLogs.filter(l => l.exercise_id === selected.id)}
          userId={userId}
          onClose={() => setSelected(null)}
          onLogged={handleLogged}
        />
      )}
    </div>
  )
}
