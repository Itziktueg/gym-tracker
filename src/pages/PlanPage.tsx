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

// Same tile look as the main workout screen
const CATEGORY_TILE: Record<string, { from: string; to: string; icon: string }> = {
  'פלג גוף תחתון': { from: 'from-blue-100',   to: 'to-blue-200',   icon: '🦵' },
  'גב וכתפיים':    { from: 'from-violet-100', to: 'to-violet-200', icon: '🏋️' },
  'חזה וזרועות':   { from: 'from-orange-100', to: 'to-orange-200', icon: '💪' },
  'בטן וליבה':     { from: 'from-teal-100',   to: 'to-teal-200',   icon: '⚡' },
}
const TILE_FALLBACK = { from: 'from-gray-100', to: 'to-gray-200', icon: '🏃' }

interface Props {
  userId: string
  onClose: () => void
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

function planName(p: WorkoutPlan) {
  return `תוכנית ${p.seq ?? 0}`
}

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

function PlanTile({ exercise, selected, selectable, muted, onToggle }: {
  exercise: ExerciseUser
  selected: boolean
  selectable?: boolean
  muted?: boolean
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

      {selectable && selected && (
        <span className="absolute top-1 start-1 z-10 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-[11px] font-bold">
          ✓
        </span>
      )}

      {muted && (
        <span className="absolute top-1 start-1 z-10 bg-gray-700/80 text-white text-[9px] rounded px-1 py-0.5">
          לא בשימוש
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
  const [links,     setLinks]     = useState<Record<string, Set<string>>>({})
  const [loading,   setLoading]   = useState(true)

  const [editing,   setEditing]   = useState(false)
  const [draftIds,  setDraftIds]  = useState<Set<string>>(new Set())
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [helpOpen,  setHelpOpen]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const todayISO = toISODate(new Date())
  const isSunday = new Date().getDay() === 0

  // A plan is active when today falls inside its range — not merely when it has
  // no end date, which would pick up a plan that has not started yet.
  const activePlan = plans.find(p =>
    p.start_date <= todayISO && (p.end_date === null || p.end_date >= todayISO)) ?? null
  const futurePlan = plans.find(p => p.start_date > todayISO) ?? null
  const pastPlans  = plans.filter(p => p.end_date !== null && p.end_date < todayISO)

  // Editing shapes the upcoming plan if there is one, otherwise the active plan
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
      // No is_active filter — historical plans may contain exercises since hidden
      supabase.from('exercises_user')
        .select('*').eq('user_id', userId).order('sort_order').order('name_he'),
    ])

    setError(planErr ? `שגיאת קריאה: ${planErr.message}` : null)

    const allPlans = (planData ?? []) as WorkoutPlan[]
    setPlans(allPlans)
    setExercises(exData ?? [])

    if (allPlans.length > 0) {
      const { data: linkRows } = await supabase
        .from('workout_plan_exercises')
        .select('plan_id, exercise_id')
        .in('plan_id', allPlans.map(p => p.id))

      const map: Record<string, Set<string>> = {}
      for (const r of linkRows ?? []) (map[r.plan_id] ??= new Set()).add(r.exercise_id)
      setLinks(map)
    } else {
      setLinks({})
    }
    setLoading(false)
  }

  function startEdit() {
    setDraftIds(new Set(editTarget ? links[editTarget.id] ?? new Set() : []))
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

  // What pressing save will actually do — stated up front in the editor
  function outcome() {
    if (futurePlan)  return `עריכת ${planName(futurePlan)} · תתחיל ב-${formatDate(futurePlan.start_date)}`
    if (!activePlan) return `יצירת תוכנית חדשה שתתחיל היום (${formatDate(todayISO)})`
    if (startedToday) return `עדכון ${planName(activePlan)} — לא נוצרת תוכנית חדשה`
    const nextSeq = plans.reduce((m, p) => Math.max(m, p.seq ?? 0), -1) + 1
    return `${planName(activePlan)} תיסגר אתמול · תוכנית ${nextSeq} תתחיל היום (${formatDate(todayISO)})`
  }

  async function save() {
    if (draftIds.size === 0) { setError('יש לבחור לפחות תרגיל אחד'); return }
    setSaving(true)
    setError(null)
    const ids = [...draftIds]

    const fail = (step: string, e: { message: string } | null) => {
      if (!e) return false
      setError(`${step}: ${e.message}`)
      setSaving(false)
      return true
    }

    const replaceLinks = async (planId: string) => {
      const { error: d } = await supabase.from('workout_plan_exercises')
        .delete().eq('plan_id', planId)
      if (fail('מחיקת תרגילים', d)) return true
      const { error: i } = await supabase.from('workout_plan_exercises')
        .insert(ids.map(exercise_id => ({ plan_id: planId, exercise_id })))
      return fail('שמירת תרגילים', i)
    }

    // Editing a plan that has not started, or one created today: update in place
    if (futurePlan || (activePlan && startedToday)) {
      const target = futurePlan ?? activePlan!
      if (await replaceLinks(target.id)) return
    } else {
      // Close the current plan yesterday and open a new one today
      if (activePlan) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const { error: e } = await supabase.from('workout_plans')
          .update({ end_date: toISODate(yesterday) }).eq('id', activePlan.id)
        if (fail('סגירת התוכנית הקודמת', e)) return
      }
      const nextSeq = plans.reduce((m, p) => Math.max(m, p.seq ?? 0), -1) + 1
      const { data: created, error: e2 } = await supabase.from('workout_plans')
        .insert({ user_id: userId, seq: nextSeq, name: `תוכנית ${nextSeq}`, start_date: todayISO })
        .select().single()
      if (fail('יצירת תוכנית', e2)) return
      if (!created) { setError('יצירת תוכנית לא החזירה תוצאה'); setSaving(false); return }
      if (await replaceLinks(created.id)) return
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

        {/* ── Editor ─────────────────────────────────────────── */}
        {editing ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
              <p className="text-blue-800 text-sm font-bold mb-0.5">מה יקרה בשמירה</p>
              <p className="text-blue-700 text-xs leading-relaxed">{outcome()}</p>
            </div>

            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
              <p className="text-gray-800 text-sm font-bold">
                נבחרו {draftIds.size} מתוך {activeExercises.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDraftIds(new Set(activeExercises.map(e => e.id)))}
                  className="text-blue-500 text-xs font-semibold"
                >בחר הכל</button>
                <span className="text-gray-300 text-xs">·</span>
                <button
                  onClick={() => setDraftIds(new Set())}
                  className="text-gray-400 text-xs font-semibold"
                >נקה</button>
              </div>
            </div>

            {group(activeExercises).map(g => {
              const chosen = g.items.filter(e => draftIds.has(e.id)).length
              const all = chosen === g.items.length
              return (
                <div key={g.cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[g.cat] ?? 'bg-gray-400'}`} />
                      <p className="text-gray-700 text-sm font-bold">{g.cat}</p>
                      <span className="text-gray-400 text-xs">{chosen}/{g.items.length}</span>
                    </div>
                    <button
                      onClick={() => setDraftIds(prev => {
                        const next = new Set(prev)
                        for (const e of g.items) all ? next.delete(e.id) : next.add(e.id)
                        return next
                      })}
                      className="text-blue-500 text-xs font-semibold"
                    >{all ? 'נקה' : 'בחר הכל'}</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {g.items.map(ex => (
                      <PlanTile key={ex.id} exercise={ex} selected={draftIds.has(ex.id)}
                        selectable onToggle={() => toggleDraft(ex.id)} />
                    ))}
                  </div>
                </div>
              )
            })}

            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold rounded-2xl py-4 text-base disabled:opacity-50 mt-1"
            >
              {saving ? '...' : 'שמור תוכנית ✓'}
            </button>
          </>

        /* ── Single plan detail ───────────────────────────────── */
        ) : viewingPlan ? (
          <>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-gray-800 font-bold text-sm">{planName(viewingPlan)}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {rangeLabel(viewingPlan)}
                {viewingPlan.end_date && ` · ${weeksBetween(viewingPlan.start_date, viewingPlan.end_date)} שבועות`}
                {` · ${(links[viewingPlan.id] ?? new Set()).size} תרגילים`}
              </p>
            </div>

            {group(exercises.filter(e => (links[viewingPlan.id] ?? new Set()).has(e.id))).map(g => (
              <div key={g.cat} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${CATEGORY_DOT[g.cat] ?? 'bg-gray-400'}`} />
                  <p className="text-gray-700 text-sm font-bold">{g.cat}</p>
                  <span className="text-gray-400 text-xs">{g.items.length}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 p-3">
                  {g.items.map(ex => (
                    <PlanTile key={ex.id} exercise={ex} selected={false} muted={!ex.is_active} />
                  ))}
                </div>
              </div>
            ))}
          </>

        /* ── Overview ─────────────────────────────────────────── */
        ) : (
          <>
            {activePlan ? (
              <PlanCard
                plan={activePlan}
                count={(links[activePlan.id] ?? new Set()).size}
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
                count={(links[futurePlan.id] ?? new Set()).size}
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
                        {rangeLabel(p)} · {(links[p.id] ?? new Set()).size} תרגילים
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
          { title: 'שמות התוכניות', body: 'המערכת ממספרת את התוכניות אוטומטית — תוכנית 0 היא התקופה שלפני התכנון, ואחריה 1, 2, 3... המספר נקבע פעם אחת ואינו משתנה.' },
          { title: 'בחירת תרגילים', body: 'התרגילים מוצגים בתמונות ומחולקים לפי קבוצות שריר. לחץ על תמונה כדי להוסיף או להסיר — נבחר מסומן במסגרת ירוקה ובסימן ✓.' },
          { title: 'שינוי תוכנית', body: 'ניתן לשנות תוכנית רק בימי ראשון. התוכנית הקודמת נסגרת והחדשה מתחילה באותו יום, כך שאין חפיפה וכל שבוע שייך לתוכנית אחת.' },
          { title: 'תוכנית עתידית', body: 'תוכנית שטרם התחילה ניתנת לעריכה חופשית בכל יום — כך אפשר להכין מראש את התוכנית של יום ראשון.' },
          { title: 'צפייה בתוכניות קודמות', body: 'לחץ על כל תוכנית ברשימה כדי לראות את התרגילים שהיו בה. תרגיל שהוסתר מאז מסומן "לא בשימוש".' },
        ]} />
      )}
    </div>
  )
}

function PlanCard({ plan, count, badge, tone, onClick }: {
  plan: WorkoutPlan
  count: number
  badge: string
  tone: 'green' | 'blue'
  onClick: () => void
}) {
  const c = tone === 'green'
    ? { bg: 'bg-green-50', border: 'border-green-100', title: 'text-green-800', sub: 'text-green-600', pill: 'bg-green-100 text-green-700' }
    : { bg: 'bg-blue-50',  border: 'border-blue-100',  title: 'text-blue-800',  sub: 'text-blue-600',  pill: 'bg-blue-100 text-blue-700' }

  return (
    <button
      onClick={onClick}
      className={`w-full ${c.bg} border ${c.border} rounded-2xl px-4 py-3 text-right active:opacity-80`}
    >
      <div className="flex items-center justify-between">
        <p className={`${c.title} font-bold text-sm`}>{planName(plan)}</p>
        <span className={`${c.pill} text-xs font-semibold rounded-full px-2 py-0.5`}>{badge}</span>
      </div>
      <p className={`${c.sub} text-xs mt-1`}>{rangeLabel(plan)} · {count} תרגילים</p>
    </button>
  )
}
