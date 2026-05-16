import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ExerciseUser } from '../types/database'

interface Props {
  userId: string
  onClose: () => void
}

export default function ManageExercisesPage({ userId, onClose }: Props) {
  const [exercises, setExercises] = useState<ExerciseUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('exercises_user')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order')
      .then(({ data }) => {
        setExercises(data ?? [])
        setLoading(false)
      })
  }, [userId])

  async function toggleActive(id: string, current: boolean) {
    setExercises(prev =>
      prev.map(e => e.id === id ? { ...e, is_active: !current } : e)
    )
    await supabase
      .from('exercises_user')
      .update({ is_active: !current })
      .eq('id', id)
  }

  function moveUp(index: number) {
    if (index === 0) return
    const updated = [...exercises]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    setExercises(updated)
  }

  function moveDown(index: number) {
    if (index === exercises.length - 1) return
    const updated = [...exercises]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    setExercises(updated)
  }

  async function saveOrder() {
    setSaving(true)
    await Promise.all(
      exercises.map((ex, i) =>
        supabase
          .from('exercises_user')
          .update({ sort_order: i })
          .eq('id', ex.id)
      )
    )
    setSaving(false)
    onClose()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">טוען...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
        >
          ביטול
        </button>
        <h1 className="text-gray-800 font-bold text-lg">ניהול תרגילים</h1>
        <button
          onClick={saveOrder}
          disabled={saving}
          className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
        >
          {saving ? '...' : 'שמור'}
        </button>
      </div>

      <p className="text-gray-400 text-xs text-center mt-3 mb-1">
        סדר ותרגילים — לחץ על העין להסתיר תרגיל
      </p>

      {/* Exercise list */}
      <div className="flex flex-col gap-1 p-3">
        {exercises.map((ex, i) => (
          <div
            key={ex.id}
            className={`
              bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm
              ${!ex.is_active ? 'opacity-40' : ''}
            `}
          >
            {/* Order buttons */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-sm leading-none"
              >
                ▲
              </button>
              <button
                onClick={() => moveDown(i)}
                disabled={i === exercises.length - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-sm leading-none"
              >
                ▼
              </button>
            </div>

            {/* Name */}
            <div className="flex-1">
              <p className="text-gray-800 font-medium text-sm">{ex.name_he}</p>
              <p className="text-gray-400 text-xs">{ex.category}</p>
            </div>

            {/* Toggle visibility */}
            <button
              onClick={() => toggleActive(ex.id, ex.is_active)}
              className={`text-xl ${ex.is_active ? 'text-gray-600' : 'text-gray-300'}`}
              title={ex.is_active ? 'הסתר' : 'הצג'}
            >
              {ex.is_active ? '👁' : '🙈'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
