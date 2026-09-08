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
  onEditExercise: () => void
  workoutId: string | null
  lang?: 'he' | 'en'
}

interface SetLine {
  reps: number
  weight: number
  rir: number | null      // reps in reserve; null = not recorded
}

/** Same muscle-group colours the tiles and reports use, so a set card is tied
 *  to its exercise without adding any extra chrome. */
const CATEGORY_ACCENT: Record<string, string> = {
  'פלג גוף תחתון': '#3b82f6',   // blue-500
  'גב וכתפיים':    '#8b5cf6',   // violet-500
  'חזה וזרועות':   '#f97316',   // orange-500
  'בטן וליבה':     '#14b8a6',   // teal-500
}

/** 4 is the catch-all "4 or more reps still in the tank".
 *  Colour runs red (to failure) to green (plenty left), so the scale reads
 *  without needing the numbers. */
const RIR_OPTIONS = [
  { value: 0, label: '0',  idle: 'bg-red-100 text-red-700 hover:bg-red-200',          on: 'bg-red-500 text-white' },
  { value: 1, label: '1',  idle: 'bg-orange-100 text-orange-700 hover:bg-orange-200', on: 'bg-orange-500 text-white' },
  { value: 2, label: '2',  idle: 'bg-amber-100 text-amber-700 hover:bg-amber-200',    on: 'bg-amber-500 text-white' },
  { value: 3, label: '3',  idle: 'bg-lime-100 text-lime-700 hover:bg-lime-200',       on: 'bg-lime-600 text-white' },
  { value: 4, label: '+4', idle: 'bg-green-100 text-green-700 hover:bg-green-200',    on: 'bg-green-600 text-white' },
]

