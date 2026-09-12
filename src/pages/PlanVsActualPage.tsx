import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadChart, AXIS, GRID, type ChartType } from '../lib/loadChart'
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

/** A line copes with more points than stacked bars, so it shows a longer trend. */
const CHART_WEEKS = 12

export default function PlanVsActualPage({ userId, onClose }: Props) {
  const [rows,     setRows]     = useState<WeekRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [view,     setView]     = useState<'table' | 'chart'>('table')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef  = useRef<ChartType | null>(null)

  useEffect(() => {
    if (view !== 'chart' || rows.length === 0) return
    let alive = true

    loadChart().then(({ default: Chart }) => {
      if (!alive || !canvasRef.current) return
      chartRef.current?.destroy()

      // rows is newest-first; flip so the trend climbs to the right
      const pts = rows.slice(0, CHART_WEEKS).reverse()

      // Dashed 100% line — the target the percentage is measured against
      const target = {
        id: 'target',
        beforeDatasetsDraw(chart: ChartType) {
          const y = chart.scales.y, x = chart.scales.x, g = chart.ctx
          const py = y.getPixelForValue(100)
          if (py < y.top || py > y.bottom) return
          g.save()
          g.strokeStyle = '#9ca3af'
          g.lineWidth = 1
          g.setLineDash([4, 4])
          g.beginPath()
          g.moveTo(x.left, py)
          g.lineTo(x.right, py)
          g.stroke()
          g.restore()
        },
      }

      const labels = {
        id: 'pointLabels',
        afterDatasetsDraw(chart: ChartType) {
          const g = chart.ctx
          g.save()
          g.font = 'bold 10px system-ui, sans-serif'
          g.textAlign = 'center'
          g.fillStyle = '#4b5563'
          chart.getDatasetMeta(0).data.forEach((el, i) => {
            const v = pts[i]?.overall
            if (v === null || v === undefined) return
            const p = el.getProps(['x', 'y'], true)
            g.fillText(`${v}%`, p.x, p.y - 10)
          })
          g.restore()
        },
      }

      const max = Math.max(110, ...pts.map(p => p.overall ?? 0) ) + 8

      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels: pts.map(p => shortDate(p.sunday)),
          datasets: [{
            data: pts.map(p => p.overall),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.10)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            spanGaps: false,           // a week with no plan leaves a real gap
            pointRadius: 4,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 16 } },   // room for the point labels
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: AXIS, font: { size: 10 } } },
            y: {
              min: 0, max,
              grid: { color: GRID }, border: { display: false },
              ticks: { color: AXIS, stepSize: 25, callback: v => `${v}%` },
            },
          },
        },
        plugins: [target, labels],
      })
    })

    return () => { alive = false; chartRef.current?.destroy(); chartRef.current = null }
  }, [view, rows])

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
    const allOf: Record<string, Set<string>> = {}   // required + optional

    if (plans.length > 0) {
      const ids = plans.map(p => p.id)
      const [{ data: linkRows }, { data: woRows }] = await Promise.all([
        supabase.from('workout_plan_exercises')
          .select('plan_id, exercise_id, workout_id, is_optional').in('plan_id', ids),
        supabase.from('plan_workouts').select('id, plan_id').in('plan_id', ids),
      ])
      // Two sets on purpose. "Planned" counts only required exercises, so a week
      // where every required one is done reads 100%. "Actual" counts everything
      // in the plan, so doing an optional on top pushes it above 100%.
      for (const r of linkRows ?? []) {
        (allOf[r.plan_id] ??= new Set()).add(r.exercise_id)
        if (r.is_optional) continue
        ;(links[r.plan_id] ??= []).push(r.exercise_id)
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

      const planExIds = plan ? links[plan.id] ?? [] : []          // required only
      const planSet   = plan ? allOf[plan.id] ?? new Set<string>() : new Set<string>()

      const planWorkoutIds = plan ? workoutsOf[plan.id] ?? [] : []
      const assign = plan ? assignOf[plan.id] ?? new Map<string, string | null>() : new Map<string, string | null>()

      const planned = { workouts: planWorkoutIds.length, ex: planExIds.length, sets: 0, reps: 0, intensity: 0 }
      for (const id of planExIds) {
        const e = exMap.get(id)
        if (!e) continue
        // Time-based exercises are held for seconds, so their default_reps is a
        // duration. They stay in planned.ex above — the plank is still required
        // — but are kept out of the סטים/חזרות/עצימות targets, matching the same
        // exclusion on the actual side so the comparison stays like for like.
        if (e.is_time_based) continue
        const factor = (e.is_bilateral || e.double_weight) ? 2 : 1
        planned.sets      += e.default_sets
        planned.reps      += e.default_sets * e.default_reps
        planned.intensity += e.default_sets * e.default_reps * e.default_weight * factor
      }

      // Anything in the plan counts toward actual, optional included — that is
      // what lets a week with extra work read above 100%.
      const weekLogs = (logsByWeek[s] ?? []).filter(l => planSet.has(l.exercise_id))
      const actual = { workouts: 0, ex: 0, sets: 0, reps: 0, intensity: 0 }
      const seen = new Set<string>()
      for (const l of weekLogs) {
        seen.add(l.exercise_id)   // before the skip: it drives ex + workouts
        if (exMap.get(l.exercise_id)?.is_time_based) continue
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
    <div className="h-dvh bg-gray-100 flex flex-col" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-base">ביצוע לעומת תכנון</h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center rounded-lg overflow-hidden border border-gray-300 text-[11px] font-bold">
            <button
              onClick={() => setView('table')}
              className={`px-2 py-1 ${view === 'table' ? 'bg-blue-500 text-white' : 'bg-white text-gray-400'}`}
            >טבלה</button>
            <button
              onClick={() => setView('chart')}
              className={`px-2 py-1 ${view === 'chart' ? 'bg-blue-500 text-white' : 'bg-white text-gray-400'}`}
            >גרף</button>
          </span>
          <button
            onClick={() => setHelpOpen(true)}
            className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
          >?</button>
        </div>
      </div>

      {view === 'chart' && rows.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col px-3 pt-3 pb-2">
          <p className="text-gray-500 text-xs mb-1 shrink-0">
            אחוז ביצוע שבועי · הקו המקווקו הוא 100%
          </p>
          <div className="flex-1 min-h-0 relative w-full">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="גרף קו של אחוז הביצוע השבועי מול קו יעד של מאה אחוז"
            />
          </div>
          <p className="text-gray-400 text-xs text-center pt-2 shrink-0">
            {CHART_WEEKS} השבועות האחרונים · הישן משמאל, החדש מימין
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">טוען...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-gray-400 text-sm text-center">אין נתונים להצגה</p>
        </div>
      ) : view === 'chart' ? null : (
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
                {/* Headline first — the number you scan for sits beside the week */}
                <th
                  className="bg-gray-50 border-b border-l border-gray-200 px-1 py-2 text-gray-500 text-xs font-bold"
                  style={{ width: W.total, minWidth: W.total }}
                >
                  ביצוע
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

                    <td
                      className="bg-white border-b border-l border-gray-200 px-1 py-2 text-center"
                      style={{ width: W.total, minWidth: W.total }}
                    >
                      <span className={`text-base font-bold tabular-nums ${pctClass(r.overall)}`}>
                        {r.overall === null ? '—' : `${r.overall}%`}
                      </span>
                    </td>

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
          { title: 'תרגילי רשות', body: 'תרגיל המסומן Opt אינו נספר במתוכנן — שבוע שבו בוצעו כל תרגילי החובה הוא 100%. אם בנוסף בוצעו תרגילי רשות, האחוז יעלה מעל 100%.' },
          { title: 'מה נספר בפועל', body: 'כל התרגילים שבתוכנית, כולל תרגילי רשות. תרגיל שאינו בתוכנית אינו נספר.' },
          { title: 'עמודת אימונים', body: 'כמה אימונים מהתוכנית הושלמו באותו שבוע. אימון נחשב כבוצע כאשר לפחות מחצית מהתרגילים שבו נרשמו. בתוכנית ללא חלוקה לאימונים העמודה ריקה.' },
          { title: 'אחוז הביצוע', body: 'ממוצע של ארבעת האחוזים — תרגילים, סטים, חזרות ועצימות. עמודת האימונים אינה נכללת בחישוב. מעל 100% אפשרי כאשר בוצע יותר מהמתוכנן.' },
          { title: 'תצוגת גרף', body: 'מתג "טבלה / גרף" בכותרת מציג את אחוז הביצוע הכולל כקו לאורך 12 השבועות האחרונים, עם קו מקווקו ב-100%. שבוע ללא תוכנית מופיע כפער בקו.' },
          { title: 'צבעים', body: 'ירוק 90% ומעלה · כחול 70% ומעלה · כתום 50% ומעלה · אדום מתחת ל-50%.' },
          { title: 'שבוע ללא תוכנית', body: 'שבוע שלא הייתה בו תוכנית פעילה מוצג עם — בכל העמודות.' },
        ]} />
      )}
    </div>
  )
}
