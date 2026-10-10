import type { ExerciseUser, WorkoutLog } from '../../types/database'

interface Props {
  exercises: ExerciseUser[]
  logs: WorkoutLog[]
  selectedDate: Date
  isToday: boolean
  onPrev: () => void
  onNext: () => void
  weekMode?: boolean
  weeklyLogs?: WorkoutLog[]
  planExerciseIds?: Set<string> | null
  /** Plan exercises marked optional. They are not counted against you. */
  optionalIds?: Set<string> | null
}

export default function DailySummary({ exercises, logs, selectedDate, isToday, onPrev, onNext, weekMode, weeklyLogs, planExerciseIds, optionalIds }: Props) {
  const activeLogs = weekMode && weeklyLogs ? weeklyLogs : logs

  // With an active plan the counter reads against the plan (7/14), not the full library
  const doneIds = new Set(activeLogs.map(l => l.exercise_id))
  // Optional exercises are not part of what is required, so they stay out of the
  // denominator - the same rule ביצוע לעומת תכנון applies. Otherwise a workout
  // offering five aerobic options, of which you do one, could never read 5/5.
  // Optionals you did are shown separately as "+n" rather than hidden.
  const isOptional = (id: string) => !!optionalIds?.has(id)
  const requiredIds = planExerciseIds ? [...planExerciseIds].filter(id => !isOptional(id)) : null
  const doneRequired = requiredIds
    ? requiredIds.filter(id => doneIds.has(id)).length
    : doneIds.size
  const doneOptional = planExerciseIds
    ? [...doneIds].filter(id => planExerciseIds.has(id) && isOptional(id)).length
    : 0
  const totalExercises = requiredIds ? requiredIds.length : exercises.length

  // A group with nothing required (an all-optional workout) has no fraction to
  // show, only what you did.
  const exercisesLabel = totalExercises > 0
    ? `${doneRequired}/${totalExercises}${doneOptional > 0 ? ` +${doneOptional}` : ''}`
    : String(doneOptional)

  const exerciseMap = new Map(exercises.map(e => [e.id, e]))

  function factor(exerciseId: string) {
    const ex = exerciseMap.get(exerciseId)
    return (ex?.is_bilateral || ex?.double_weight) ? 2 : 1
  }

  // A time-based exercise logs seconds in the reps field, so it would add its
  // hold duration to the rep count. It still counts towards תרגילים above —
  // whether you did the plank is a plain yes/no, unaffected by the unit.
  const volumeLogs = activeLogs.filter(l => !exerciseMap.get(l.exercise_id)?.is_time_based)

  const totalSets = volumeLogs.reduce((sum, l) => sum + l.sets_completed * factor(l.exercise_id), 0)
  const totalReps = volumeLogs.reduce((sum, l) => sum + l.sets_completed * l.reps_completed * factor(l.exercise_id), 0)

  const dateLabel = selectedDate.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const headerLabel = weekMode
    ? 'השבוע'
    : isToday ? `היום — ${dateLabel}` : dateLabel

  return (
    <div className={`border-b px-4 pt-3 pb-3 shadow-sm ${weekMode ? 'bg-red-50 border-red-100' : 'bg-white border-gray-200'}`}>
      {/* Date navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          disabled={weekMode}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-20 text-gray-600 text-lg"
        >
          ›
        </button>

        <p className={`text-sm font-bold text-center flex-1 mx-2 ${weekMode ? 'text-red-700' : 'text-gray-800'}`}>
          {headerLabel}
        </p>

        <button
          onClick={onNext}
          disabled={isToday || weekMode}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-20 text-gray-600 text-lg"
        >
          ‹
        </button>
      </div>

      {/* Stats */}
      <div className="flex justify-around">
        <Stat label="תרגילים" value={exercisesLabel} weekMode={weekMode} />
        <Stat label="סטים" value={totalSets} weekMode={weekMode} />
        <Stat label="חזרות" value={totalReps} weekMode={weekMode} />
      </div>
    </div>
  )
}

function Stat({ label, value, weekMode }: { label: string; value: string | number; weekMode?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${weekMode ? 'text-red-700' : 'text-gray-800'}`}>{value}</p>
      <p className="text-gray-400 text-xs mt-0.5">{label}</p>
    </div>
  )
}
