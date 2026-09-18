import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/fetchAllRows'
import { sundayOf } from '../lib/muscleVolume'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_COLORS: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

/** Same scale as the logging screen: red at failure, green with plenty left,
 *  so a column of RIRs reads without consulting the numbers. */
function rirColor(rir: number) {
  if (rir < 0.5) return 'text-red-600'
  if (rir < 1.5) return 'text-orange-600'
  if (rir < 2.5) return 'text-amber-600'
  if (rir < 3.5) return 'text-lime-600'
  return 'text-green-600'
}

interface ExerciseRow {
  id: string
  name_he: string
  category: string
  timeBased: boolean
}

interface Cell {
  reps: number
  weight: number
  rir: number | null
  sets: number
  sessions: number      // distinct days — >1 means the week is an average of several
}

function fmtWeek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

function weekNumber(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const jan1 = new Date(y, 0, 1)
  return Math.floor((new Date(y, m - 1, d).getTime() - jan1.getTime()) / (7 * 86400000)) + 1
}

/** One decimal, but only when it earns it — "12" reads better than "12.0". */
function fmtNum(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

export default function ExercisePerformancePage({ userId, onClose }: Props) {
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [weeks, setWeeks]         = useState<string[]>([])
  const [pivot, setPivot]         = useState<Record<string, Record<string, Cell>>>({})
  const [loading, setLoading]     = useState(true)
  const [helpOpen, setHelpOpen]   = useState(false)

  useEffect(() => {
    async function load() {
      const logs = await fetchAllRows<{
        exercise_id: string; logged_at: string; sets_completed: number | null
        reps_completed: number | null; weight: number | null; rir: number | null
      }>((f, t) => supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, sets_completed, reps_completed, weight, rir')
        .eq('user_id', userId)
        .order('logged_at')
        .range(f, t))

      const { data: exData } = await supabase
        .from('exercises_user')
        .select('id, name_he, category, is_time_based')
        .eq('user_id', userId)

      if (!exData) { setLoading(false); return }

      // Weighted running totals, so a row holding 3 sets counts three times as
      // much as a single-set row, and two sessions in one week average together.
      interface Acc {
        repsSum: number; weightSum: number; sets: number
        rirSum: number; rirSets: number; days: Set<string>
      }
      const acc: Record<string, Record<string, Acc>> = {}
      const weekSet = new Set<string>()
      const exWithLogs = new Set<string>()

      for (const log of logs) {
        const week = sundayOf(log.logged_at.slice(0, 10))
        const sets = log.sets_completed ?? 1
        if (sets <= 0) continue
        weekSet.add(week)
        exWithLogs.add(log.exercise_id)

        const byWeek = (acc[log.exercise_id] ??= {})
        const a = (byWeek[week] ??= {
          repsSum: 0, weightSum: 0, sets: 0, rirSum: 0, rirSets: 0, days: new Set(),
        })
        a.repsSum   += (log.reps_completed ?? 0) * sets
        a.weightSum += (log.weight ?? 0) * sets
        a.sets      += sets
        a.days.add(log.logged_at.slice(0, 10))
        // RIR is optional per set, so its average is over the marked sets only —
        // averaging in unmarked sets as zero would read as training to failure.
        if (log.rir != null) {
          a.rirSum  += log.rir * sets
          a.rirSets += sets
        }
      }

      const pivotMap: Record<string, Record<string, Cell>> = {}
      for (const [exId, byWeek] of Object.entries(acc)) {
        pivotMap[exId] = {}
        for (const [week, a] of Object.entries(byWeek)) {
          pivotMap[exId][week] = {
            reps:     Math.round((a.repsSum / a.sets) * 10) / 10,
            weight:   Math.round((a.weightSum / a.sets) * 10) / 10,
            rir:      a.rirSets > 0 ? Math.round((a.rirSum / a.rirSets) * 10) / 10 : null,
            sets:     a.sets,
            sessions: a.days.size,
          }
        }
      }

      const exerciseRows: ExerciseRow[] = exData
        .filter(e => exWithLogs.has(e.id))
        .map(e => ({
          id: e.id,
          name_he: e.name_he,
          category: e.category ?? '',
          timeBased: !!e.is_time_based,
        }))
        .sort((a, b) => {
          const catA = CATEGORY_ORDER.indexOf(a.category)
          const catB = CATEGORY_ORDER.indexOf(b.category)
          if (catA !== catB) return catA - catB
          return a.name_he.localeCompare(b.name_he, 'he')
        })

      // Newest first — in RTL the first column renders on the right
      setWeeks([...weekSet].sort().reverse())
      setExercises(exerciseRows)
      setPivot(pivotMap)
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

  const COL_WIDTH  = 84   // px — wider than the intensity table: three values per cell
  const NAME_WIDTH = 140  // px

  let lastCategory = ''

  return (
    <div className="h-dvh bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">ביצוע תרגילים</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="border-collapse" style={{ minWidth: NAME_WIDTH + COL_WIDTH * weeks.length }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  className="sticky right-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2"
                  style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                >
                  תרגיל
                </th>
                {weeks.map(w => (
                  <th
                    key={w}
                    className="bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                    style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                  >
                    <div className="text-gray-400 text-[10px] leading-tight">שבוע {weekNumber(w)}</div>
                    <div>{fmtWeek(w)}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {exercises.map(ex => {
                const showCategoryHeader = ex.category !== lastCategory
                if (showCategoryHeader) lastCategory = ex.category
                const catColor = CATEGORY_COLORS[ex.category] ?? 'bg-gray-500'

                return (
                  <>
                    {showCategoryHeader && (
                      <tr key={`cat-${ex.category}`}>
                        <td
                          className={`sticky right-0 z-10 ${catColor} text-white text-xs font-bold px-3 py-1`}
                          style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                        >
                          {ex.category}
                        </td>
                        <td colSpan={weeks.length} className={`${catColor} py-1`} />
                      </tr>
                    )}

                    <tr key={ex.id} className="even:bg-gray-50 odd:bg-white">
                      <td
                        className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 px-2 py-2 text-gray-800 text-xs font-medium"
                        style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                      >
                        {ex.name_he}
                        {ex.timeBased && (
                          <span className="text-gray-400 font-normal"> (שנ')</span>
                        )}
                      </td>

                      {weeks.map(w => {
                        const c = pivot[ex.id]?.[w]
                        return (
                          <td
                            key={w}
                            className="border-b border-r border-gray-200 text-center py-1.5 px-1 align-middle"
                            style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          >
                            {c ? (
                              <>
                                <div className="text-gray-800 text-xs font-semibold tabular-nums leading-tight">
                                  {fmtNum(c.reps)}
                                  <span className="text-gray-400 font-normal"> × </span>
                                  {fmtNum(c.weight)}
                                </div>
                                <div className="text-[10px] leading-tight tabular-nums">
                                  {c.rir != null ? (
                                    <span className={rirColor(c.rir)}>RIR {fmtNum(c.rir)}</span>
                                  ) : (
                                    <span className="text-gray-300">RIR —</span>
                                  )}
                                  {c.sessions > 1 && (
                                    <span className="text-gray-400" title="ממוצע של יותר מאימון אחד השבוע">
                                      {' '}·{c.sessions}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white border-t border-gray-200 px-4 py-2 flex gap-4 justify-center shrink-0">
          <span className="text-xs text-gray-400">חזרות × משקל</span>
          <span className="text-xs text-gray-400">RIR ממוצע</span>
          <span className="text-xs text-gray-400">·2 = שני אימונים</span>
        </div>
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'קריאת הטבלה', body: 'שורות = תרגילים, עמודות = שבועות (מהאחרון לישן). בכל תא: ממוצע חזרות × ממוצע משקל, ומתחת ממוצע ה-RIR.' },
          { title: 'איך מחושב הממוצע', body: 'ממוצע על פני כל הסטים של אותו תרגיל באותו שבוע. אם התרגיל בוצע פעמיים באותו שבוע, שני האימונים ממוצעים יחד ומופיע הסימון ·2.' },
          { title: 'RIR', body: 'ממוצע רק על הסטים שסומנו. סטים ללא סימון אינם נספרים — הם אינם נחשבים כאילו בוצעו עד כשל. שבוע ללא סימון כלל מוצג כ-RIR —.' },
          { title: 'צבע ה-RIR', body: 'אדום = קרוב לכשל · כתום וענבר = באמצע · ירוק = נשאר הרבה כוח. היעד הכללי הוא בערך 2.' },
          { title: 'תרגילים מבוססי זמן', body: 'תרגיל המסומן (שנ\') נמדד בשניות החזקה ולא בחזרות. הוא מוצג כאן כי כל שורה היא תרגיל אחד ואין ערבוב יחידות, בניגוד לדוחות העצימות שבהם הוא אינו נכלל.' },
          { title: 'גלילה', body: 'השבוע האחרון מוצג בצד ימין. גלול שמאלה לשבועות ישנים יותר. עמודת שם התרגיל קבועה תמיד.' },
        ]} />
      )}
    </div>
  )
}
