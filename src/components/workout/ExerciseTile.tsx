import type { ExerciseUser } from '../../types/database'

const CATEGORY: Record<string, { from: string; to: string; icon: string }> = {
  'פלג גוף תחתון': { from: 'from-blue-100',   to: 'to-blue-200',   icon: '🦵' },
  'גב וכתפיים':    { from: 'from-violet-100',  to: 'to-violet-200', icon: '🏋️' },
  'חזה וזרועות':   { from: 'from-orange-100',  to: 'to-orange-200', icon: '💪' },
  'בטן וליבה':     { from: 'from-teal-100',    to: 'to-teal-200',   icon: '⚡' },
}

const FALLBACK = { from: 'from-gray-100', to: 'to-gray-200', icon: '🏃' }

interface Props {
  exercise: ExerciseUser
  completedToday: boolean
  completedThisWeek?: boolean
  weekMode?: boolean
  optional?: boolean
  onPress: () => void
}

export default function ExerciseTile({ exercise, completedToday, completedThisWeek, weekMode, optional, onPress }: Props) {
  const cat = CATEGORY[exercise.category ?? ''] ?? FALLBACK

  const ringClass = weekMode
    ? (completedThisWeek ? 'ring-[3px] ring-red-500' : 'ring-1 ring-black/10')
    : (completedToday    ? 'ring-[3px] ring-green-500' : 'ring-1 ring-black/10')

  const dotColor = weekMode
    ? (completedThisWeek ? 'bg-red-500' : '')
    : (completedToday    ? 'bg-green-500' : '')

  return (
    <button
      onClick={onPress}
      className={`
        relative rounded-xl overflow-hidden flex flex-col w-full
        bg-gradient-to-b ${cat.from} ${cat.to}
        ${ringClass}
        active:scale-95 transition-transform
      `}
      style={{ aspectRatio: '1/1' }}
    >
      {optional && (
        <span className="absolute top-1 end-1 z-10 bg-amber-500 text-white text-[9px] font-bold rounded px-1 py-0.5 leading-none">
          Opt
        </span>
      )}

      {dotColor && (
        <span className={`absolute top-1 start-1 w-2 h-2 ${dotColor} rounded-full`} />
      )}

      {exercise.image_url ? (
        <img
          src={exercise.image_url}
          alt={exercise.name_he}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-3xl">{cat.icon}</span>
        </div>
      )}

      {/* Label pinned to bottom */}
      <div className={`absolute bottom-0 left-0 right-0 px-1 py-1.5 ${exercise.image_url ? 'bg-black/55' : 'bg-white/60'}`}>
        <p
          className={`font-bold text-center leading-tight line-clamp-2 ${exercise.image_url ? 'text-white' : 'text-gray-800'}`}
          style={{ fontSize: '12px' }}
        >
          {exercise.name_he}
        </p>
      </div>
    </button>
  )
}
