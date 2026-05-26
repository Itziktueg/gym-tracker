import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExerciseUser, WorkoutLog } from '../../types/database'

interface Props {
  exercise: ExerciseUser
  todayLogs: WorkoutLog[]
  userId: string
  logDate: Date
  onClose: () => void
  onSaved: (exerciseId: string, newLogs: WorkoutLog[]) => void
  onUndo: (exerciseId: string) => void
}

interface SetLine {
  reps: number
  weight: number
}

export default function LogModal({ exercise, todayLogs, userId, logDate, onClose, onSaved, onUndo }: Props) {
  const numSets = Math.max(exercise.default_sets, 1)

  const [lines, setLines] = useState<SetLine[]>(
    Array.from({ length: numSets }, () => ({
      reps: exercise.default_reps,
      weight: exercise.default_weight,
    }))
  )
  const [loading, setLoading]           = useState(false)
  const [undoing, setUndoing]           = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [defaultsSaved, setDefaultsSaved]   = useState(false)

  function updateLine(i: number, field: 'reps' | 'weight', value: number) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  // Defaults can only be saved when all sets are identical
  const allSame = lines.every(l => l.reps === lines[0].reps && l.weight === lines[0].weight)

  async function handleSubmit() {
    setLoading(true)
    // Remove any existing logs for this exercise today (safety)
    if (todayLogs.length > 0) {
      await supabase.from('workout_logs').delete().in('id', todayLogs.map(l => l.id))
    }
    const loggedAt = new Date(logDate)
    loggedAt.setHours(12, 0, 0, 0)
    const records = lines.map(line => ({
      user_id:        userId,
      exercise_id:    exercise.id,
      sets_completed: 1,
      reps_completed: line.reps,
      weight:         line.weight,
      intensity:      line.reps * line.weight * (exercise.is_bilateral ? 2 : 1),
      logged_at:      loggedAt.toISOString(),
    }))
    const { data } = await supabase.from('workout_logs').insert(records).select()
    onSaved(exercise.id, (data ?? []) as WorkoutLog[])
    setLoading(false)
  }

  async function handleUndo() {
    if (!confirm('לבטל את ביצוע התרגיל להיום?')) return
    setUndoing(true)
    await supabase.from('workout_logs').delete().in('id', todayLogs.map(l => l.id))
    onUndo(exercise.id)
    setUndoing(false)
  }

  async function handleUpdateDefaults() {
    setSavingDefaults(true)
    await supabase
      .from('exercises_user')
      .update({
        default_sets:   lines.length,
        default_reps:   lines[0].reps,
        default_weight: lines[0].weight,
      })
      .eq('id', exercise.id)
    setSavingDefaults(false)
    setDefaultsSaved(true)
    setTimeout(() => setDefaultsSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-6 pb-12 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none w-10 h-10 flex items-center justify-center"
          >
            ×
          </button>
          <h2 className="text-gray-800 text-lg font-bold text-center flex-1 ps-10">
            {exercise.name_he}
          </h2>
        </div>

        {exercise.video_url && (
          <a
            href={exercise.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-blue-400 text-sm mb-5 hover:text-blue-300"
          >
            צפה בהדגמה ↗
          </a>
        )}

        {/* Set rows */}
        <div className="space-y-3 mb-6">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-3">
              <span className="text-gray-400 text-xs font-bold w-8 shrink-0 text-right">
                סט {i + 1}
              </span>

              {/* Reps */}
              <div className="flex items-center gap-1 flex-1 justify-center">
                <button
                  onClick={() => updateLine(i, 'reps', Math.max(1, line.reps - 1))}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >−</button>
                <span className="text-gray-800 font-bold w-8 text-center tabular-nums">{line.reps}</span>
                <button
                  onClick={() => updateLine(i, 'reps', line.reps + 1)}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >+</button>
                <span className="text-gray-400 text-xs w-6">חז'</span>
              </div>

              {/* Weight */}
              <div className="flex items-center gap-1 flex-1 justify-center">
                <button
                  onClick={() => updateLine(i, 'weight', Math.max(0, line.weight - 1))}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >−</button>
                <span className="text-gray-800 font-bold w-10 text-center tabular-nums">{line.weight}</span>
                <button
                  onClick={() => updateLine(i, 'weight', line.weight + 1)}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >+</button>
                <span className="text-gray-400 text-xs w-6">ק"ג</span>
              </div>
            </div>
          ))}
        </div>

        {/* Confirm */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full font-bold rounded-2xl py-4 text-lg bg-green-600 hover:bg-green-500 active:bg-green-700 text-white transition-colors disabled:opacity-50 mb-3"
        >
          {loading ? '...' : 'אשר ✓'}
        </button>

        {/* Update defaults — disabled when sets differ */}
        <button
          onClick={handleUpdateDefaults}
          disabled={!allSame || savingDefaults}
          title={!allSame ? 'לא ניתן לשמור ברירות מחדל כאשר הסטים שונים זה מזה' : ''}
          className="w-full font-medium rounded-2xl py-3 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-40 mb-3"
        >
          {savingDefaults ? '...' : defaultsSaved ? '✓ נשמר' : 'עדכן ברירות מחדל'}
        </button>

        {/* Undo — only shown if logs already exist for today */}
        {todayLogs.length > 0 && (
          <button
            onClick={handleUndo}
            disabled={undoing}
            className="w-full py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium disabled:opacity-50"
          >
            {undoing ? '...' : '↩ בטל ביצוע תרגיל'}
          </button>
        )}
      </div>
    </div>
  )
}