export default function LogModal({ exercise, todayLogs, userId, logDate, onClose, onSaved, onUndo, onEditExercise, workoutId, lang = 'he' }: Props) {
  const englishName = lang === 'en' ? exercise.name_en?.trim() : ''
  const accent = CATEGORY_ACCENT[exercise.category ?? ''] ?? '#d1d5db'
  const numSets = Math.max(exercise.default_sets, 1)

  const [lines, setLines] = useState<SetLine[]>(
    todayLogs.length > 0
      ? todayLogs.map(l => ({ reps: l.reps_completed, weight: l.weight, rir: l.rir ?? null }))
      : Array.from({ length: numSets }, () => ({
          reps: exercise.default_reps,
          weight: exercise.default_weight,
          rir: null as number | null,
        }))
  )
  // One note per exercise per day. Stored on every set row of this save, so it
  // survives even if some rows are later removed.
  const [note, setNote] = useState(todayLogs.find(l => l.notes)?.notes ?? '')
  const [loading, setLoading]           = useState(false)
  const [undoing, setUndoing]           = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [defaultsSaved, setDefaultsSaved]   = useState(false)

  function updateLine(i: number, field: 'reps' | 'weight' | 'rir', value: number | null) {
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
      intensity:      line.reps * line.weight * ((exercise.is_bilateral || exercise.double_weight) ? 2 : 1),
      logged_at:      loggedAt.toISOString(),
      // Recorded from the exercise's own assignment, so it is right regardless
      // of which tab the user happened to be on
      workout_id:     workoutId,
      notes:          note.trim() || null,
      rir:            line.rir,
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
      {/* Capped and split into three: only the set list scrolls, so the title
          and the action buttons stay put however many sets there are. */}
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none w-10 h-10 flex items-center justify-center"
          >
            ×
          </button>
          <h2 dir={englishName ? 'ltr' : 'rtl'}
            className="text-gray-800 text-lg font-bold text-center flex-1">
            {englishName || exercise.name_he}
          </h2>
          {/* Demo link lives in the header rather than its own row: that row cost
              ~36px, which is the difference between three set cards fitting and
              not once the undo button is present. */}
          <div className="flex items-center shrink-0">
            {exercise.video_url && (
              <a
                href={exercise.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-500 w-9 h-10 flex items-center justify-center text-base"
                title="צפה בהדגמה"
              >
                ▶
              </a>
            )}
            <button
              onClick={onEditExercise}
              className="text-gray-400 hover:text-gray-600 w-10 h-10 flex items-center justify-center text-lg"
              title="עריכת תרגיל"
            >
              ✏️
            </button>
          </div>
        </div>

        {exercise.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2 mb-3 text-amber-800 text-sm leading-relaxed">
            {exercise.notes}
          </div>
        )}

        </div>

        {/* One card per set: reps/weight and its RIR live inside the same box,
            separated by a hairline, with clear space between sets.
            min-h-0 is required or the flex child refuses to shrink and scroll. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-1 space-y-4">
          {lines.map((line, i) => (
            <div
              key={i}
              className="bg-gray-50 rounded-2xl px-4 py-3"
              style={{ borderInlineStart: `3px solid ${accent}` }}
            >
              <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs font-bold w-8 shrink-0 text-right">
                סט {i + 1}
              </span>

              {/* Reps */}
              <div className="flex items-center gap-1 flex-1 justify-center">
                <button
                  onClick={() => updateLine(i, 'reps', Math.max(1, line.reps - 1))}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >−</button>
                <span className="text-gray-800 font-extrabold text-[17px] w-[34px] text-center tabular-nums">{line.reps}</span>
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
                <span className="text-gray-800 font-extrabold text-[17px] w-10 text-center tabular-nums">{line.weight}</span>
                <button
                  onClick={() => updateLine(i, 'weight', line.weight + 1)}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >+</button>
                <span className="text-gray-400 text-xs w-6">ק"ג</span>
              </div>
              </div>

              {/* RIR for this set — tap again to clear */}
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-gray-200">
                <span className="text-gray-400 text-xs font-bold w-8 shrink-0 text-right">RIR</span>
                <div className="flex items-center gap-1 flex-1 justify-center">
                  {RIR_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateLine(i, 'rir', line.rir === opt.value ? null : opt.value)}
                      className={`flex-1 h-8 rounded-lg text-xs font-bold transition-all ${
                        line.rir === opt.value
                          ? `${opt.on} ring-2 ring-offset-2 ring-offset-gray-50 ring-gray-300`
                          : `${opt.idle} ${line.rir !== null ? 'opacity-45' : ''}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tight chrome so three set cards clear the scroll area on a phone */}
        <div className="px-6 pb-4 pt-2 shrink-0">
        {/* How the exercise felt — read later by the coach */}
        <div className="mb-2">
          <label className="text-gray-500 text-xs font-medium block mb-0.5">
            איך היה התרגיל? (רשות)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={1}
            placeholder="הרגשה, קושי, כאב, הערה למאמן..."
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* Confirm */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full font-bold rounded-2xl py-2.5 text-base bg-green-600 hover:bg-green-500 active:bg-green-700 text-white transition-colors disabled:opacity-50 mb-2"
        >
          {loading ? '...' : 'אשר ✓'}
        </button>

        {/* Both secondaries share one row. Stacked, the undo button cost a whole
            extra line and pushed the third set card out of the scroll area. */}
        <div className="flex gap-2">
          <button
            onClick={handleUpdateDefaults}
            disabled={!allSame || savingDefaults}
            title={!allSame ? 'לא ניתן לשמור ברירות מחדל כאשר הסטים שונים זה מזה' : ''}
            className="flex-1 font-bold rounded-2xl py-2 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-200 transition-colors disabled:opacity-40"
          >
            {savingDefaults ? '...' : defaultsSaved ? '✓ נשמר' : 'עדכן ברירות מחדל'}
          </button>

          {/* Only shown if logs already exist for today */}
          {todayLogs.length > 0 && (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="flex-1 py-2 rounded-2xl bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 text-xs font-bold disabled:opacity-50"
            >
              {undoing ? '...' : '↩ בטל ביצוע'}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
