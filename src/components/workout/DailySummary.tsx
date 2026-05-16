import type { ExerciseUser, WorkoutLog } from '../../types/database'

interface Props {
  exercises: ExerciseUser[]
  logs: WorkoutLog[]
}

export default function DailySummary({ exercises, logs }: Props) {
  const exercisesDone = new Set(logs.map(l => l.exercise_id)).size
  const totalSets = logs.reduce((sum, l) => sum + l.sets_completed, 0)

  const exerciseMap = new Map(exercises.map(e => [e.id, e]))
  const totalReps = logs.reduce((sum, l) => {
    const ex = exerciseMap.get(l.exercise_id)
    return sum + l.reps_completed * (ex?.is_bilateral ? 2 : 1)
  }, 0)

  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 shadow-sm">
      <p className="text-gray-400 text-xs text-center mb-3">{today}</p>
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
