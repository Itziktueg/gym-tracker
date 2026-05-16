import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExerciseGlobal } from '../../types/database'

const CATEGORIES = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const EMPTY: Omit<ExerciseGlobal, 'id' | 'created_at'> = {
  name_he: '',
  name_en: '',
  image_url: null,
  video_url: null,
  default_sets: 3,
  default_reps: 12,
  default_weight: 0,
  is_bilateral: false,
  notes: null,
  category: CATEGORIES[0],
  sort_order: 0,
}

export default function ExercisesTab() {
  const [exercises, setExercises] = useState<ExerciseGlobal[]>([])
  const [editing, setEditing] = useState<ExerciseGlobal | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('exercises_global')
      .select('*')
      .order('sort_order')
      .then(({ data }) => {
        setExercises(data ?? [])
        setLoading(false)
      })
  }, [])

  function openNew() {
    setEditing({ ...EMPTY, id: '', created_at: '', sort_order: exercises.length + 1 } as ExerciseGlobal)
    setIsNew(true)
  }

  function openEdit(ex: ExerciseGlobal) {
    setEditing({ ...ex })
    setIsNew(false)
  }

  async function save() {
    if (!editing) return
    setSaving(true)

    if (isNew) {
      const { id: _id, created_at: _ca, ...payload } = editing
      const { data, error } = await supabase
        .from('exercises_global')
        .insert(payload)
        .select()
        .single()
      if (!error && data) setExercises(prev => [...prev, data as ExerciseGlobal])
    } else {
      const { error } = await supabase
        .from('exercises_global')
        .update(editing)
        .eq('id', editing.id)
      if (!error) setExercises(prev => prev.map(e => e.id === editing.id ? editing : e))
    }

    setSaving(false)
    setEditing(null)
  }

  async function deleteExercise(id: string) {
    if (!confirm('למחוק תרגיל זה?')) return
    await supabase.from('exercises_global').delete().eq('id', id)
    setExercises(prev => prev.filter(e => e.id !== id))
  }

  if (loading) return <p className="text-center text-gray-400 mt-8">טוען...</p>

  if (editing) {
    return (
      <div className="p-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <h3 className="text-gray-800 font-bold text-center">
            {isNew ? 'תרגיל חדש' : 'עריכת תרגיל'}
          </h3>

          <Field label="שם בעברית">
            <input
              value={editing.name_he}
              onChange={e => setEditing({ ...editing, name_he: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="שם באנגלית">
            <input
              value={editing.name_en}
              onChange={e => setEditing({ ...editing, name_en: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="קטגוריה">
            <select
              value={editing.category ?? ''}
              onChange={e => setEditing({ ...editing, category: e.target.value })}
              className={inputCls}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="קישור סרטון (ExRx)">
            <input
              value={editing.video_url ?? ''}
              onChange={e => setEditing({ ...editing, video_url: e.target.value || null })}
              className={inputCls}
              placeholder="https://exrx.net/..."
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="סטים">
              <input type="number" min={1} value={editing.default_sets}
                onChange={e => setEditing({ ...editing, default_sets: +e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="חזרות">
              <input type="number" min={1} value={editing.default_reps}
                onChange={e => setEditing({ ...editing, default_reps: +e.target.value })}
                className={inputCls} />
            </Field>
            <Field label='משקל ק"ג'>
              <input type="number" min={0} step={2.5} value={editing.default_weight}
                onChange={e => setEditing({ ...editing, default_weight: +e.target.value })}
                className={inputCls} />
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editing.is_bilateral}
              onChange={e => setEditing({ ...editing, is_bilateral: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-gray-700 text-sm">תרגיל דו-צדדי (מכפיל חזרות)</span>
          </label>

          <Field label="הערות">
            <textarea
              value={editing.notes ?? ''}
              onChange={e => setEditing({ ...editing, notes: e.target.value || null })}
              className={inputCls + ' h-16 resize-none'}
            />
          </Field>

          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setEditing(null)}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold"
            >
              ביטול
            </button>
            <button
              onClick={save}
              disabled={saving || !editing.name_he}
              className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold"
            >
              {saving ? '...' : 'שמור'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3">
      <button
        onClick={openNew}
        className="w-full mb-3 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold"
      >
        + תרגיל חדש
      </button>

      <div className="flex flex-col gap-2">
        {exercises.map(ex => (
          <div key={ex.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 font-medium text-sm">{ex.name_he}</p>
              <p className="text-gray-400 text-xs">{ex.category}</p>
            </div>
            <button
              onClick={() => openEdit(ex)}
              className="text-blue-400 hover:text-blue-600 text-sm font-medium shrink-0"
            >
              עריכה
            </button>
            <button
              onClick={() => deleteExercise(ex.id)}
              className="text-red-400 hover:text-red-600 text-sm shrink-0"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-gray-500 text-xs">{label}</label>
      {children}
    </div>
  )
}
