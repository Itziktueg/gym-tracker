import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExerciseUser, WorkoutLog } from '../../types/database'

interface Props {
  exercise: ExerciseUser
  todayLogs: WorkoutLog[]
  userId: string
  logDate: Date
  onClose: () => void
  onLogged: (log: WorkoutLog) => void
  onUndo: (exerciseId: string) => void
  onUpdated: (log: WorkoutLog) => void
}

export default function LogModal({ exercise, todayLogs, userId, logDate, onClose, onLogged, onUndo, onUpdated }: Props) {
  const lastLog = todayLogs[todayLogs.length - 1]
  const [sets, setSets]     = useState(lastLog?.sets_completed ?? exercise.default_sets)
  const [reps, setReps]     = useState(lastLog?.reps_completed ?? exercise.default_reps)
  const [weight, setWeight] = useState(lastLog?.weight ?? exercise.default_weight)
  const [loading, setLoading]   = useState(false)
  const [undoing, setUndoing]   = useState(false)
  const [editingLog, setEditingLog] = useState<WorkoutLog | null>(null)

  function handleEditLog(log: WorkoutLog) {
    if (editingLog?.id === log.id) {
      // Tap same log again → cancel edit, reset to defaults
      setEditingLog(null)
      setSets(lastLog?.sets_completed ?? exercise.default_sets)
      setReps(lastLog?.reps_completed ?? exercise.default_reps)
      setWeight(lastLog?.weight ?? exercise.default_weight)
    } else {
      setEditingLog(log)
      setSets(log.sets_completed)
      setReps(log.reps_completed)
      setWeight(log.weight)
    }
  }

  async function handleUndo() {
    if (!confirm('לבטל את ביצוע התרגיל להיום?')) return
    setUndoing(true)
    const ids = todayLogs.map(l => l.id)
    await supabase.from('workout_logs').delete().in('id', ids)
    onUndo(exercise.id)
    setUndoing(false)
  }

  async function handleSubmit() {
    setLoading(true)

    const intensity = sets * reps * weight * (exercise.is_bilateral ? 2 : 1)

    if (editingLog) {
      // UPDATE existing log
      const { data, error } = await supabase
        .from('workout_logs')
        .update({ sets_completed: sets, reps_completed: reps, weight, intensity })
        .eq('id', editingLog.id)
        .select()
        .single()

      if (!error && data) {
        onUpdated(data as WorkoutLog)
        setEditingLog(null)
      }
    } else {
      // INSERT new log
      const loggedAt = new Date(logDate)
      loggedAt.setHours(12, 0, 0, 0)
      const { data, error } = await supabase
        .from('workout_logs')
        .insert({
          user_id:        userId,
          exercise_id:    exercise.id,
          sets_completed: sets,
          reps_completed: reps,
          weight,
          intensity,
          logged_at:      loggedAt.toISOString(),
        })
        .select()
        .single()

      if (!error && data) onLogged(data as WorkoutLog)
    }

    setLoading(false)
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

        {/* Logged sets */}
        {todayLogs.length > 0 && (
          <div className="mb-5 bg-gray-100 rounded-2xl p-3">
            <p className="text-gray-500 text-xs text-center mb-2">סטים שבוצעו — לחץ לעריכה</p>
            <div className="flex flex-wrap gap-2 justify-center mb-3">
              {todayLogs.map((log, i) => {
                const isEditing = editingLog?.id === log.id
                return (
                  <button
                    key={log.id}
                    onClick={() => handleEditLog(log)}
                    className={`flex items-center gap-1.5 text-xs rounded-xl px-3 py-1.5 transition-colors
                      ${isEditing
                        ? 'bg-blue-500 text-white'
                        : 'bg-green-900/60 text-green-300'}`}
                  >
                    <span>#{i + 1} — {log.sets_completed}×{log.reps_completed} @ {log.weight}ק״ג</span>
                    <span className="text-[10px] opacity-70">{isEditing ? '✕' : '✏️'}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="w-full py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium disabled:opacity-50"
            >
              {undoing ? '...' : '↩ בטל ביצוע תרגיל'}
            </button>
          </div>
        )}

        {/* Inputs */}
        {editingLog && (
          <p className="text-center text-blue-500 text-xs mb-3 font-medium">
            עורך סט #{todayLogs.findIndex(l => l.id === editingLog.id) + 1}
          </p>
        )}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <NumInput label="סטים"     value={sets}   onChange={setSets}   min={1} step={1} />
          <NumInput label="חזרות"    value={reps}   onChange={setReps}   min={1} step={1} />
          <NumInput label='משקל ק"ג' value={weight} onChange={setWeight} min={0} step={1} />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full font-bold rounded-2xl py-4 text-lg transition-colors disabled:opacity-50 text-white
            ${editingLog
              ? 'bg-blue-500 hover:bg-blue-400 active:bg-blue-600'
              : 'bg-green-600 hover:bg-green-500 active:bg-green-700'}`}
        >
          {loading ? '...' : editingLog ? 'עדכן ✓' : 'רשום סט ✓'}
        </button>
      </div>
    </div>
  )
}

function NumInput({
  label, value, onChange, min, step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  step: number
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-gray-400 text-xs">{label}</label>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
        >
          −
        </button>
        <span className="text-gray-800 font-bold w-10 text-center tabular-nums">{value}</span>
        <button
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
        >
          +
        </button>
      </div>
    </div>
  )
}
