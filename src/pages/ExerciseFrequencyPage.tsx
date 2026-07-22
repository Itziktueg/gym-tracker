import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

const PERIODS = [
  { label: '7 ימים',  days: 7  },
  { label: '30 ימים', days: 30 },
  { label: '90 ימים', days: 90 },
  { label: 'הכל',     days: 0  },
]

const CATEGORY_DOT: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

const CATEGORY_TEXT: Record<string, string> = {
  'פלג גוף תחתון': 'text-blue-500',
  'גב וכתפיים':    'text-violet-500',
  'חזה וזרועות':   'text-orange-500',
  'בטן וליבה':     'text-teal-500',
}

interface ExFreq {
  exerciseId: string
  name_he: string
  category: string
  count: number
}

export default function ExerciseFrequencyPage({ userId, onClose }: Props) {
  const [periodDays, setPeriodDays] = useState(30)
  const [rows,       setRows]       = useState<ExFreq[]>([])
  const [loading,    setLoading]    = useState(true)
  const [helpOpen,   setHelpOpen]   = useState(false)

  useEffect(() => {
    load()
  }, [periodDays]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)

    const { data: exData } = await supabase
      .from('exercises_user')
      .select('id, name_he, category')
      .eq('user_id', userId)

    let query = supabase
      .from('workout_logs')
      .select('exercise_id, logged_at')
      .eq('user_id', userId)

    if (periodDays > 0) {
      const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('logged_at', since)
    }

    const { data: logs } = await query

    if (!logs || !exData) { setLoading(false); return }

    const exMap: Record<string, { name_he: string; category: string }> = {}
    for (const ex of exData) exMap[ex.id] = { name_he: ex.name_he, category: ex.category ?? '' }

    // Count distinct workout days per exercise
    const dayCounts: Record<string, Set<string>> = {}
    for (const log of logs) {
      const date = log.logged_at.slice(0, 10)
      if (!dayCounts[log.exercise_id]) dayCounts[log.exercise_id] = new Set()
      dayCounts[log.exercise_id].add(date)
    }

    const result: ExFreq[] = Object.entries(dayCounts)
      .map(([exerciseId, dates]) => ({
        exerciseId,
        name_he:  exMap[exerciseId]?.name_he  ?? exerciseId,
        category: exMap[exerciseId]?.category ?? '',
        count:    dates.size,
      }))
      .sort((a, b) => b.count - a.count)

    setRows(result)
    setLoading(false)
  }

  const maxCount = rows[0]?.count ?? 1

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">תדירות תרגילים</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      {/* Period selector */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 shrink-0">
        {PERIODS.map(p => (
          <button
            key={p.days}
            onClick={() => setPeriodDays(p.days)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              periodDays === p.days
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">טוען...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">לא נמצאו אימונים בתקופה זו</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col divide-y divide-gray-100">
            {rows.map((row, i) => (
              <div key={row.exerciseId} className="bg-white px-4 py-3 flex items-center gap-3">
                {/* Rank */}
                <span className="text-gray-300 text-xs font-bold w-5 text-center shrink-0">
                  {i + 1}
                </span>

                {/* Category dot + name */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 text-sm font-semibold truncate">{row.name_he}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CATEGORY_DOT[row.category] ?? 'bg-gray-400'}`} />
                    <span className={`text-xs ${CATEGORY_TEXT[row.category] ?? 'text-gray-400'}`}>{row.category || '—'}</span>
                  </div>
                </div>

                {/* Bar + count */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-blue-600 font-bold text-sm w-6 text-left">
                    {row.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'תדירות תרגילים', body: 'מספר הפעמים שכל תרגיל בוצע בתקופה הנבחרת, מהגבוה לנמוך.' },
          { title: 'בחירת תקופה', body: 'לחץ על 7 / 30 / 90 ימים או "הכל" לשינוי הטווח. ברירת המחדל: 30 ימים.' },
          { title: 'ספירה', body: 'הספירה מתייחסת לימי אימון שונים — ביצוע תרגיל 5 סטים באותו יום נחשב פעם אחת.' },
        ]} />
      )}
    </div>
  )
}
