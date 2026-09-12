import { useEffect, useRef, useState } from 'react'
import { loadChart, valueLabels, AXIS, GRID, type ChartType } from '../lib/loadChart'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/fetchAllRows'
import { fetchTimeBasedIds } from '../lib/timeBasedIds'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void   // back to daily
}

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_DOT: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

const CATEGORY_TEXT: Record<string, string> = {
  'פלג גוף תחתון': 'text-blue-600',
  'גב וכתפיים':    'text-violet-600',
  'חזה וזרועות':   'text-orange-500',
  'בטן וליבה':     'text-teal-600',
}

/** Returns the date string (YYYY-MM-DD) of the Sunday that starts the week. */
function getSunday(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - d.getDay())   // getDay() === 0 on Sunday
  return d.toISOString().slice(0, 10)
}

/** Week-of-year (1-based, Sunday-anchored). */
function weekNumber(sundayStr: string): number {
  const d   = new Date(sundayStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.floor((d.getTime() - jan1.getTime()) / (7 * 86400000)) + 1
}

function formatSunday(sundayStr: string) {
  return new Date(sundayStr).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

const COL_WIDTH  = 72
const NAME_WIDTH = 140

/** Chart shows a fixed recent window so it always fits one screen. */
const WEEKS_SHOWN = 6

export default function WeeklyDensityPage({ userId, onClose }: Props) {
  const [weeks,   setWeeks]   = useState<string[]>([])
  const [pivot,   setPivot]   = useState<Record<string, Record<string, number>>>({})
  const [totals,  setTotals]  = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [view, setView] = useState<'table' | 'chart'>('table')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef  = useRef<ChartType | null>(null)

  // Chart reads oldest-left to newest-right: a rising trend should climb to the
  // right, which is the opposite of the table's newest-first column order.
  useEffect(() => {
    if (view !== 'chart' || weeks.length === 0) return
    let alive = true

    loadChart().then(({ default: Chart }) => {
      if (!alive || !canvasRef.current) return
      chartRef.current?.destroy()

      // weeks is newest-first, so take the head then flip for the chart axis
      const ordered = weeks.slice(0, WEEKS_SHOWN).reverse()

      // Must match CATEGORY_DOT — these are the Tailwind 500 values the legend
      // and the whole app already use for these categories.
      const colors: Record<string, string> = {
        'פלג גוף תחתון': '#3b82f6',   // blue-500
        'גב וכתפיים':    '#8b5cf6',   // violet-500
        'חזה וזרועות':   '#f97316',   // orange-500
        'בטן וליבה':     '#14b8a6',   // teal-500
      }

      chartRef.current = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: ordered.map(w => formatSunday(w)),
          datasets: CATEGORY_ORDER.map(cat => ({
            label: cat,
            data: ordered.map(w => Math.round(pivot[cat]?.[w] ?? 0)),
            backgroundColor: colors[cat],
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: AXIS } },
            y: {
              stacked: true, grid: { color: GRID }, border: { display: false },
              ticks: { color: AXIS, callback: v => `${Math.round(Number(v) / 1000)}k` },
            },
          },
        },
        plugins: [valueLabels],
      })
    })

    return () => { alive = false; chartRef.current?.destroy(); chartRef.current = null }
  }, [view, weeks, pivot])

  useEffect(() => {
    async function load() {
      const logs = await fetchAllRows<{
        exercise_id: string; logged_at: string; intensity: number
      }>((f, t) => supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, intensity')
        .eq('user_id', userId)
        .order('logged_at')
        .range(f, t))

      const [{ data: exData }, timeBased] = await Promise.all([
        supabase.from('exercises_user').select('id, category').eq('user_id', userId),
        fetchTimeBasedIds(userId),
      ])

      if (!exData) { setLoading(false); return }

      const exCat: Record<string, string> = {}
      for (const ex of exData) exCat[ex.id] = ex.category ?? ''

      const pivotMap: Record<string, Record<string, number>> = {}
      const weekSet = new Set<string>()

      for (const log of logs) {
        if (timeBased.has(log.exercise_id)) continue   // seconds, not reps
        const week = getSunday(log.logged_at.slice(0, 10))
        const cat  = exCat[log.exercise_id] ?? ''
        if (!CATEGORY_ORDER.includes(cat)) continue
        weekSet.add(week)
        if (!pivotMap[cat]) pivotMap[cat] = {}
        pivotMap[cat][week] = (pivotMap[cat][week] ?? 0) + (log.intensity ?? 0)
      }

      // Newest first — most recent week visible without scrolling (RTL)
      const sortedWeeks = [...weekSet].sort().reverse()
      const totalsMap: Record<string, number> = {}
      for (const w of sortedWeeks)
        totalsMap[w] = CATEGORY_ORDER.reduce((s, cat) => s + (pivotMap[cat]?.[w] ?? 0), 0)

      setWeeks(sortedWeeks)
      setPivot(pivotMap)
      setTotals(totalsMap)
      setLoading(false)
    }
    load()
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">טוען...</p>
      </div>
    )
  }

  // h-dvh, not min-h-screen: the chart must fit the viewport exactly, and dvh
  // accounts for the mobile browser chrome that vh ignores.
  return (
    <div className="h-dvh bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-base">עצימות שבועית</h1>
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
          <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
        </div>
      </div>

      {/* min-h-0 lets the canvas shrink to the space left over, so the whole
          view fits one screen on both phone and laptop without scrolling. */}
      {view === 'chart' && (
        <div className="flex-1 min-h-0 flex flex-col px-3 pt-3 pb-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 shrink-0">
            {CATEGORY_ORDER.map(cat => (
              <span key={cat} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-sm ${CATEGORY_DOT[cat]}`} />
                {cat}
              </span>
            ))}
          </div>
          <div className="flex-1 min-h-0 relative w-full">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="גרף עמודות מוערמות של עצימות שבועית לפי קבוצת שריר"
            />
          </div>
          <p className="text-gray-400 text-xs text-center pt-2 shrink-0">
            {WEEKS_SHOWN} השבועות האחרונים · הישן משמאל, החדש מימין
          </p>
        </div>
      )}

      {/* Table */}
      <div className={`flex-1 overflow-hidden flex-col ${view === 'table' ? 'flex' : 'hidden'}`}>
        <div className="overflow-auto flex-1">
          <table className="border-collapse" style={{ minWidth: NAME_WIDTH + COL_WIDTH * weeks.length }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky right-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2"
                  style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                >
                  קבוצת שריר
                </th>
                {weeks.map(w => (
                  <th
                    key={w}
                    className="bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                    style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                  >
                    <div>{formatSunday(w)}</div>
                    <div className="text-gray-400 text-[10px] leading-tight">שבוע {weekNumber(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {CATEGORY_ORDER.map(cat => (
                <tr key={cat} className="even:bg-gray-50 odd:bg-white">
                  <td
                    className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 px-2 py-3"
                    style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[cat]}`} />
                      <span className={`text-xs font-bold ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                    </span>
                  </td>
                  {weeks.map(w => {
                    const val = pivot[cat]?.[w]
                    return (
                      <td
                        key={w}
                        className="border-b border-r border-gray-200 text-center text-xs py-3 px-1"
                        style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      >
                        {val ? (
                          <span className={`font-semibold ${
                            val >= 9000 ? 'text-green-600' :
                            val >= 4500 ? 'text-blue-600' :
                            'text-gray-700'
                          }`}>
                            {val.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}

              {/* Total row */}
              <tr className="bg-gray-800">
                <td
                  className="sticky right-0 z-10 bg-gray-800 border-t-2 border-l border-gray-600 px-2 py-3 text-white text-xs font-bold"
                  style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                >
                  סה״כ
                </td>
                {weeks.map(w => {
                  const val = totals[w]
                  return (
                    <td
                      key={w}
                      className="border-t-2 border-r border-gray-600 text-center text-xs py-3 px-1"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                    >
                      {val ? (
                        <span className={`font-bold ${
                          val >= 30000 ? 'text-green-400' :
                          val >= 15000 ? 'text-blue-400' :
                          'text-gray-300'
                        }`}>
                          {val.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'קריאת הטבלה', body: 'עמודות = שבועות. התאריך = יום ראשון של השבוע. "שבוע N" = מספר השבוע בשנה.' },
          { title: 'שימוש', body: 'זיהוי שבועות חזקים וחלשים לפי קבוצת שריר. עוזר לאזן עומס אימון לאורך זמן.' },
          { title: 'צבעים', body: 'ירוק ≥ 9,000 · כחול ≥ 4,500 · אפור < 4,500 (לפי קטגוריה). סה"כ: ירוק ≥ 30,000 · כחול ≥ 15,000.' },
          { title: 'גלילה', body: 'השבוע האחרון מוצג בצד ימין. גלול שמאלה לשבועות ישנים יותר.' },
        ]} />
      )}
    </div>
  )
}
