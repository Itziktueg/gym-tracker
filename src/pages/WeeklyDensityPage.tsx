import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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

export default function WeeklyDensityPage({ userId, onClose }: Props) {
  const [weeks,   setWeeks]   = useState<string[]>([])
  const [pivot,   setPivot]   = useState<Record<string, Record<string, number>>>({})
  const [totals,  setTotals]  = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, intensity')
        .eq('user_id', userId)
        .order('logged_at')

      const { data: exData } = await supabase
        .from('exercises_user')
        .select('id, category')
        .eq('user_id', userId)

      if (!logs || !exData) { setLoading(false); return }

      const exCat: Record<string, string> = {}
      for (const ex of exData) exCat[ex.id] = ex.category ?? ''

      const pivotMap: Record<string, Record<string, number>> = {}
      const weekSet = new Set<string>()

      for (const log of logs) {
        const week = getSunday(log.logged_at.slice(0, 10))
        const cat  = exCat[log.exercise_id] ?? ''
        if (!CATEGORY_ORDER.includes(cat)) continue
        weekSet.add(week)
        if (!pivotMap[cat]) pivotMap[cat] = {}
        pivotMap[cat][week] = (pivotMap[cat][week] ?? 0) + (log.intensity ?? 0)
      }

      const sortedWeeks = [...weekSet].sort()
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">יומי ←</button>
        <h1 className="text-gray-800 font-bold text-lg">עצימות שבועית לפי קבוצת שריר</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
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
          { title: 'גלילה', body: 'גלול ימינה לשבועות ישנים יותר.' },
        ]} />
      )}
    </div>
  )
}
