import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'
import type { ExerciseUser, WorkoutPlan } from '../types/database'

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_DOT: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

interface Props {
  userId: string
  onClose: () => void
}

/** Local calendar date as YYYY-MM-DD (never use toISOString — it shifts by timezone) */
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

export default function PlanPage({ userId, onClose }: Props) {
  const [plans,     setPlans]     = useState<WorkoutPlan[]>([])
  const [exercises, setExercises] = useState<ExerciseUser[]>([])
  const [planIds,   setPlanIds]   = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)

  const [editing,   setEditing]   = useState(false)
  const [draftIds,  setDraftIds]  = useState<Set<string>>(new Set())
  const [draftName, setDraftName] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [helpOpen,  setHelpOpen]  = useState(false)

  const todayISO = toISODate(new Date())
  const isSunday = new Date().getDay() === 0

  const activePlan   = plans.find(p => p.end_date === null) ?? null
  const pastPlans    = plans.filter(p => p.end_date !== null)
  const startedToday = activePlan?.start_date === todayISO

  // First plan → any day. Same-day fix → any day. Otherwise → Sundays only.
  const canEdit = !activePlan || startedToday || isSunday

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const [{ data: planData }, { data: exData }] = await Promise.all([
      supabase.from('workout_plans')
        .select('*').eq('user_id', userId).order('start_date', { ascending: false }),
      supabase.from('exercises_user')
        .select('*').eq('user_id', userId).eq('is_active', true)
        .order('sort_order').order('name_he'),
    ])

    const allPlans = (planData ?? []) as WorkoutPlan[]
    setPlans(allPlans)
    setExercises(exData ?? [])

    const active = allPlans.find(p => p.end_date === null)
    if (active) {
      const { data: rows } = await supabase
        .from('workout_plan_exercises').select('exercise_id').eq('plan_id', active.id)
      setPlanIds(new Set((rows ?? []).map(r => r.exercise_id)))
    } else {
      setPlanIds(new Set())
    }
    setLoading(false)
  }

  function startEdit() {
    setDraftIds(new Set(planIds))
    setDraftName(activePlan?.name ?? `תוכנית ${plans.length + 1}`)
    setEditing(true)
  }

  function toggleDraft(id: string) {
    setDraftIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (draftIds.size === 0) {
      alert('יש לבחור לפחות תרגיל אחד')
      return
    }
    setSaving(true)
    const ids  = [...draftIds]
    const name = draftName.trim() || null

    if (activePlan && startedToday) {
      // Same-day correction — update the plan in place, no new version
      await supabase.from('workout_plans').update({ name }).eq('id', activePlan.id)
      await supabase.from('workout_plan_exercises').delete().eq('plan_id', activePlan.id)
      await supabase.from('workout_plan_exercises')
        .insert(ids.map(exercise_id => ({ plan_id: activePlan.id, exercise_id })))
    } else {
      // Close the old plan yesterday (Saturday) and open the new one today (Sunday)
      if (activePlan) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        await supabase.from('workout_plans')
          .update({ end_date: toISODate(yesterday) }).eq('id', activePlan.id)
      }
      const { data: created } = await supabase.from('workout_plans')
        .insert({ user_id: userId, name, start_date: todayISO })
        .select().single()
      if (created) {
        await supabase.from('workout_plan_exercises')
          .insert(ids.map(exercise_id => ({ plan_id: created.id, exercise_id })))
      }
    }

    setSaving(false)
    setEditing(false)
    await load()
  }

  // Group exercises by category, keeping any unknown category in a trailing bucket
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button
          onClick={() => editing ? setEditing(false) : onClose()}
          className="text-gray-500 text-sm font-medium"
        >
          {editing ? 'ביטול' : 'חזור'}
        </button>
        <h1 className="text-gray-800 font-bold text-lg">תוכנית אימונים</h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
        >?</button>
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
        {editing ? (
          <>
            {/* Name */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="text-gray-500 text-xs font-medium block mb-1.5">שם התוכנית</label>
              <input
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-gray-400 text-xs mt-2">
                {activePlan && !startedToday
                  ? `התוכנית הקודמת תיסגר אתמול, והתוכנית החדשה תתחיל היום (${formatDate(todayISO)}).`
                  : `תאריך תחילת התוכנית: ${formatDate(todayISO)}`}
              </p>
            </div>

            {/* Counter + bulk actions */}
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
              <p className="text-gray-800 text-sm font-bold">
                נבחרו {draftIds.size} מתוך {exercises.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDraftIds(new Set(exercises.map(e => e.id)))}
                  className="text-blue-500 text-xs font-semibold"
                >בחר הכל</button>
                <span className="text-gray-300 text-xs">·</span>
                <button
                  onClick={() => setDraftIds(new Set())}
                  className="text-gray-400 text-xs font-semibold"
                >נקה</button>
              </div>
            </div>

            {/* Picker */}
            {group(exercises).map(g => (
              <div key={g.cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[g.cat] ?? 'bg-gray-400'}`} />
                  <p className="text-gray-700 text-sm font-bold">{g.cat}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {g.items.map(ex => (
                    <label key={ex.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftIds.has(ex.id)}
                        onChange={() => toggleDraft(ex.id)}
                        className="w-4 h-4 shrink-0"
                      />
                      <span className="text-gray-800 text-sm flex-1 truncate">{ex.name_he}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold rounded-2xl py-4 text-base disabled:opacity-50 mt-1"
            >
              {saving ? '...' : 'שמור תוכנית ✓'}
            </button>
          </>
        ) : (
          <>
            {activePlan ? (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                  <div className="flex items-center justify-between">
                    <p className="text-green-800 font-bold text-sm">
                      {activePlan.name ?? 'תוכנית פעילה'}
                    </p>
                    <span className="text-green-600 text-xs font-semibold bg-green-100 rounded-full px-2 py-0.5">
                      פעילה
                    </span>
                  </div>
                  <p className="text-green-600 text-xs mt-1">
                    מתאריך {formatDate(activePlan.start_date)} · {planIds.size} תרגילים
                  </p>
                </div>

                {group(exercises.filter(e => planIds.has(e.id))).map(g => (
                  <div key={g.cat}>
                    <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[g.cat] ?? 'bg-gray-400'}`} />
                      <p className="text-gray-500 text-xs font-bold">{g.cat}</p>
                    </div>
                    {g.items.map(ex => (
                      <p key={ex.id} className="px-4 py-2.5 text-gray-800 text-sm border-b border-gray-50">
                        {ex.name_he}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <p className="text-4xl mb-2">🎯</p>
                <p className="text-gray-800 font-bold text-sm">אין תוכנית פעילה</p>
                <p className="text-gray-400 text-xs mt-1">
                  כל התרגילים שלך מוצגים במסך הבית עד ליצירת תוכנית.
                </p>
              </div>
            )}

            <button
              onClick={startEdit}
              disabled={!canEdit}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-2xl py-3.5 text-sm disabled:opacity-40"
            >
              {activePlan ? 'עריכת תוכנית' : 'יצירת תוכנית'}
            </button>

            {!canEdit && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-amber-800 text-xs leading-relaxed">
                  ניתן לשנות תוכנית רק בימי ראשון — היום הראשון בשבוע האימונים.
                  כך כל שבוע שייך לתוכנית אחת בלבד.
                </p>
              </div>
            )}

            {/* Past plans */}
            {pastPlans.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden mt-1">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-gray-500 text-xs font-bold">תוכניות קודמות</p>
                </div>
                {pastPlans.map(p => (
                  <div key={p.id} className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <p className="text-gray-700 text-sm">{p.name ?? 'תוכנית'}</p>
                    <p className="text-gray-400 text-xs">
                      {formatDate(p.start_date)} — {formatDate(p.end_date!)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מהי תוכנית אימונים?', body: 'רשימת התרגילים שאתה מתכנן לבצע בתקופה הנוכחית. רק תרגילים מהתוכנית מוצגים במסך הבית.' },
          { title: 'סטטיסטיקה', body: 'מוני "תרגילים" של היום ושל השבוע מחושבים מול התוכנית — לדוגמה 7 מתוך 14 ולא מתוך כל התרגילים.' },
          { title: 'שינוי תוכנית', body: 'ניתן לשנות תוכנית רק בימי ראשון. התוכנית הקודמת נסגרת בשבת והחדשה מתחילה באותו יום ראשון — כך אין חפיפה.' },
          { title: 'תיקון באותו יום', body: 'ביום שבו נוצרה התוכנית ניתן לערוך אותה חופשית ללא יצירת גרסה חדשה.' },
          { title: 'תוכניות קודמות', body: 'כל תוכנית נשמרת עם תאריכי התחלה וסיום, לצורך דוחות השוואה עתידיים.' },
        ]} />
      )}
    </div>
  )
}
