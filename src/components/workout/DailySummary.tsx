import type { ExerciseUser, WorkoutLog } from '../../types/database'

interface Props {
  exercises: ExerciseUser[]
  logs: WorkoutLog[]
  selectedDate: Date
  isToday: boolean
  onPrev: () => void
  onNext: () => void
}

export default function DailySummary({ exercises, logs, selectedDate, isToday, onPrev, onNext }: Props) {
  const exercisesDone = new Set(logs.map(l => l.exercise_id)).size

  const exerciseMap = new Map(exercises.map(e => [e.id, e]))

  const totalSets = logs.reduce((sum, l) => {
    const bilateral = exerciseMap.get(l.exercise_id)?.is_bilateral ? 2 : 1
    return sum + l.sets_completed * bilateral
  }, 0)

  const totalReps = logs.reduce((sum, l) => {
    const bilateral = exerciseMap.get(l.exercise_id)?.is_bilateral ? 2 : 1
    return sum + l.sets_completed * l.reps_completed * bilateral
  }, 0)

  const dateLabel = selectedDate.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="bg-white border-b border-gray-200 px-4 pt-3 pb-3 shadow-sm">
      {/* Date navigation */}
      <div className="flex items-center justify-between mb-3">
        {/* Back (older) — on the right in RTL */}
        <button
          onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-lg"
        >
          ›
        </button>

        <p className="text-gray-800 text-sm font-bold text-center flex-1 mx-2">
          {isToday ? `היום — ${dateLabel}` : dateLabel}
        </p>

        {/* Forward (newer) — on the left in RTL */}
        <button
          onClick={onNext}
          disabled={isToday}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-20 text-gray-600 text-lg"
        >
          ‹
        </button>
      </div>

      {/* Stats */}
      <div className="flex justify-around">
        <Stat label="תרגילים" value={`${exercisesDone}/${exercises.length}`} />
        <Stat label="סטים" value={totalSets} />
        <Stat label="חזרות" value={totalReps} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-gray-800 text-2xl font-bold">{value}</p>
      <p className="text-gray-400 text-xs mt-0.5">{label}</p>
    </div>
  )
}
