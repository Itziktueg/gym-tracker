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

interface HistoryRow {
  date: string
  category: string
  exerciseName: string
  sets: number
  reps: number
  weight: number
  intensity: number
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

const DATE_W    = 76
const CAT_W     = 100
const NAME_W    = 136
const SMALL_W   = 44
const INTENS_W  = 68

export default function WorkoutHistoryPage({ userId, onClose }: Props) {
  const [rows, setRows]       = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, reps_completed, weight, intensity')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })

      const { data: exercises } = await supabase
        .from('exercises_user')
        .select('id, name_he, category')
        .eq('user_id', userId)

      if (!logs || !exercises) { setLoading(false); return }

      // Build exercise lookup
      const exMap: Record<string, { name_he: string; category: string }> = {}
      for (const ex of exercises) exMap[ex.id] = { name_he: ex.name_he, category: ex.category ?? '' }

      // Group by date + exercise_id → aggregate
      type Agg = { sets: number; reps: number; weight: number; intensity: number }
      const grouped: Record<string, Record<string, Agg>> = {}  // date → exerciseId → agg

      for (const log of logs) {
        const date = log.logged_at.slice(0, 10)
        if (!grouped[date]) grouped[date] = {}
        if (!grouped[date][log.exercise_id]) {
          grouped[date][log.exercise_id] = { sets: 0, reps: 0, weight: 0, intensity: 0 }
        }
        const agg = grouped[date][log.exercise_id]
        agg.sets      += 1
        agg.reps      += log.reps_completed ?? 0
        agg.weight     = Math.max(agg.weight, log.weight ?? 0)
        agg.intensity += log.intensity ?? 0
      }

      // Take the last 30 workout dates
      const allDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
      const last30   = allDates.slice(0, 30)

      // Build flat row list
      const result: HistoryRow[] = []
      for (const date of last30) {
        const exEntries = Object.entries(grouped[date])
          .map(([exId, agg]) => ({
            exId,
            category: exMap[exId]?.category ?? '',
            exerciseName: exMap[exId]?.name_he ?? exId,
            ...agg,
          }))
          .sort((a, b) => {
            const catA = CATEGORY_ORDER.indexOf(a.category)
            const catB = CATEGORY_ORDER.indexOf(b.category)
            if (catA !== catB) return catA - catB
            return a.exerciseName.localeCompare(b.exerciseName, 'he')
          })

        for (const e of exEntries) {
          result.push({
            date,
            category:     e.category,
            exerciseName: e.exerciseName,
            sets:         e.sets,
            reps:         e.reps,
            weight:       e.weight,
            intensity:    e.intensity,
          })
        }
      }

      setRows(result)
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

  let lastDate = ''

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">היסטוריית אימונים</h1>
        <div className="w-12" />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse"
          style={{ minWidth: DATE_W + CAT_W + NAME_W + SMALL_W * 3 + INTENS_W }}>
          {/* Sticky column header */}
          <thead>
            <tr>
              <th className="sticky right-0 top-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2 text-center"
                style={{ width: DATE_W, minWidth: DATE_W }}>
                תאריך
              </th>
              <th className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-400 text-xs font-medium px-2 py-2 text-right"
                style={{ width: CAT_W, minWidth: CAT_W }}>
                קבוצה
              </th>
              <th className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-400 text-xs font-medium px-2 py-2 text-right"
                style={{ width: NAME_W, minWidth: NAME_W }}>
                תרגיל
              </th>
              <th className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                style={{ width: SMALL_W, minWidth: SMALL_W }}>
                סטים
              </th>
              <th className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                style={{ width: SMALL_W, minWidth: SMALL_W }}>
                חזר'
              </th>
              <th className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                style={{ width: SMALL_W, minWidth: SMALL_W }}>
                ק"ג
              </th>
              <th className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                style={{ width: INTENS_W, minWidth: INTENS_W }}>
                עצימות
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const isNewDate = row.date !== lastDate
              if (isNewDate) lastDate = row.date
              const dot  = CATEGORY_DOT[row.category]  ?? 'bg-gray-400'
              const text = CATEGORY_TEXT[row.category] ?? 'text-gray-600'

              return (
                <>
                  {/* Date separator row */}
                  {isNewDate && (
                    <tr key={`date-${row.date}`}>
                      <td
                        colSpan={7}
                        className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5"
                      >
                        📅 {formatDate(row.date)}
                      </td>
                    </tr>
                  )}

                  {/* Exercise row */}
                  <tr key={`${row.date}-${i}`} className="even:bg-gray-50 odd:bg-white">
                    {/* Date — sticky right */}
                    <td
                      className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 text-center text-xs font-medium text-gray-500 px-1 py-2"
                      style={{ width: DATE_W, minWidth: DATE_W }}
                    >
                      {formatDate(row.date)}
                    </td>

                    {/* Category */}
                    <td
                      className="border-b border-r border-gray-200 px-2 py-2"
                      style={{ width: CAT_W, minWidth: CAT_W }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                        <span className={`text-xs font-semibold ${text} leading-tight`}>
                          {row.category}
                        </span>
                      </span>
                    </td>

                    {/* Exercise name */}
                    <td
                      className="border-b border-r border-gray-200 px-2 py-2 text-gray-800 text-xs font-medium"
                      style={{ width: NAME_W, minWidth: NAME_W }}
                    >
                      {row.exerciseName}
                    </td>

                    {/* Sets */}
                    <td
                      className="border-b border-r border-gray-200 text-center text-xs text-gray-700 py-2 px-1"
                      style={{ width: SMALL_W, minWidth: SMALL_W }}
                    >
                      {row.sets}
                    </td>

                    {/* Reps */}
                    <td
                      className="border-b border-r border-gray-200 text-center text-xs text-gray-700 py-2 px-1"
                      style={{ width: SMALL_W, minWidth: SMALL_W }}
                    >
                      {row.reps}
                    </td>

                    {/* Weight */}
                    <td
                      className="border-b border-r border-gray-200 text-center text-xs text-gray-700 py-2 px-1"
                      style={{ width: SMALL_W, minWidth: SMALL_W }}
                    >
                      {row.weight > 0 ? row.weight : '—'}
                    </td>

                    {/* Intensity */}
                    <td
                      className="border-b border-r border-gray-200 text-center text-xs py-2 px-1"
                      style={{ width: INTENS_W, minWidth: INTENS_W }}
                    >
                      <span className={`font-semibold ${
                        row.intensity >= 3000 ? 'text-green-600' :
                        row.intensity >= 1500 ? 'text-blue-600' :
                        'text-gray-700'
                      }`}>
                        {row.intensity > 0 ? row.intensity.toLocaleString() : '—'}
                      </span>
                    </td>
                  </tr>
                </>
              )
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="text-center text-gray-400 mt-12 text-sm">אין נתונים להצגה</p>
        )}
      </div>
    </div>
  )
}
