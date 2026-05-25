import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  userId: string
  onClose: () => void
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

export default function DensityPage({ userId, onClose }: Props) {
  const [dates, setDates]   = useState<string[]>([])
  const [pivot, setPivot]   = useState<Record<string, Record<string, number>>>({})
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

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

      const exCategory: Record<string, string> = {}
      for (const ex of exData) exCategory[ex.id] = ex.category ?? ''

      const pivotMap: Record<string, Record<string, number>> = {}
      const dateSet = new Set<string>()

      for (const log of logs) {
        const date = log.logged_at.slice(0, 10)
        const cat  = exCategory[log.exercise_id] ?? ''
        if (!CATEGORY_ORDER.includes(cat)) continue
        dateSet.add(date)
        if (!pivotMap[cat]) pivotMap[cat] = {}
        pivotMap[cat][date] = (pivotMap[cat][date] ?? 0) + (log.intensity ?? 0)
      }

      const sortedDates = [...dateSet].sort()

      const totalsMap: Record<string, number> = {}
      for (const d of sortedDates) {
        totalsMap[d] = CATEGORY_ORDER.reduce((s, cat) => s + (pivotMap[cat]?.[d] ?? 0), 0)
      }

      setDates(sortedDates)
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

  const COL_WIDTH  = 64
  const NAME_WIDTH = 140

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">עצימות יומית לפי קבוצת שרירים</h1>
        <div className="w-12" />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="border-collapse" style={{ minWidth: NAME_WIDTH + COL_WIDTH * dates.length }}>
            <thead>
              <tr>
                <th
                  className="sticky right-0 top-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2"
                  style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                >
                  קבוצת שריר
                </th>
                {dates.map(d => (
                  <th
                    key={d}
                    className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                    style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                  >
                    {formatDate(d)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {CATEGORY_ORDER.map(cat => (
                <tr key={cat} className="even:bg-gray-50 odd:bg-white">
                  {/* Category name — sticky left */}
                  <td
                    className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 px-2 py-3"
                    style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[cat]}`} />
                      <span className={`text-xs font-bold ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                    </span>
                  </td>

                  {/* Intensity cells */}
                  {dates.map(d => {
                    const val = pivot[cat]?.[d]
                    return (
                      <td
                        key={d}
                        className="border-b border-r border-gray-200 text-center text-xs py-3 px-1"
                        style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      >
                        {val ? (
                          <span className={`font-semibold ${
                            val >= 3000 ? 'text-green-600' :
                            val >= 1500 ? 'text-blue-600' :
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
                {dates.map(d => {
                  const val = totals[d]
                  return (
                    <td
                      key={d}
                      className="border-t-2 border-r border-gray-600 text-center text-xs py-3 px-1"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                    >
                      {val ? (
                        <span className={`font-bold ${
                          val >= 10000 ? 'text-green-400' :
                          val >= 5000  ? 'text-blue-400' :
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
    </div>
  )
}
