import { useEffect, useRef, useState } from 'react'
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
  sort_order: 999,
}

export default function ExercisesTab() {
  const [exercises, setExercises] = useState<ExerciseGlobal[]>([])
  const [editing, setEditing] = useState<ExerciseGlobal | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(exerciseId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `global/${exerciseId}.${ext}`
    const { error } = await supabase.storage.from('exercise-images').upload(path, file, { upsert: true })
    if (error) console.error('Storage upload error:', error)
    const { data: { publicUrl } } = supabase.storage.from('exercise-images').getPublicUrl(path)
    // Cache-buster so the browser always fetches the latest version
    return `${publicUrl}?t=${Date.now()}`
  }

  useEffect(() => {
    supabase
      .from('exercises_global')
      .select('*')
      .order('sort_order')
      .order('name_he')
      .then(({ data }) => {
        setExercises(data ?? [])
        setLoading(false)
      })
  }, [])

  function openNew() {
    setEditing({ ...EMPTY, id: '', created_at: '' } as ExerciseGlobal)
    setIsNew(true)
    setPendingImageFile(null)
    setImagePreview(null)
  }

  function openEdit(ex: ExerciseGlobal) {
    setEditing({ ...ex })
    setIsNew(false)
    setPendingImageFile(null)
    setImagePreview(ex.image_url)
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
      if (!error && data) {
        let saved = data as ExerciseGlobal
        if (pendingImageFile) {
          const url = await uploadImage(saved.id, pendingImageFile)
          await supabase.from('exercises_global').update({ image_url: url }).eq('id', saved.id)
          saved = { ...saved, image_url: url }
        }
        setExercises(prev => [...prev, saved])
      }
    } else {
      let updated = { ...editing }
      if (pendingImageFile) {
        const url = await uploadImage(editing.id, pendingImageFile)
        updated = { ...updated, image_url: url }
      }
      const { error } = await supabase
        .from('exercises_global')
        .update(updated)
        .eq('id', updated.id)
      if (!error) {
        setExercises(prev => prev.map(e => e.id === updated.id ? updated : e))
        // Propagate factual fields to all users who have this global exercise
        const propagate: Record<string, unknown> = {
          name_he:      updated.name_he,
          name_en:      updated.name_en,
          category:     updated.category,
          video_url:    updated.video_url,
          is_bilateral: updated.is_bilateral,
        }
        if (updated.image_url) propagate.image_url = updated.image_url
        await supabase
          .from('exercises_user')
          .update(propagate)
          .eq('global_exercise_id', updated.id)
      }
    }

    setSaving(false)
    setEditing(null)
    setPendingImageFile(null)
    setImagePreview(null)
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

          <div className="grid grid-cols-2 gap-2">
            <Field label="קטגוריה">
              <select
                value={editing.category ?? ''}
                onChange={e => setEditing({ ...editing, category: e.target.value })}
                className={inputCls}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="סדר תצוגה (1–999)">
              <input
                type="number"
                min={1}
                max={999}
                value={editing.sort_order ?? 999}
                onChange={e => setEditing({ ...editing, sort_order: +e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="קישור סרטון (ExRx)">
            <input
              value={editing.video_url ?? ''}
              onChange={e => setEditing({ ...editing, video_url: e.target.value || null })}
              className={inputCls}
              placeholder="https://exrx.net/..."
            />
          </Field>

          <Field label="תמונה">
            <div className="flex items-center gap-3">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl shrink-0">
                  📷
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-200"
              >
                {imagePreview ? 'החלף תמונה' : 'העלה תמונה'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>
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
              <input type="number" min={0} step={1} value={editing.default_weight}
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
            {ex.image_url ? (
              <img src={ex.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-lg shrink-0">📷</div>
            )}
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
