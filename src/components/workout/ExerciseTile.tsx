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
  onPress: () => void
}

export default function ExerciseTile({ exercise, completedToday, onPress }: Props) {
  const cat = CATEGORY[exercise.category ?? ''] ?? FALLBACK

  return (
    <button
      onClick={onPress}
      className={`
        relative rounded-xl overflow-hidden flex flex-col w-full
        bg-gradient-to-b ${cat.from} ${cat.to}
        ${completedToday ? 'ring-2 ring-green-500' : 'ring-1 ring-black/10'}
        active:scale-95 transition-transform
      `}
      style={{ aspectRatio: '1/1' }}
    >
      {completedToday && (
        <span className="absolute top-1 start-1 w-2 h-2 bg-green-500 rounded-full" />
      )}

      <div className="flex-1 flex items-center justify-center">
        {exercise.image_url ? (
          <img src={exercise.image_url} alt={exercise.name_he} className="w-8 h-8 object-contain" />
        ) : (
          <span className="text-2xl">{cat.icon}</span>
        )}
      </div>

      <div className="bg-white/50 px-1 py-1 w-full">
        <p className="text-gray-800 font-semibold text-center leading-tight line-clamp-2" style={{ fontSize: '10px' }}>
          {exercise.name_he}
        </p>
      </div>
    </button>
  )
}
