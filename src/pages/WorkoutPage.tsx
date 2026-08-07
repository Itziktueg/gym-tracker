import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ExerciseUser, WorkoutLog } from '../types/database'
import DailySummary from '../components/workout/DailySummary'
import ExerciseTile from '../components/workout/ExerciseTile'
import RestTimer from '../components/workout/RestTimer'
import LogModal from '../components/workout/LogModal'
import ManageExercisesPage from './ManageExercisesPage'
import AdminPage from './AdminPage'
import AdminHub from './AdminHub'
import ReportsHub from './ReportsHub'
import ProgressPage from './ProgressPage'
import DensityPage from './DensityPage'
import AdminProgressPage from './AdminProgressPage'
import AdminDensityPage from './AdminDensityPage'
import WeeklyDensityPage from './WeeklyDensityPage'
import AdminWeeklyDensityPage from './AdminWeeklyDensityPage'
import ExerciseFrequencyPage from './ExerciseFrequencyPage'
import PlanPage from './PlanPage'
import PlanVsActualPage from './PlanVsActualPage'
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
  const [reportsHubOpen, setReportsHubOpen] = useState(false)
  const [adminHubOpen, setAdminHubOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [densityOpen, setDensityOpen] = useState(false)
  const [adminProgressOpen, setAdminProgressOpen] = useState(false)
  const [adminDensityOpen, setAdminDensityOpen] = useState(false)
  const [weeklyDensityOpen, setWeeklyDensityOpen] = useState(false)
  const [adminWeeklyDensityOpen, setAdminWeeklyDensityOpen] = useState(false)
  const [frequencyOpen, setFrequencyOpen] = useState(false)
  const [planVsActualOpen, setPlanVsActualOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [weekMode, setWeekMode] = useState(false)
  const [weeklyIds, setWeeklyIds] = useState<Set<string>>(new Set())
  const [weeklyLogs, setWeeklyLogs] = useState<WorkoutLog[]>([])
  const [editExerciseId, setEditExerciseId] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planExerciseIds, setPlanExerciseIds] = useState<Set<string> | null>(null)
  const [planLoaded, setPlanLoaded] = useState(false)
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
            double_weight: ex.double_weight,
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

  // Creates תוכנית 0 holding the user's whole starting library. Returns its
  // exercise ids, or null if there is nothing to put in it yet.
  const createInitialPlan = useCallback(async (today: string) => {
    const { data: exRows } = await supabase
      .from('exercises_user')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!exRows || exRows.length === 0) return null

    const { data: plan, error } = await supabase
      .from('workout_plans')
      .insert({ user_id: userId, seq: 0, name: 'תוכנית 0', start_date: today })
      .select()
      .single()

    if (error || !plan) return null

    const { error: linkErr } = await supabase
      .from('workout_plan_exercises')
      .insert(exRows.map(e => ({ plan_id: plan.id, exercise_id: e.id })))

    if (linkErr) return null
    return new Set(exRows.map(e => e.id))
  }, [userId])

  // ── Fetch the currently active plan ───────────────────────
  const fetchActivePlan = useCallback(async () => {
    // Active means today falls inside the plan's range. Matching on
    // "no end date" alone would pick up a plan that has not started yet.
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const { data: planRows } = await supabase
      .from('workout_plans')
      .select('id, start_date, end_date')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })

    // First login: wrap the freshly seeded library in תוכנית 0, so every account
    // is on the plan model from day one and their first deliberate plan gets
    // seq 1 rather than being mislabelled תוכנית 0.
    if (planRows && planRows.length === 0) {
      const seeded = await createInitialPlan(today)
      if (seeded) { setPlanExerciseIds(seeded); setPlanLoaded(true); return }
    }

    const plan = (planRows ?? []).find(p =>
      p.start_date <= today && (p.end_date === null || p.end_date >= today))

    if (!plan) {
      setPlanExerciseIds(null)   // no plan covering today → show the full library
      setPlanLoaded(true)
      return
    }

    const { data: rows } = await supabase
      .from('workout_plan_exercises')
      .select('exercise_id')
      .eq('plan_id', plan.id)

    setPlanExerciseIds(new Set((rows ?? []).map(r => r.exercise_id)))
    setPlanLoaded(true)
  }, [userId, createInitialPlan])

  // ── Android back-button handling ──────────────────────────
  const backHandlerRef = useRef(() => {})
  backHandlerRef.current = () => {
    if (historyOpen)            { history.pushState(null, ''); setHistoryOpen(false); setReportsHubOpen(true); return }
    if (reportsHubOpen)         { history.pushState(null, ''); setReportsHubOpen(false); return }
    if (adminHubOpen)           { history.pushState(null, ''); setAdminHubOpen(false); return }
    if (adminOpen)              { history.pushState(null, ''); setAdminOpen(false); setAdminHubOpen(true); return }
    if (progressOpen)           { history.pushState(null, ''); setProgressOpen(false); setReportsHubOpen(true); return }
    if (weeklyDensityOpen)      { history.pushState(null, ''); setWeeklyDensityOpen(false); setReportsHubOpen(true); return }
    if (frequencyOpen)          { history.pushState(null, ''); setFrequencyOpen(false); setReportsHubOpen(true); return }
    if (planVsActualOpen)       { history.pushState(null, ''); setPlanVsActualOpen(false); setReportsHubOpen(true); return }
    if (densityOpen)            { history.pushState(null, ''); setDensityOpen(false); setReportsHubOpen(true); return }
    if (adminProgressOpen)      { history.pushState(null, ''); setAdminProgressOpen(false); setAdminHubOpen(true); return }
    if (adminWeeklyDensityOpen) { history.pushState(null, ''); setAdminWeeklyDensityOpen(false); setAdminHubOpen(true); return }
    if (adminDensityOpen)       { history.pushState(null, ''); setAdminDensityOpen(false); setAdminHubOpen(true); return }
    if (guideOpen)              { history.pushState(null, ''); setGuideOpen(false); return }
    if (planOpen)               { history.pushState(null, ''); setPlanOpen(false); setManaging(true); fetchActivePlan(); return }
    if (managing)               { history.pushState(null, ''); setManaging(false); setEditExerciseId(null); fetchExercises(); return }
    if (selected)               { history.pushState(null, ''); setSelected(null); return }
    // Main screen — ask before leaving
    if (window.confirm('לצאת מהאפליקציה?')) {
      // Don't push — let the browser navigate back / close the PWA
    } else {
      history.pushState(null, '')
    }
  }

  useEffect(() => {
    history.pushState(null, '') // sentinel entry so first back triggers popstate
    const onPop = () => backHandlerRef.current()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchWeeklyData() {
    const today = new Date()
    const sunday = new Date(today)
    sunday.setDate(today.getDate() - today.getDay())
    sunday.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', sunday.toISOString())
    const logs = (data ?? []) as WorkoutLog[]
    setWeeklyLogs(logs)
    setWeeklyIds(new Set(logs.map(r => r.exercise_id)))
  }

  function toggleWeekMode() {
    if (!weekMode) fetchWeeklyData()
    setWeekMode(v => !v)
  }

  // Sequential, not parallel: on a first login the plan bootstrap needs the
  // seeded exercises to already exist, otherwise it finds none and skips.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await fetchExercises()
      if (!cancelled) await fetchActivePlan()
    })()
    return () => { cancelled = true }
  }, [fetchExercises, fetchActivePlan])
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
    if (weekMode) {
      setWeeklyIds(prev => new Set([...prev, exerciseId]))
      setWeeklyLogs(prev => [...prev.filter(l => l.exercise_id !== exerciseId), ...newLogs])
    }
    setSelected(null)
  }

  function handleUndo(exerciseId: string) {
    setViewLogs(prev => prev.filter(l => l.exercise_id !== exerciseId))
    setSelected(null)
  }

  const loggedIds = new Set(viewLogs.map(l => l.exercise_id))

  // Only plan exercises are shown — but anything already logged stays visible so
  // past days remain viewable and editable after the plan changes.
  const visibleExercises = planExerciseIds
    ? exercises.filter(ex =>
        planExerciseIds.has(ex.id) ||
        loggedIds.has(ex.id) ||
        (weekMode && weeklyIds.has(ex.id)))
    : exercises

  if (loading || !planLoaded) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">טוען אימון...</p>
      </div>
    )
  }

  if (historyOpen) {
    return <WorkoutHistoryPage userId={userId} onClose={() => { setHistoryOpen(false); setReportsHubOpen(true) }} />
  }

  if (reportsHubOpen) {
    return (
      <ReportsHub
        onClose={() => setReportsHubOpen(false)}
        onHistory={() => { setReportsHubOpen(false); setHistoryOpen(true) }}
        onProgress={() => { setReportsHubOpen(false); setProgressOpen(true) }}
        onDensity={() => { setReportsHubOpen(false); setDensityOpen(true) }}
        onWeeklyDensity={() => { setReportsHubOpen(false); setWeeklyDensityOpen(true) }}
        onFrequency={() => { setReportsHubOpen(false); setFrequencyOpen(true) }}
        onPlanVsActual={() => { setReportsHubOpen(false); setPlanVsActualOpen(true) }}
      />
    )
  }

  if (adminHubOpen) {
    return (
      <AdminHub
        onClose={() => setAdminHubOpen(false)}
        onAdminPage={() => { setAdminHubOpen(false); setAdminOpen(true) }}
        onAdminProgress={() => { setAdminHubOpen(false); setAdminProgressOpen(true) }}
        onAdminDensity={() => { setAdminHubOpen(false); setAdminDensityOpen(true) }}
        onAdminWeeklyDensity={() => { setAdminHubOpen(false); setAdminWeeklyDensityOpen(true) }}
      />
    )
  }

  if (adminOpen) {
    return <AdminPage onClose={() => { setAdminOpen(false); setAdminHubOpen(true) }} adminId={userId} />
  }

  if (progressOpen) {
    return <ProgressPage userId={userId} onClose={() => { setProgressOpen(false); setReportsHubOpen(true) }} />
  }

  if (weeklyDensityOpen) {
    return <WeeklyDensityPage userId={userId} onClose={() => { setWeeklyDensityOpen(false); setReportsHubOpen(true) }} />
  }

  if (frequencyOpen) {
    return <ExerciseFrequencyPage userId={userId} onClose={() => { setFrequencyOpen(false); setReportsHubOpen(true) }} />
  }

  if (planVsActualOpen) {
    return <PlanVsActualPage userId={userId} onClose={() => { setPlanVsActualOpen(false); setReportsHubOpen(true) }} />
  }

  if (densityOpen) {
    return <DensityPage
      userId={userId}
      onClose={() => { setDensityOpen(false); setReportsHubOpen(true) }}
    />
  }

  if (adminProgressOpen) {
    return <AdminProgressPage onClose={() => { setAdminProgressOpen(false); setAdminHubOpen(true) }} />
  }

  if (adminWeeklyDensityOpen) {
    return <AdminWeeklyDensityPage onClose={() => { setAdminWeeklyDensityOpen(false); setAdminHubOpen(true) }} />
  }

  if (adminDensityOpen) {
    return <AdminDensityPage onClose={() => { setAdminDensityOpen(false); setAdminHubOpen(true) }} />
  }

  if (guideOpen) {
    return <UserGuidePage isAdmin={isAdmin} onClose={() => setGuideOpen(false)} />
  }

  if (planOpen) {
    return (
      <PlanPage
        userId={userId}
        onClose={() => { setPlanOpen(false); setManaging(true); fetchActivePlan() }}
      />
    )
  }

  if (managing) {
    return (
      <ManageExercisesPage
        userId={userId}
        initialEditId={editExerciseId ?? undefined}
        onOpenPlan={() => { setManaging(false); setPlanOpen(true) }}
        onClose={() => { setManaging(false); setEditExerciseId(null); fetchExercises() }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="relative px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setManaging(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="ניהול תרגילים"
            >
              ⚙️
            </button>
            <button
              onClick={() => setReportsHubOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="דוחות"
            >
              📊
            </button>
            <button
              onClick={() => setGuideOpen(true)}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="מדריך למשתמש"
            >
              📖
            </button>
            <button
              onClick={toggleWeekMode}
              className={`text-xl transition-opacity ${weekMode ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
              title="הצג תרגילים שבוצעו השבוע"
            >
              🗓
            </button>
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-gray-700 font-bold text-base pointer-events-none">מעקב אימונים</span>
          <div className="flex items-center gap-2">
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
        weekMode={weekMode}
        weeklyLogs={weeklyLogs}
        planExerciseIds={planExerciseIds}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        {visibleExercises.map(ex => (
          <ExerciseTile
            key={ex.id}
            exercise={ex}
            completedToday={loggedIds.has(ex.id)}
            completedThisWeek={weeklyIds.has(ex.id)}
            weekMode={weekMode}
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
          onEditExercise={() => { setEditExerciseId(selected.id); setSelected(null); setManaging(true) }}
        />
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'רישום תרגיל', body: 'לחץ על תרגיל לפתיחת מסך הרישום. תרגיל עם מסגרת ירוקה כבר בוצע היום. ✏️ בפינה השמאלית פותח את עריכת התרגיל ישירות.' },
          { title: 'הצגת אימוני השבוע', body: 'לחץ על 🗓 להדגשת כל התרגילים שבוצעו השבוע (ראשון–שבת) במסגרת אדומה. לחץ שוב לחזרה לתצוגה הרגילה.' },
          { title: 'טיימר מנוחה', body: 'לחץ על הטיימר בפס הכחול/אפור להפעלה. כוונן זמן עם + / −.' },
          { title: 'ניווט תאריכים', body: 'חץ שמאלה = יום קודם. חץ ימינה = יום הבא (עד היום).' },
          { title: 'תוכנית אימונים', body: 'מסך הבית מציג רק תרגילים מהתוכנית הפעילה, ומונה התרגילים מחושב מולה. לעריכה: ⚙️ ← 🎯 תוכנית אימונים.' },
          { title: 'כפתורי ניווט', body: '⚙️ ניהול תרגילים ותוכנית · 📊 דוחות · 📖 מדריך · 🗓 הצגת השבוע' },
          ...( isAdmin ? [
            { title: 'ניהול מערכת (אדמין)', body: '🛡️ כניסה לניהול משתמשים, תרגילים גלובליים ודוחות לכל המשתמשים.' },
          ] : []),
        ]} />
      )}
    </div>
  )
}
