import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'
import type { ExerciseUser, WorkoutPlan, PlanWorkout } from '../types/database'

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_DOT: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

const CATEGORY_TILE: Record<string, { from: string; to: string; icon: string }> = {
  'פלג גוף תחתון': { from: 'from-blue-100',   to: 'to-blue-200',   icon: '🦵' },
  'גב וכתפיים':    { from: 'from-violet-100', to: 'to-violet-200', icon: '🏋️' },
  'חזה וזרועות':   { from: 'from-orange-100', to: 'to-orange-200', icon: '💪' },
  'בטן וליבה':     { from: 'from-teal-100',   to: 'to-teal-200',   icon: '⚡' },
}
const TILE_FALLBACK = { from: 'from-gray-100', to: 'to-gray-200', icon: '🏃' }

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const UNASSIGNED = '__none__'

interface Props {
  userId: string
  onClose: () => void
}

interface DraftWorkout {
  id: string            // real uuid, or 'tmp-N' for one not yet saved
  name: string
  day_of_week: number | null
  seq: number
}

/** Local calendar date as YYYY-MM-DD (toISOString would shift by timezone) */
function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function planName(p: WorkoutPlan) { return `תוכנית ${p.seq ?? 0}` }

function rangeLabel(p: WorkoutPlan) {
  return p.end_date
    ? `${formatDate(p.start_date)} — ${formatDate(p.end_date)}`
    : `מ-${formatDate(p.start_date)}`
}

function weeksBetween(startISO: string, endISO: string) {
  const [ys, ms, ds] = startISO.split('-').map(Number)
  const [ye, me, de] = endISO.split('-').map(Number)
  const days = Math.round(
    (new Date(ye, me - 1, de).getTime() - new Date(ys, ms - 1, ds).getTime()) / 86400000
  ) + 1
  return Math.max(1, Math.round(days / 7))
}

