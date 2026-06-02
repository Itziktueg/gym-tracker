import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  'פלג גוף תחתון': { dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50' },
  'גב וכתפיים':    { dot: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50' },
  'חזה וזרועות':   { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  'בטן וליבה':     { dot: 'bg-teal-500',   text: 'text-teal-700',   bg: 'bg-teal-50' },
}

interface ExerciseEntry {
  date: string
  sets: number
  rows: number   // actual log-row count (used to compute avg reps/set)
  reps: number
  weight: number
  intensity: number
}

interface ExerciseHistory {
  id: string
  name: string
  category: string
  bilateral: boolean
  entries: ExerciseEntry[]   // sorted date desc, max 30
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

// Widths inside each exercise mini-table
const W = { date: 56, sets: 30, reps: 34, wt: 36, int: 54 }
const BLOCK_W = W.date + W.sets + W.reps + W.wt + W.int  // 210 px

export default function WorkoutHistoryPage({ userId, onClose }: Props) {
  const [chunks, setChunks] = useState<ExerciseHistory[][]>([])
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, sets_completed, reps_completed, weight, intensity')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })

      const { data: exercises } = await supabase
        .from('exercises_user')
        .select('id, name_he, category, is_bilateral')
        .eq('user_id', userId)

      if (!logs || !exercises) { setLoading(false); return }

      const exMap: Record<string, { name: string; category: string; bilateral: boolean }> = {}
      for (const ex of exercises) exMap[ex.id] = { name: ex.name_he, category: ex.category ?? '', bilateral: ex.is_bilateral ?? false }

      // Aggregate by exercise × date
      const histMap: Record<string, Record<string, ExerciseEntry>> = {}
      for (const log of logs) {
        const date = log.logged_at.slice(0, 10)
        if (!histMap[log.exercise_id]) histMap[log.exercise_id] = {}
        const byDate = histMap[log.exercise_id]
        if (!byDate[date]) byDate[date] = { date, sets: 0, rows: 0, reps: 0, weight: 0, intensity: 0 }
        const e = byDate[date]
        e.rows      += 1
        e.sets      += log.sets_completed ?? 1
        e.reps      += log.reps_completed ?? 0
        e.weight     = Math.max(e.weight, log.weight ?? 0)
        e.intensity += log.intensity ?? 0
      }

      // Build sorted exercise list (only those with at least one log)
      const sorted: ExerciseHistory[] = Object.entries(histMap)
        .map(([id, byDate]) => ({
          id,
          name:     exMap[id]?.name     ?? id,
          category: exMap[id]?.category ?? '',
          bilateral: exMap[id]?.bilateral ?? false,
          entries:  Object.values(byDate)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 30),
        }))
        .sort((a, b) => {
          const catA = CATEGORY_ORDER.indexOf(a.category)
          const catB = CATEGORY_ORDER.indexOf(b.category)
          if (catA !== catB) return catA - catB
          return a.name.localeCompare(b.name, 'he')
        })

      // Chunk into groups of 3
      const result: ExerciseHistory[][] = []
      for (let i = 0; i < sorted.length; i += 3) result.push(sorted.slice(i, i + 3))
      setChunks(result)
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

  let lastCategory = ''

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">היסטוריית אימונים</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      <div className="flex-1 overflow-auto p-2 flex flex-col gap-3">
        {chunks.map((group, gi) => {
          const cat = group[0].category
          const showCat = cat !== lastCategory
          if (showCat) lastCategory = cat
          const style = CATEGORY_STYLE[cat]

          return (
            <div key={gi}>
              {/* Category header */}
              {showCat && (
                <div className={`flex items-center gap-2 px-3 py-1.5 mb-2 rounded-lg ${style?.bg ?? 'bg-gray-100'}`}>
                  <span className={`w-3 h-3 rounded-full shrink-0 ${style?.dot ?? 'bg-gray-400'}`} />
                  <span className={`text-sm font-bold ${style?.text ?? 'text-gray-700'}`}>{cat}</span>
                </div>
              )}

              {/* 3 exercise tables side by side */}
              <div className="overflow-x-auto">
                <div className="flex gap-1" style={{ width: group.length * BLOCK_W + (group.length - 1) * 4 }}>
                  {group.map(ex => (
                    <div key={ex.id} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm flex-shrink-0"
                      style={{ width: BLOCK_W }}>

                      {/* Exercise name */}
                      <div className="bg-gray-800 text-white text-xs font-bold px-2 py-1.5 text-center truncate">
                        {ex.name}
                      </div>

                      {/* Sub-header */}
                      <div className="flex bg-gray-700">
                        <span className="text-gray-300 text-xs font-medium text-center py-1" style={{ width: W.date }}>תאריך</span>
                        <span className="text-gray-300 text-xs font-medium text-center py-1" style={{ width: W.sets }}>סטים</span>
                        <span className="text-gray-300 text-xs font-medium text-center py-1" style={{ width: W.reps }}>חזר'</span>
                        <span className="text-gray-300 text-xs font-medium text-center py-1" style={{ width: W.wt }}>ק"ג</span>
                        <span className="text-gray-300 text-xs font-medium text-center py-1" style={{ width: W.int }}>עצימות</span>
                      </div>

                      {/* Data rows */}
                      {ex.entries.map((entry, ri) => {
                        // Derive reps/set from intensity (works for both old and new data formats).
                        // Old format: intensity stored as sets×reps×weight×bilateral per row.
                        // New format: intensity stored as reps×weight×bilateral per row; sum = same total.
                        // Fallback to reps_sum/rows when weight=0 (bodyweight exercises).
                        const bilat = ex.bilateral ? 2 : 1
                        const repsDisplay = entry.sets > 0 && entry.weight > 0
                          ? Math.round(entry.intensity / (entry.sets * entry.weight * bilat))
                          : entry.rows > 0 ? Math.round(entry.reps / entry.rows) : entry.reps

                        return (
                        <div key={entry.date}
                          className={`flex items-center ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-t border-gray-100`}>
                          <span className="text-xs text-gray-500 font-medium text-center py-1.5 tabular-nums"
                            style={{ width: W.date }}>{formatDate(entry.date)}</span>
                          <span className="text-xs text-gray-700 text-center py-1.5 tabular-nums"
                            style={{ width: W.sets }}>{entry.sets}</span>
                          <span className="text-xs text-gray-700 text-center py-1.5 tabular-nums"
                            style={{ width: W.reps }}>{repsDisplay}</span>
                          <span className="text-xs text-gray-700 text-center py-1.5 tabular-nums"
                            style={{ width: W.wt }}>{entry.weight > 0 ? entry.weight : '—'}</span>
                          <span className={`text-xs font-semibold text-center py-1.5 tabular-nums ${
                            entry.intensity >= 3000 ? 'text-green-600' :
                            entry.intensity >= 1500 ? 'text-blue-600' :
                            'text-gray-700'}`}
                            style={{ width: W.int }}>
                            {entry.intensity > 0 ? entry.intensity.toLocaleString() : '—'}
                          </span>
                        </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {chunks.length === 0 && (
          <p className="text-center text-gray-400 mt-12 text-sm">אין נתונים להצגה</p>
        )}
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מבנה הדוח', body: '3 תרגילים זה לצד זה, ממוינים לפי קבוצת שריר. לכל תרגיל עד 30 הביצועים האחרונים.' },
          { title: 'גלילה', body: 'גלול ימינה לתרגילים נוספים בקבוצה. גלול מטה לקבוצות שרירים אחרות.' },
          { title: 'עצימות', body: 'ירוק = עצימות גבוהה (≥3000) · כחול = בינונית (≥1500) · אפור = נמוכה.' },
          { title: 'חזרות', body: 'מציג חזרות לכל סט. עמודת עצימות = סטים × חזרות × משקל (× 2 לתרגיל דו-צדדי).' },
        ]} />
      )}
    </div>
  )
}
