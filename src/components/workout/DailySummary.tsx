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
}

export default function DailySummary({ exercises, logs, selectedDate, isToday, onPrev, onNext, weekMode, weeklyLogs, planExerciseIds }: Props) {
  const activeLogs = weekMode && weeklyLogs ? weeklyLogs : logs

  // With an active plan the counter reads against the plan (7/14), not the full library
  const doneIds = new Set(activeLogs.map(l => l.exercise_id))
  const exercisesDone = planExerciseIds
    ? [...doneIds].filter(id => planExerciseIds.has(id)).length
    : doneIds.size
  const totalExercises = planExerciseIds ? planExerciseIds.size : exercises.length

  const exerciseMap = new Map(exercises.map(e => [e.id, e]))

  function factor(exerciseId: string) {
    const ex = exerciseMap.get(exerciseId)
    return (ex?.is_bilateral || ex?.double_weight) ? 2 : 1
  }

  const totalSets = activeLogs.reduce((sum, l) => sum + l.sets_completed * factor(l.exercise_id), 0)
  const totalReps = activeLogs.reduce((sum, l) => sum + l.sets_completed * l.reps_completed * factor(l.exercise_id), 0)

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
        <Stat label="תרגילים" value={`${exercisesDone}/${totalExercises}`} weekMode={weekMode} />
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