function PlanTile({ exercise, selected, selectable, badge, onToggle }: {
  exercise: ExerciseUser
  selected: boolean
  selectable?: boolean
  badge?: string
  onToggle?: () => void
}) {
  const cat = CATEGORY_TILE[exercise.category ?? ''] ?? TILE_FALLBACK

  return (
    <button
      onClick={onToggle}
      disabled={!selectable}
      className={`
        relative rounded-xl overflow-hidden flex flex-col w-full
        bg-gradient-to-b ${cat.from} ${cat.to}
        ${selected ? 'ring-[3px] ring-green-500' : 'ring-1 ring-black/10'}
        ${selectable && !selected ? 'opacity-45' : ''}
        ${selectable ? 'active:scale-95 transition-transform' : ''}
      `}
      style={{ aspectRatio: '1/1' }}
    >
      {exercise.image_url ? (
        <img src={exercise.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-3xl">{cat.icon}</span>
        </div>
      )}

      {selected && selectable && (
        <span className="absolute top-1 start-1 z-10 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-[11px] font-bold">
          ✓
        </span>
      )}

      {badge && !selected && (
        <span className="absolute top-1 start-1 z-10 bg-gray-800/85 text-white text-[9px] rounded px-1 py-0.5 max-w-[85%] truncate">
          {badge}
        </span>
      )}

      <div className={`absolute bottom-0 left-0 right-0 px-1 py-1 ${exercise.image_url ? 'bg-black/55' : 'bg-white/60'}`}>
        <p
          className={`font-bold text-center leading-tight line-clamp-2 ${exercise.image_url ? 'text-white' : 'text-gray-800'}`}
          style={{ fontSize: '11px' }}
        >
          {exercise.name_he}
        </p>
      </div>
    </button>
  )
}

export default function PlanPage({ userId, onClose }: Props) {
  const [plans,     setPlans]     = useState<WorkoutPlan[]>([])
  const [exercises, setExercises] = useState<ExerciseUser[]>([])   // ALL, incl. hidden
  const [workouts,  setWorkouts]  = useState<Record<string, PlanWorkout[]>>({})
  // planId -> (exerciseId -> workoutId | null)
  const [links,     setLinks]     = useState<Record<string, Map<string, string | null>>>({})
  const [loading,   setLoading]   = useState(true)

  const [editing,       setEditing]       = useState(false)
  const [draftWorkouts, setDraftWorkouts] = useState<DraftWorkout[]>([])
  const [draftAssign,   setDraftAssign]   = useState<Map<string, string | null>>(new Map())
  const [activeTab,     setActiveTab]     = useState<string>(UNASSIGNED)
  const [viewingId,     setViewingId]     = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [helpOpen,      setHelpOpen]      = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const todayISO = toISODate(new Date())
  const isSunday = new Date().getDay() === 0

  const activePlan = plans.find(p =>
    p.start_date <= todayISO && (p.end_date === null || p.end_date >= todayISO)) ?? null
  const futurePlan = plans.find(p => p.start_date > todayISO) ?? null
  const pastPlans  = plans.filter(p => p.end_date !== null && p.end_date < todayISO)

  const editTarget   = futurePlan ?? activePlan
  const startedToday = activePlan?.start_date === todayISO
  const canEdit = !activePlan || !!futurePlan || startedToday || isSunday

  const activeExercises = exercises.filter(e => e.is_active)

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const [{ data: planData, error: planErr }, { data: exData }] = await Promise.all([
      supabase.from('workout_plans')
        .select('*').eq('user_id', userId).order('start_date', { ascending: false }),
      supabase.from('exercises_user')
        .select('*').eq('user_id', userId).order('sort_order').order('name_he'),
    ])

    setError(planErr ? `שגיאת קריאה: ${planErr.message}` : null)

    const allPlans = (planData ?? []) as WorkoutPlan[]
    setPlans(allPlans)
    setExercises(exData ?? [])

    if (allPlans.length > 0) {
      const ids = allPlans.map(p => p.id)
      const [{ data: linkRows }, { data: woRows }] = await Promise.all([
        supabase.from('workout_plan_exercises')
          .select('plan_id, exercise_id, workout_id').in('plan_id', ids),
        supabase.from('plan_workouts')
          .select('*').in('plan_id', ids).order('seq'),
      ])

      const lm: Record<string, Map<string, string | null>> = {}
      for (const r of linkRows ?? []) {
        (lm[r.plan_id] ??= new Map()).set(r.exercise_id, r.workout_id ?? null)
      }
      setLinks(lm)

      const wm: Record<string, PlanWorkout[]> = {}
      for (const w of (woRows ?? []) as PlanWorkout[]) (wm[w.plan_id] ??= []).push(w)
      setWorkouts(wm)
    } else {
      setLinks({}); setWorkouts({})
    }
    setLoading(false)
  }

  function startEdit() {
    if (!editTarget) {
      setDraftWorkouts([]); setDraftAssign(new Map()); setActiveTab(UNASSIGNED)
    } else {
      const wos = (workouts[editTarget.id] ?? []).map(w => ({
        id: w.id, name: w.name, day_of_week: w.day_of_week, seq: w.seq,
      }))
      setDraftWorkouts(wos)
      setDraftAssign(new Map(links[editTarget.id] ?? new Map()))
      setActiveTab(wos.length > 0 ? wos[0].id : UNASSIGNED)
    }
    setEditing(true)
  }

  // Tapping a tile inside a workout tab: add, move here, or remove from the plan
  function toggleInTab(exId: string) {
    setDraftAssign(prev => {
      const next = new Map(prev)
      const current = next.has(exId) ? next.get(exId) ?? null : undefined
      const target = activeTab === UNASSIGNED ? null : activeTab

      if (current === target) next.delete(exId)   // already here → drop from plan
      else next.set(exId, target)                 // not in plan, or in another workout → put here
      return next
    })
  }

  function addWorkout() {
    setDraftWorkouts(prev => {
      const seq = prev.reduce((m, w) => Math.max(m, w.seq), 0) + 1
      const w = { id: `tmp-${Date.now()}`, name: `אימון ${seq}`, day_of_week: null, seq }
      setActiveTab(w.id)
      return [...prev, w]
    })
  }

  function updateWorkout(id: string, patch: Partial<DraftWorkout>) {
    setDraftWorkouts(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w))
  }

  function removeWorkout(id: string) {
    setDraftWorkouts(prev => prev.filter(w => w.id !== id))
    // Its exercises stay in the plan, just unassigned
    setDraftAssign(prev => {
      const next = new Map(prev)
      for (const [ex, wo] of next) if (wo === id) next.set(ex, null)
      return next
    })
    setActiveTab(UNASSIGNED)
  }

  function outcome() {
    if (futurePlan)   return `עריכת ${planName(futurePlan)} · תתחיל ב-${formatDate(futurePlan.start_date)}`
    if (!activePlan)  return `יצירת תוכנית חדשה שתתחיל היום (${formatDate(todayISO)})`
    if (startedToday) return `עדכון ${planName(activePlan)} — לא נוצרת תוכנית חדשה`
    const nextSeq = plans.reduce((m, p) => Math.max(m, p.seq ?? 0), -1) + 1
    return `${planName(activePlan)} תיסגר אתמול · תוכנית ${nextSeq} תתחיל היום (${formatDate(todayISO)})`
  }

  async function save() {
    if (draftAssign.size === 0) { setError('יש לבחור לפחות תרגיל אחד'); return }
    setSaving(true)
    setError(null)

    const fail = (step: string, e: { message: string } | null) => {
      if (!e) return false
      setError(`${step}: ${e.message}`)
      setSaving(false)
      return true
    }

    // draft workout id -> real id in the plan being written
    const idMap = new Map<string, string>()

    async function writeLinks(planId: string) {
      const { error: d } = await supabase.from('workout_plan_exercises')
        .delete().eq('plan_id', planId)
      if (fail('מחיקת תרגילים', d)) return true

      const rows = [...draftAssign.entries()].map(([exercise_id, wo]) => ({
        plan_id: planId,
        exercise_id,
        workout_id: wo ? idMap.get(wo) ?? wo : null,
      }))
      const { error: i } = await supabase.from('workout_plan_exercises').insert(rows)
      return fail('שמירת תרגילים', i)
    }

    const inPlace = futurePlan || (activePlan && startedToday)

    if (inPlace) {
      const target = (futurePlan ?? activePlan)!
      const existing = workouts[target.id] ?? []
      const keep = new Set(draftWorkouts.map(w => w.id))

      // Delete only workouts genuinely removed. Recreating them all would null
      // out workout_id on historical logs via ON DELETE SET NULL.
      const gone = existing.filter(w => !keep.has(w.id)).map(w => w.id)
      if (gone.length) {
        const { error } = await supabase.from('plan_workouts').delete().in('id', gone)
        if (fail('מחיקת אימון', error)) return
      }

      for (const w of draftWorkouts) {
        if (w.id.startsWith('tmp-')) {
          const { data, error } = await supabase.from('plan_workouts')
            .insert({ plan_id: target.id, name: w.name, day_of_week: w.day_of_week, seq: w.seq })
            .select().single()
          if (fail('יצירת אימון', error)) return
          if (data) idMap.set(w.id, data.id)
        } else {
          const { error } = await supabase.from('plan_workouts')
            .update({ name: w.name, day_of_week: w.day_of_week, seq: w.seq }).eq('id', w.id)
          if (fail('עדכון אימון', error)) return
        }
      }

      if (await writeLinks(target.id)) return
    } else {
      if (activePlan) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const { error } = await supabase.from('workout_plans')
          .update({ end_date: toISODate(yesterday) }).eq('id', activePlan.id)
        if (fail('סגירת התוכנית הקודמת', error)) return
      }

      const nextSeq = plans.reduce((m, p) => Math.max(m, p.seq ?? 0), -1) + 1
      const { data: created, error: e2 } = await supabase.from('workout_plans')
        .insert({ user_id: userId, seq: nextSeq, name: `תוכנית ${nextSeq}`, start_date: todayISO })
        .select().single()
      if (fail('יצירת תוכנית', e2)) return
      if (!created) { setError('יצירת תוכנית לא החזירה תוצאה'); setSaving(false); return }

      // Every workout is new in a new plan, so the old plan keeps its own rows
      // and the log attribution recorded against them stays intact.
      for (const w of draftWorkouts) {
        const { data, error } = await supabase.from('plan_workouts')
          .insert({ plan_id: created.id, name: w.name, day_of_week: w.day_of_week, seq: w.seq })
          .select().single()
        if (fail('יצירת אימון', error)) return
        if (data) idMap.set(w.id, data.id)
      }

      if (await writeLinks(created.id)) return
    }

    setSaving(false)
    setEditing(false)
    await load()
  }

  function group(list: ExerciseUser[]) {
    const known = CATEGORY_ORDER
      .map(cat => ({ cat, items: list.filter(e => (e.category ?? '') === cat) }))
      .filter(g => g.items.length > 0)
    const rest = list.filter(e => !CATEGORY_ORDER.includes(e.category ?? ''))
    return rest.length > 0 ? [...known, { cat: 'אחר', items: rest }] : known
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" dir="rtl">
        <p className="text-gray-400">טוען...</p>
      </div>
    )
  }

  const viewingPlan = viewingId ? plans.find(p => p.id === viewingId) ?? null : null
  const editingWorkout = draftWorkouts.find(w => w.id === activeTab) ?? null
  const unassignedCount = [...draftAssign.values()].filter(v => v === null).length

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button
          onClick={() => {
            if (editing) setEditing(false)
            else if (viewingPlan) setViewingId(null)
            else onClose()
          }}
          className="text-gray-500 text-sm font-medium"
        >
          {editing ? 'ביטול' : 'חזור'}
        </button>
        <h1 className="text-gray-800 font-bold text-lg">
          {viewingPlan && !editing ? planName(viewingPlan) : 'תוכנית אימונים'}
        </h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
        >?</button>
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-red-800 text-sm font-bold mb-0.5">הפעולה נכשלה</p>
            <p className="text-red-600 text-xs leading-relaxed break-words">{error}</p>
          </div>
        )}

        {editing ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <p className="text-blue-800 text-sm font-bold mb-0.5">מה יקרה בשמירה</p>
              <p className="text-blue-700 text-xs leading-relaxed">{outcome()}</p>
            </div>

            {/* Workout tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[...draftWorkouts].sort((a, b) => a.seq - b.seq).map(w => {
                const n = [...draftAssign.values()].filter(v => v === w.id).length
                return (
                  <button
                    key={w.id}
                    onClick={() => setActiveTab(w.id)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold ${
                      activeTab === w.id ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 shadow-sm'
                    }`}
                  >
                    {w.name} · {n}
                  </button>
                )
              })}
              {(unassignedCount > 0 || draftWorkouts.length === 0) && (
                <button
                  onClick={() => setActiveTab(UNASSIGNED)}
                  className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold ${
                    activeTab === UNASSIGNED ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 shadow-sm'
                  }`}
                >
                  {draftWorkouts.length === 0 ? `כל התרגילים · ${draftAssign.size}` : `ללא שיוך · ${unassignedCount}`}
                </button>
              )}
              <button
                onClick={addWorkout}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-white text-blue-500 shadow-sm"
              >
                + אימון
              </button>
            </div>

            {/* Selected workout settings */}
            {editingWorkout && (
              <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <div>
                  <label className="text-gray-500 text-xs font-medium block mb-1.5">שם האימון</label>
                  <input
                    value={editingWorkout.name}
                    onChange={e => updateWorkout(editingWorkout.id, { name: e.target.value })}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-xs font-medium block mb-1.5">יום מועדף</label>
                  <select
                    value={editingWorkout.day_of_week ?? ''}
                    onChange={e => updateWorkout(editingWorkout.id, {
                      day_of_week: e.target.value === '' ? null : Number(e.target.value),
                    })}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="">ללא יום קבוע</option>
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>יום {d}</option>)}
                  </select>
                  <p className="text-gray-400 text-xs mt-1.5">
                    היום הוא המלצה בלבד — סדר האימונים הוא שקובע מה הבא בתור.
                  </p>
                </div>
                <button
                  onClick={() => removeWorkout(editingWorkout.id)}
                  className="text-red-500 text-xs font-semibold self-start"
                >
                  מחק אימון זה
                </button>
              </div>
            )}

            {draftWorkouts.length > 0 && activeTab === UNASSIGNED && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-amber-800 text-xs leading-relaxed">
                  התרגילים האלה בתוכנית אך אינם משויכים לאף אימון. עבור לטאב של אימון ולחץ עליהם כדי לשייך.
                </p>
              </div>
            )}

            {/* The selected workout's own contents come first, so the split is
                visible as a group rather than scattered across category cards */}
            {(() => {
              const target = activeTab === UNASSIGNED ? null : activeTab
              const isIn = (ex: ExerciseUser) =>
                draftAssign.has(ex.id) && (draftAssign.get(ex.id) ?? null) === target
              const inWorkout = activeExercises.filter(isIn)
              const rest = activeExercises.filter(ex => !isIn(ex))
              const title = editingWorkout ? editingWorkout.name : 'ללא שיוך'

              return (
                <>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center justify-between gap-2">
                      <p className="text-green-800 text-sm font-bold truncate">{title}</p>
                      <span className="text-green-600 text-xs font-semibold shrink-0">
                        {inWorkout.length} תרגילים
                      </span>
                    </div>
                    {inWorkout.length === 0 ? (
                      <p className="text-gray-400 text-xs text-center px-4 py-6">
                        אין עדיין תרגילים באימון זה — בחר מהרשימה למטה.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 p-3">
                        {inWorkout.map(ex => (
                          <PlanTile key={ex.id} exercise={ex} selected selectable
                            onToggle={() => toggleInTab(ex.id)} />
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-gray-500 text-xs font-bold px-1 pt-1">הוספת תרגילים</p>

                  {group(rest).map(g => (
                    <div key={g.cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[g.cat] ?? 'bg-gray-400'}`} />
                        <p className="text-gray-700 text-sm font-bold">{g.cat}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 p-3">
                        {g.items.map(ex => {
                          const assigned = draftAssign.has(ex.id)
                            ? draftAssign.get(ex.id) ?? null : undefined
                          const other = assigned !== undefined
                            ? draftWorkouts.find(w => w.id === assigned)?.name ?? 'ללא שיוך'
                            : undefined
                          return (
                            <PlanTile key={ex.id} exercise={ex} selected={false} selectable
                              badge={other} onToggle={() => toggleInTab(ex.id)} />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )
            })()}

            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold rounded-2xl py-4 text-base disabled:opacity-50 mt-1"
            >
              {saving ? '...' : 'שמור תוכנית ✓'}
            </button>
          </>

        ) : viewingPlan ? (
          <PlanDetail
            plan={viewingPlan}
            workouts={workouts[viewingPlan.id] ?? []}
            assign={links[viewingPlan.id] ?? new Map()}
            exercises={exercises}
            group={group}
          />

        ) : (
          <>
            {activePlan ? (
              <PlanCard
                plan={activePlan}
                count={(links[activePlan.id] ?? new Map()).size}
                workouts={(workouts[activePlan.id] ?? []).length}
                badge="פעילה"
                tone="green"
                onClick={() => setViewingId(activePlan.id)}
              />
            ) : (
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <p className="text-4xl mb-2">🎯</p>
                <p className="text-gray-800 font-bold text-sm">אין תוכנית פעילה</p>
                <p className="text-gray-400 text-xs mt-1">
                  כל התרגילים שלך מוצגים במסך הבית עד ליצירת תוכנית.
                </p>
              </div>
            )}

            {futurePlan && (
              <PlanCard
                plan={futurePlan}
                count={(links[futurePlan.id] ?? new Map()).size}
                workouts={(workouts[futurePlan.id] ?? []).length}
                badge={`מתחילה ${formatDate(futurePlan.start_date)}`}
                tone="blue"
                onClick={() => setViewingId(futurePlan.id)}
              />
            )}

            <button
              onClick={startEdit}
              disabled={!canEdit}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-2xl py-3.5 text-sm disabled:opacity-40"
            >
              {futurePlan ? `עריכת ${planName(futurePlan)}`
                : activePlan ? 'שינוי התוכנית'
                : 'יצירת תוכנית'}
            </button>

            {!canEdit && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-amber-800 text-xs leading-relaxed">
                  ניתן לשנות תוכנית רק בימי ראשון — היום הראשון בשבוע האימונים,
                  כך שכל שבוע שייך לתוכנית אחת בלבד.
                </p>
              </div>
            )}

            {pastPlans.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden mt-1">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-gray-500 text-xs font-bold">תוכניות קודמות</p>
                </div>
                {pastPlans.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setViewingId(p.id)}
                    className="w-full px-4 py-3 border-b border-gray-50 flex items-center gap-3 text-right active:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-sm font-medium">{planName(p)}</p>
                      <p className="text-gray-400 text-xs mt-0.5">
                        {rangeLabel(p)} · {(links[p.id] ?? new Map()).size} תרגילים
                      </p>
                    </div>
                    <span className="text-gray-300 text-lg shrink-0">›</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מהי תוכנית אימונים?', body: 'רשימת התרגילים שאתה מתכנן לבצע בתקופה מסוימת. רק תרגילים מהתוכנית הפעילה מוצגים במסך הבית.' },
          { title: 'מהו אימון?', body: 'תוכנית מתחלקת לאימונים — בדרך כלל 2 עד 4 בשבוע (למשל רגליים / דחיפה / משיכה). כל תרגיל שייך לאימון אחד בלבד.' },
          { title: 'הוספת אימון', body: 'לחץ "+ אימון" בעריכה. תן שם, ואם תרצה בחר יום מועדף. היום הוא המלצה — סדר האימונים קובע מה הבא בתור.' },
          { title: 'שיוך תרגילים', body: 'בחר טאב של אימון ולחץ על תרגילים כדי לשייך אליו. תרגיל שכבר שייך לאימון אחר מציג את שמו — לחיצה עליו תעביר אותו לאימון הנוכחי.' },
          { title: 'ללא שיוך', body: 'תרגילים שנוספו לפני שהוגדרו אימונים מופיעים בטאב "ללא שיוך" עד ששייכת אותם.' },
          { title: 'שמות התוכניות', body: 'המערכת ממספרת אוטומטית — תוכנית 0 היא התקופה שלפני התכנון, ואחריה 1, 2, 3...' },
          { title: 'שינוי תוכנית', body: 'ניתן לשנות תוכנית פעילה רק בימי ראשון. תוכנית שטרם התחילה ניתנת לעריכה בכל יום.' },
        ]} />
      )}
    </div>
  )
}

function PlanDetail({ plan, workouts, assign, exercises, group }: {
  plan: WorkoutPlan
  workouts: PlanWorkout[]
  assign: Map<string, string | null>
  exercises: ExerciseUser[]
  group: (l: ExerciseUser[]) => { cat: string; items: ExerciseUser[] }[]
}) {
  const byId = new Map(exercises.map(e => [e.id, e]))
  const unassigned = [...assign.entries()].filter(([, w]) => w === null)
    .map(([e]) => byId.get(e)).filter((e): e is ExerciseUser => !!e)

  const sections = [
    ...workouts.map(w => ({
      key: w.id,
      title: w.name,
      subtitle: w.day_of_week !== null ? `יום ${DAY_NAMES[w.day_of_week]}` : 'ללא יום קבוע',
      items: [...assign.entries()].filter(([, wo]) => wo === w.id)
        .map(([e]) => byId.get(e)).filter((e): e is ExerciseUser => !!e),
    })),
    ...(unassigned.length > 0
      ? [{ key: 'none', title: workouts.length ? 'ללא שיוך' : 'תרגילים', subtitle: '', items: unassigned }]
      : []),
  ]

  return (
    <>
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
        <p className="text-gray-800 font-bold text-sm">{planName(plan)}</p>
        <p className="text-gray-400 text-xs mt-0.5">
          {rangeLabel(plan)}
          {plan.end_date && ` · ${weeksBetween(plan.start_date, plan.end_date)} שבועות`}
          {` · ${assign.size} תרגילים`}
          {workouts.length > 0 && ` · ${workouts.length} אימונים`}
        </p>
      </div>

      {sections.map(s => (
        <div key={s.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <p className="text-gray-700 text-sm font-bold">{s.title}</p>
            <p className="text-gray-400 text-xs">{s.subtitle} · {s.items.length}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {group(s.items).flatMap(g => g.items).map(ex => (
              <PlanTile key={ex.id} exercise={ex} selected={false}
                badge={!ex.is_active ? 'לא בשימוש' : undefined} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function PlanCard({ plan, count, workouts, badge, tone, onClick }: {
  plan: WorkoutPlan
  count: number
  workouts: number
  badge: string
  tone: 'green' | 'blue'
  onClick: () => void
}) {
  const c = tone === 'green'
    ? { bg: 'bg-green-50', border: 'border-green-100', title: 'text-green-800', sub: 'text-green-600', pill: 'bg-green-100 text-green-700' }
    : { bg: 'bg-blue-50',  border: 'border-blue-100',  title: 'text-blue-800',  sub: 'text-blue-600',  pill: 'bg-blue-100 text-blue-700' }

  return (
    <button onClick={onClick}
      className={`w-full ${c.bg} border ${c.border} rounded-2xl px-4 py-3 text-right active:opacity-80`}>
      <div className="flex items-center justify-between">
        <p className={`${c.title} font-bold text-sm`}>{planName(plan)}</p>
        <span className={`${c.pill} text-xs font-semibold rounded-full px-2 py-0.5`}>{badge}</span>
      </div>
      <p className={`${c.sub} text-xs mt-1`}>
        {rangeLabel(plan)} · {count} תרגילים{workouts > 0 && ` · ${workouts} אימונים`}
      </p>
    </button>
  )
}
