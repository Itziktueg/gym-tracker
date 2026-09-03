import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'
import type { ExerciseUser, WorkoutPlan } from '../types/database'

interface Props {
  userId: string
  onClose: () => void
}

interface WeekRow {
  sunday:    string        // YYYY-MM-DD
  weekNo:    number
  hasPlan:   boolean
  planned:   { workouts: number; ex: number; sets: number; reps: number; intensity: number }
  actual:    { workouts: number; ex: number; sets: number; reps: number; intensity: number }
  overall:   number | null // average of the available metric percentages
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sundayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - dt.getDay())
  return toISODate(dt)
}

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return toISODate(dt)
}

function weekNumber(sundayISO: string) {
  const [y, m, d] = sundayISO.split('-').map(Number)
  const sun = new Date(y, m - 1, d)
  const jan1 = new Date(y, 0, 1)
  return Math.floor((sun.getTime() - jan1.getTime()) / (7 * 86400000)) + 1
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

function pct(actual: number, planned: number): number | null {
  if (planned <= 0) return null
  return Math.round((actual / planned) * 100)
}

function pctClass(p: number | null) {
  if (p === null) return 'text-gray-300'
  if (p >= 90) return 'text-green-600'
  if (p >= 70) return 'text-blue-600'
  if (p >= 50) return 'text-amber-600'
  return 'text-red-500'
}

const W = { week: 68, metric: 62, total: 58 }

export default function PlanVsActualPage({ userId, onClose }: Props) {
  const [rows,     setRows]     = useState<WeekRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)

    const [{ data: planData }, { data: exData }] = await Promise.all([
      supabase.from('workout_plans')
        .select('*').eq('user_id', userId).order('start_date'),
      supabase.from('exercises_user')
        .select('*').eq('user_id', userId),
    ])

    const plans = (planData ?? []) as WorkoutPlan[]
    const exMap = new Map((exData ?? []).map(e => [e.id, e as ExerciseUser]))

    // Plan -> exercise ids, plan -> (exercise -> workout), plan -> workout ids
    const links: Record<string, string[]> = {}
    const assignOf: Record<string, Map<string, string | null>> = {}
    const workoutsOf: Record<string, string[]> = {}

    if (plans.length > 0) {
      const ids = plans.map(p => p.id)
      const [{ data: linkRows }, { data: woRows }] = await Promise.all([
        supabase.from('workout_plan_exercises')
          .select('plan_id, exercise_id, workout_id').in('plan_id', ids),
        supabase.from('plan_workouts').select('id, plan_id').in('plan_id', ids),
      ])
      for (const r of linkRows ?? []) {
        (links[r.plan_id] ??= []).push(r.exercise_id)
        ;(assignOf[r.plan_id] ??= new Map()).set(r.exercise_id, r.workout_id ?? null)
      }
      for (const w of woRows ?? []) (workoutsOf[w.plan_id] ??= []).push(w.id)
    }

    // Page through logs — a silent 1000-row cut would skew every number here
    let logs: { exercise_id: string; logged_at: string; sets_completed: number;
                reps_completed: number; intensity: number }[] = []
    let from = 0
    for (;;) {
      const { data } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, sets_completed, reps_completed, intensity')
        .eq('user_id', userId)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      logs = logs.concat(data)
      if (data.length < 1000) break
      from += 1000
    }

    if (plans.length === 0 && logs.length === 0) { setRows([]); setLoading(false); return }

    // Week span: from the earliest plan start or first log, through this week
    const starts = [
      ...plans.map(p => p.start_date),
      ...logs.map(l => l.logged_at.slice(0, 10)),
    ]
    const firstSunday = sundayOf(starts.reduce((a, b) => (a < b ? a : b)))
    const thisSunday  = sundayOf(toISODate(new Date()))

    // Bucket logs by week
    const logsByWeek: Record<string, typeof logs> = {}
    for (const l of logs) {
      const s = sundayOf(l.logged_at.slice(0, 10))
      ;(logsByWeek[s] ??= []).push(l)
    }

    const out: WeekRow[] = []
    for (let s = firstSunday; s <= thisSunday; s = addDays(s, 7)) {
      // The plan in force on that week's Sunday governs the whole week
      const plan = plans.find(p =>
        p.start_date <= s && (p.end_date === null || p.end_date >= s)) ?? null

      const planExIds = plan ? links[plan.id] ?? [] : []
      const planSet   = new Set(planExIds)

      const planWorkoutIds = plan ? workoutsOf[plan.id] ?? [] : []
      const assign = plan ? assignOf[plan.id] ?? new Map<string, string | null>() : new Map<string, string | null>()

      const planned = { workouts: planWorkoutIds.length, ex: planExIds.length, sets: 0, reps: 0, intensity: 0 }
      for (const id of planExIds) {
        const e = exMap.get(id)
        if (!e) continue
        const factor = (e.is_bilateral || e.double_weight) ? 2 : 1
        planned.sets      += e.default_sets
        planned.reps      += e.default_sets * e.default_reps
        planned.intensity += e.default_sets * e.default_reps * e.default_weight * factor
      }

      // Only plan exercises count, so both sides measure the same thing
      const weekLogs = (logsByWeek[s] ?? []).filter(l => planSet.has(l.exercise_id))
      const actual = { workouts: 0, ex: 0, sets: 0, reps: 0, intensity: 0 }
      const seen = new Set<string>()
      for (const l of weekLogs) {
        seen.add(l.exercise_id)
        const sets = l.sets_completed ?? 1
        actual.sets      += sets
        actual.reps      += sets * (l.reps_completed ?? 0)
        actual.intensity += l.intensity ?? 0
      }
      actual.ex = seen.size

      // A workout counts as done when at least half its exercises were logged
      // that week — one exercise out of eight is not "leg day done".
      for (const wid of planWorkoutIds) {
        const total = [...assign.entries()].filter(([, w]) => w === wid).length
        if (total === 0) continue
        const did = [...assign.entries()].filter(([e, w]) => w === wid && seen.has(e)).length
        if (did / total >= 0.5) actual.workouts++
      }

      // Deliberately excludes workouts: ביצוע stays the average of the four
      // metrics originally specified, so historical numbers remain comparable.
      const parts = [
        pct(actual.ex,        planned.ex),
        pct(actual.sets,      planned.sets),
        pct(actual.reps,      planned.reps),
        pct(actual.intensity, planned.intensity),
      ].filter((p): p is number => p !== null)

      out.push({
        sunday: s,
        weekNo: weekNumber(s),
        hasPlan: !!plan,
        planned,
        actual,
        overall: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
      })
    }

    setRows(out.reverse())   // newest week first
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">ביצוע לעומת תכנון</h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
        >?</button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">טוען...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-gray-400 text-sm text-center">אין נתונים להצגה</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="text-sm border-separate" style={{ borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky right-0 z-30 bg-gray-50 border-b border-l border-gray-200 px-2 py-2 text-gray-500 text-xs font-bold"
                  style={{ width: W.week, minWidth: W.week }}
                >
                  שבוע
                </th>
                {['אימונים', 'תרגילים', 'סטים', 'חזרות', 'עצימות'].map(h => (
                  <th
                    key={h}
                    className="bg-gray-50 border-b border-l border-gray-200 px-1 py-2 text-gray-500 text-xs font-bold"
                    style={{ width: W.metric, minWidth: W.metric }}
                  >
                    {h}
                  </th>
                ))}
                <th
                  className="bg-gray-50 border-b border-gray-200 px-1 py-2 text-gray-500 text-xs font-bold"
                  style={{ width: W.total, minWidth: W.total }}
                >
                  ביצוע
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map(r => {
                const cells: [number, number][] = [
                  [r.actual.workouts,  r.planned.workouts],
                  [r.actual.ex,        r.planned.ex],
                  [r.actual.sets,      r.planned.sets],
                  [r.actual.reps,      r.planned.reps],
                  [r.actual.intensity, r.planned.intensity],
                ]
                return (
                  <tr key={r.sunday}>
                    <th
                      className="sticky right-0 z-10 bg-white border-b border-l border-gray-200 px-2 py-2 text-right"
                      style={{ width: W.week, minWidth: W.week }}
                    >
                      <span className="block text-gray-800 text-xs font-bold">{shortDate(r.sunday)}</span>
                      <span className="block text-gray-400 text-[10px]">שבוע {r.weekNo}</span>
                    </th>

                    {cells.map(([a, p], i) => {
                      const cp = pct(a, p)
                      return (
                        <td
                          key={i}
                          className="bg-white border-b border-l border-gray-200 px-1 py-2 text-center"
                          style={{ width: W.metric, minWidth: W.metric }}
                        >
                          {r.hasPlan ? (
                            <>
                              <span className="block text-gray-800 text-xs font-bold tabular-nums">
                                {Math.round(a).toLocaleString()}
                              </span>
                              <span className="block text-gray-400 text-[10px] tabular-nums">
                                מ-{Math.round(p).toLocaleString()}
                              </span>
                              <span className={`block text-[10px] font-bold tabular-nums ${pctClass(cp)}`}>
                                {cp === null ? '—' : `${cp}%`}
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )
                    })}

                    <td
                      className="bg-white border-b border-gray-200 px-1 py-2 text-center"
                      style={{ width: W.total, minWidth: W.total }}
                    >
                      <span className={`text-base font-bold tabular-nums ${pctClass(r.overall)}`}>
                        {r.overall === null ? '—' : `${r.overall}%`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מה הדוח מראה', body: 'לכל שבוע: כמה תרגילים, סטים, חזרות ועצימות תוכננו מול מה שבוצע בפועל.' },
          { title: 'מהו "מתוכנן"', body: 'התוכנית קובעת אילו תרגילים לבצע, ולכל תרגיל יש ברירות מחדל של סטים, חזרות ומשקל. המתוכנן לשבוע = ביצוע כל תרגיל בתוכנית פעם אחת לפי ברירות המחדל שלו.' },
          { title: 'איזו תוכנית נספרת', body: 'התוכנית שהייתה בתוקף ביום ראשון של אותו שבוע קובעת עבור כל השבוע.' },
          { title: 'מה נספר בפועל', body: 'רק תרגילים שנמצאים באותה תוכנית, כדי ששני הצדדים ימדדו את אותו דבר.' },
          { title: 'עמודת אימונים', body: 'כמה אימונים מהתוכנית הושלמו באותו שבוע. אימון נחשב כבוצע כאשר לפחות מחצית מהתרגילים שבו נרשמו. בתוכנית ללא חלוקה לאימונים העמודה ריקה.' },
          { title: 'אחוז הביצוע', body: 'ממוצע של ארבעת האחוזים — תרגילים, סטים, חזרות ועצימות. עמודת האימונים אינה נכללת בחישוב. מעל 100% אפשרי כאשר בוצע יותר מהמתוכנן.' },
          { title: 'צבעים', body: 'ירוק 90% ומעלה · כחול 70% ומעלה · כתום 50% ומעלה · אדום מתחת ל-50%.' },
          { title: 'שבוע ללא תוכנית', body: 'שבוע שלא הייתה בו תוכנית פעילה מוצג עם — בכל העמודות.' },
        ]} />
      )}
    </div>
  )
}
