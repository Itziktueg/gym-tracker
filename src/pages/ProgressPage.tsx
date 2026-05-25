import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

interface ExerciseRow {
  id: string
  name_he: string
  category: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

export default function ProgressPage({ userId, onClose }: Props) {
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [dates, setDates]         = useState<string[]>([])
  const [pivot, setPivot]         = useState<Record<string, Record<string, number>>>({})
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      // Fetch all logs with intensity for this user
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, intensity')
        .eq('user_id', userId)
        .order('logged_at')

      // Fetch user exercises (name + category)
      const { data: exData } = await supabase
        .from('exercises_user')
        .select('id, name_he, category')
        .eq('user_id', userId)

      if (!logs || !exData) { setLoading(false); return }

      // Build pivot: exerciseId -> date -> total intensity
      const pivotMap: Record<string, Record<string, number>> = {}
      const dateSet = new Set<string>()
      const exWithLogs = new Set<string>()

      for (const log of logs) {
        const date = log.logged_at.slice(0, 10)   // YYYY-MM-DD
        dateSet.add(date)
        exWithLogs.add(log.exercise_id)
        if (!pivotMap[log.exercise_id]) pivotMap[log.exercise_id] = {}
        pivotMap[log.exercise_id][date] = (pivotMap[log.exercise_id][date] ?? 0) + (log.intensity ?? 0)
      }

      // Only include exercises that have at least one log
      const exerciseRows = exData
        .filter(e => exWithLogs.has(e.id))
        .sort((a, b) => {
          const catA = CATEGORY_ORDER.indexOf(a.category ?? '')
          const catB = CATEGORY_ORDER.indexOf(b.category ?? '')
          if (catA !== catB) return catA - catB
          return a.name_he.localeCompare(b.name_he, 'he')
        })

      const sortedDates = [...dateSet].sort()

      setExercises(exerciseRows)
      setDates(sortedDates)
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

  const COL_WIDTH = 64    // px — date columns
  const NAME_WIDTH = 140  // px — exercise name column

  let lastCategory = ''

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">התקדמות עצימות</h1>
        <div className="w-12" />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="border-collapse" style={{ minWidth: NAME_WIDTH + COL_WIDTH * dates.length }}>
            <thead>
              <tr>
                {/* Top-left corner — sticky left AND top */}
                <th
                  className="sticky right-0 top-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2"
                  style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                >
                  תרגיל
                </th>
                {/* Date columns — sticky top only */}
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
              {exercises.map(ex => {
                const showCategoryHeader = ex.category !== lastCategory
                if (showCategoryHeader) lastCategory = ex.category ?? ''
                const catColor = CATEGORY_COLORS[ex.category ?? ''] ?? 'bg-gray-500'

                return (
                  <>
                    {/* Dates sub-header row above each category */}
                    {showCategoryHeader && (
                      <tr key={`dates-${ex.category}`}>
                        <td
                          className="sticky right-0 z-20 bg-gray-700 border-b border-l border-gray-600 text-gray-400 text-xs font-medium px-2 py-1"
                          style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                        >
                          תרגיל
                        </td>
                        {dates.map(d => (
                          <td
                            key={d}
                            className="bg-gray-700 border-b border-r border-gray-600 text-gray-300 text-xs font-medium px-1 py-1 text-center"
                            style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          >
                            {formatDate(d)}
                          </td>
                        ))}
                      </tr>
                    )}

                    {/* Category divider row */}
                    {showCategoryHeader && (
                      <tr key={`cat-${ex.category}`}>
                        <td
                          className={`sticky right-0 z-10 ${catColor} text-white text-xs font-bold px-3 py-1`}
                          style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                        >
                          {ex.category}
                        </td>
                        <td colSpan={dates.length} className={`${catColor} py-1`} />
                      </tr>
                    )}

                    {/* Exercise row */}
                    <tr key={ex.id} className="even:bg-gray-50 odd:bg-white">
                      {/* Exercise name — sticky left */}
                      <td
                        className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 px-2 py-2 text-gray-800 text-xs font-medium"
                        style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                      >
                        {ex.name_he}
                      </td>

                      {/* Intensity cells */}
                      {dates.map(d => {
                        const val = pivot[ex.id]?.[d]
                        return (
                          <td
                            key={d}
                            className="border-b border-r border-gray-200 text-center text-xs py-2 px-1"
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
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex gap-4 justify-center shrink-0">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span className="text-green-600 font-bold">■</span> ≥ 3000
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span className="text-blue-600 font-bold">■</span> ≥ 1500
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <span className="text-gray-700 font-bold">■</span> &lt; 1500
          </span>
        </div>
      </div>
    </div>
  )
}
