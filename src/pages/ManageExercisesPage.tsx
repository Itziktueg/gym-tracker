import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'
import type { ExerciseUser, ExerciseGlobal } from '../types/database'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const CATEGORIES = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const EMPTY_FORM = {
  name_he:        '',
  name_en:        '',
  category:       CATEGORIES[0],
  video_url:      '',
  default_sets:   3,
  default_reps:   12,
  default_weight: 0,
  is_bilateral:   false,
  double_weight:  false,
  notes:          '',
  image_url:      null as string | null,
  sort_order:     999,
}
type FormData = typeof EMPTY_FORM

interface Props {
  userId: string
  onClose: () => void
}

function sortByOrder(arr: ExerciseUser[]) {
  return [...arr].sort((a, b) => a.sort_order - b.sort_order || a.name_he.localeCompare(b.name_he, 'he'))
}

export default function ManageExercisesPage({ userId, onClose }: Props) {
  const [exercises, setExercises]   = useState<ExerciseUser[]>([])
  const [globalLib, setGlobalLib]   = useState<ExerciseGlobal[]>([])
  const [loading, setLoading]       = useState(true)

  // List quick-image upload
  const [uploadingId, setUploadingId]           = useState<string | null>(null)
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null)
  const listFileInputRef = useRef<HTMLInputElement>(null)

  // Create / edit form
  const [formData, setFormData]             = useState<FormData | null>(null)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [selectedGlobalId, setSelectedGlobalId] = useState<string | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [formImageFile, setFormImageFile]   = useState<File | null>(null)
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null)
  const formFileInputRef = useRef<HTMLInputElement>(null)

  // Library picker modal
  const [pickerOpen, setPickerOpen] = useState(false)

  const [helpOpen, setHelpOpen] = useState(false)

  // Scroll-to after edit/delete
  const [scrollToId, setScrollToId] = useState<string | null>(null)
  useEffect(() => {
    if (!scrollToId) return
    const el = document.querySelector(`[data-id="${scrollToId}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setScrollToId(null)
  }, [scrollToId, exercises])

  useEffect(() => {
    Promise.all([
      supabase
        .from('exercises_user')
        .select('*')
        .eq('user_id', userId)
        .order('sort_order')
        .order('name_he'),
      supabase
        .from('exercises_global')
        .select('*')
        .order('sort_order')
        .order('name_he'),
    ]).then(([{ data: userData }, { data: globalData }]) => {
      setExercises(userData ?? [])
      setGlobalLib(globalData ?? [])
      setLoading(false)
    })
  }, [userId])

  // ── List: quick image upload ───────────────────────────────
  function handleImageClick(exerciseId: string) {
    setPendingExerciseId(exerciseId)
    listFileInputRef.current?.click()
  }

  async function handleListFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingExerciseId) return
    setUploadingId(pendingExerciseId)
    const url = await uploadImage(pendingExerciseId, file)
    if (url) {
      await supabase.from('exercises_user').update({ image_url: url }).eq('id', pendingExerciseId)
      setExercises(prev => prev.map(ex => ex.id === pendingExerciseId ? { ...ex, image_url: url } : ex))
    }
    setUploadingId(null)
    e.target.value = ''
  }

  async function uploadImage(exerciseId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/${exerciseId}.${ext}`
    const { error } = await supabase.storage.from('exercise-images').upload(path, file, { upsert: true })
    if (error) { console.error('Upload error:', error); return null }
    const { data: { publicUrl } } = supabase.storage.from('exercise-images').getPublicUrl(path)
    return `${publicUrl}?t=${Date.now()}`
  }

  // ── List: delete ───────────────────────────────────────────
  async function deleteExercise(id: string) {
    if (!confirm('למחוק תרגיל זה מהרשימה האישית שלך?')) return
    const idx = exercises.findIndex(e => e.id === id)
    const nextId = exercises[idx + 1]?.id ?? exercises[idx - 1]?.id ?? null
    await supabase.from('exercises_user').delete().eq('id', id)
    setExercises(prev => prev.filter(e => e.id !== id))
    if (nextId) setScrollToId(nextId)
  }

  // ── List: toggle visibility ────────────────────────────────
  async function toggleActive(id: string, current: boolean) {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, is_active: !current } : e))
    await supabase.from('exercises_user').update({ is_active: !current }).eq('id', id)
  }

  // ── Form: open ─────────────────────────────────────────────
  function openNew() {
    setFormData({ ...EMPTY_FORM })
    setEditingId(null)
    setSelectedGlobalId(null)
    setFormImageFile(null)
    setFormImagePreview(null)
  }

  function openEdit(ex: ExerciseUser) {
    setFormData({
      name_he:        ex.name_he,
      name_en:        ex.name_en ?? '',
      category:       ex.category ?? CATEGORIES[0],
      video_url:      ex.video_url ?? '',
      default_sets:   ex.default_sets,
      default_reps:   ex.default_reps,
      default_weight: ex.default_weight,
      is_bilateral:   ex.is_bilateral,
      double_weight:  ex.double_weight,
      notes:          ex.notes ?? '',
      image_url:      ex.image_url,
      sort_order:     ex.sort_order,
    })
    setEditingId(ex.id)
    setSelectedGlobalId(null)
    setFormImageFile(null)
    setFormImagePreview(ex.image_url)
  }

  // ── Global picker: when user selects a global exercise ─────
  function handleGlobalPick(globalId: string) {
    setSelectedGlobalId(globalId || null)
    if (!globalId) {
      setFormData({ ...EMPTY_FORM })
      setFormImageFile(null)
      setFormImagePreview(null)
      return
    }
    const g = globalLib.find(x => x.id === globalId)
    if (!g) return
    setFormData({
      name_he:        g.name_he,
      name_en:        g.name_en ?? '',
      category:       g.category ?? CATEGORIES[0],
      video_url:      g.video_url ?? '',
      default_sets:   g.default_sets,
      default_reps:   g.default_reps,
      default_weight: g.default_weight,
      is_bilateral:   g.is_bilateral,
      notes:          g.notes ?? '',
      image_url:      g.image_url,
      sort_order:     g.sort_order ?? 999,
    })
    setFormImageFile(null)
    setFormImagePreview(g.image_url)
  }

  // IDs already in user's library (to gray them out in picker)
  const ownedGlobalIds = new Set(
    exercises.map(e => e.global_exercise_id).filter(Boolean) as string[]
  )

  // ── Form: save ─────────────────────────────────────────────
  async function saveForm() {
    if (!formData || !formData.name_he.trim()) return
    setSaving(true)

    let imageUrl = formData.image_url

    if (editingId === null) {
      // CREATE flow
      if (selectedGlobalId) {
        // From global library: insert into exercises_user only
        const { data: userData } = await supabase
          .from('exercises_user')
          .insert({
            user_id:            userId,
            global_exercise_id: selectedGlobalId,
            name_he:            formData.name_he.trim(),
            name_en:            formData.name_en.trim() || null,
            image_url:          imageUrl,
            video_url:          formData.video_url.trim() || null,
            default_sets:       formData.default_sets,
            default_reps:       formData.default_reps,
            default_weight:     formData.default_weight,
            is_bilateral:       formData.is_bilateral,
            double_weight:      formData.double_weight,
            notes:              formData.notes.trim() || null,
            category:           formData.category,
            sort_order:         formData.sort_order,
            is_active:          true,
          })
          .select()
          .single()

        if (userData)
          setExercises(prev => sortByOrder([...prev, userData as ExerciseUser]))

      } else {
        // Brand-new exercise: insert global then user
        const { data: globalData, error: globalError } = await supabase
          .from('exercises_global')
          .insert({
            name_he:        formData.name_he.trim(),
            name_en:        formData.name_en.trim() || null,
            image_url:      null,
            video_url:      formData.video_url.trim() || null,
            default_sets:   formData.default_sets,
            default_reps:   formData.default_reps,
            default_weight: formData.default_weight,
            is_bilateral:   formData.is_bilateral,
            double_weight:  formData.double_weight,
            notes:          formData.notes.trim() || null,
            category:       formData.category,
            sort_order:     formData.sort_order,
          })
          .select()
          .single()

        if (globalError || !globalData) {
          console.error('Global insert error:', globalError)
          setSaving(false)
          return
        }

        if (formImageFile) {
          imageUrl = await uploadImage(globalData.id, formImageFile)
          if (imageUrl)
            await supabase.from('exercises_global').update({ image_url: imageUrl }).eq('id', globalData.id)
        }

        const { data: userData } = await supabase
          .from('exercises_user')
          .insert({
            user_id:            userId,
            global_exercise_id: globalData.id,
            name_he:            formData.name_he.trim(),
            name_en:            formData.name_en.trim() || null,
            image_url:          imageUrl,
            video_url:          formData.video_url.trim() || null,
            default_sets:       formData.default_sets,
            default_reps:       formData.default_reps,
            default_weight:     formData.default_weight,
            is_bilateral:       formData.is_bilateral,
            double_weight:      formData.double_weight,
            notes:              formData.notes.trim() || null,
            category:           formData.category,
            sort_order:         formData.sort_order,
            is_active:          true,
          })
          .select()
          .single()

        if (userData)
          setExercises(prev => sortByOrder([...prev, userData as ExerciseUser]))
      }

    } else {
      // EDIT: update exercises_user only
      if (formImageFile) imageUrl = await uploadImage(editingId, formImageFile)

      const update = {
        name_he:        formData.name_he.trim(),
        name_en:        formData.name_en.trim() || null,
        image_url:      imageUrl,
        video_url:      formData.video_url.trim() || null,
        default_sets:   formData.default_sets,
        default_reps:   formData.default_reps,
        default_weight: formData.default_weight,
        is_bilateral:   formData.is_bilateral,
        double_weight:  formData.double_weight,
        notes:          formData.notes.trim() || null,
        category:       formData.category,
        sort_order:     formData.sort_order,
      }

      await supabase.from('exercises_user').update(update).eq('id', editingId)
      setExercises(prev =>
        sortByOrder(prev.map(e => e.id === editingId ? { ...e, ...update } : e))
      )
    }

    setSaving(false)
    if (editingId) setScrollToId(editingId)
    setFormData(null)
    setEditingId(null)
    setSelectedGlobalId(null)
  }

  // ── Drag and drop ─────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = exercises.findIndex(e => e.id === active.id)
    const newIndex = exercises.findIndex(e => e.id === over.id)
    const reordered = arrayMove(exercises, oldIndex, newIndex).map((e, i) => ({ ...e, sort_order: i + 1 }))
    setExercises(reordered)
    // Batch update DB
    await Promise.all(
      reordered.map(e => supabase.from('exercises_user').update({ sort_order: e.sort_order }).eq('id', e.id))
    )
  }

  // ── Render: loading ────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">טוען...</p>
      </div>
    )
  }

  // ── Render: form ───────────────────────────────────────────
  if (formData) {
    const isNew = editingId === null
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
          <button onClick={() => { if (editingId) setScrollToId(editingId); setFormData(null) }} className="text-gray-500 text-sm font-medium">ביטול</button>
          <h1 className="text-gray-800 font-bold text-lg">
            {isNew ? 'תרגיל חדש' : 'עריכת תרגיל'}
          </h1>
          <button
            onClick={saveForm}
            disabled={saving || !formData.name_he.trim()}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
          >
            {saving ? '...' : 'שמור'}
          </button>
        </div>

        <div className="p-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">

            {/* Global library picker — only on new exercise */}
            {isNew && (
              <Field label="בחר מהספרייה הכללית">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className={inputCls + ' text-right flex items-center justify-between'}
                >
                  <span className={selectedGlobalId ? 'text-gray-800' : 'text-gray-400'}>
                    {selectedGlobalId
                      ? globalLib.find(g => g.id === selectedGlobalId)?.name_he
                      : '— תרגיל חדש מאפס —'}
                  </span>
                  <span className="text-gray-400 text-xs mr-1">▼</span>
                </button>
                {selectedGlobalId && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    הפרטים הועתקו — ניתן לערוך לפני השמירה
                  </p>
                )}
              </Field>
            )}

            {/* Picker modal */}
            {pickerOpen && (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
                onClick={() => setPickerOpen(false)}
              >
                <div
                  className="w-full max-w-lg bg-gray-50 rounded-t-3xl shadow-2xl flex flex-col"
                  style={{ maxHeight: '80vh' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-white rounded-t-3xl border-b border-gray-200">
                    <button onClick={() => setPickerOpen(false)} className="text-gray-400 text-sm">ביטול</button>
                    <span className="text-gray-800 font-bold text-base">בחר תרגיל</span>
                    <button
                      onClick={() => { handleGlobalPick(''); setPickerOpen(false) }}
                      className="text-blue-500 text-sm"
                    >
                      מאפס
                    </button>
                  </div>

                  {/* List */}
                  <div className="overflow-y-auto flex-1 pb-6">
                    {CATEGORIES.map(cat => {
                      const inCat = globalLib
                        .filter(g => g.category === cat)
                        .sort((a, b) => a.name_he.localeCompare(b.name_he, 'he'))
                      if (inCat.length === 0) return null
                      const colors: Record<string, string> = {
                        'פלג גוף תחתון': 'bg-blue-500',
                        'גב וכתפיים':    'bg-violet-500',
                        'חזה וזרועות':   'bg-orange-500',
                        'בטן וליבה':     'bg-teal-500',
                      }
                      return (
                        <div key={cat}>
                          <div className={`${colors[cat] ?? 'bg-gray-500'} px-4 py-2`}>
                            <span className="text-white font-bold text-sm">{cat}</span>
                          </div>
                          {inCat.map(g => {
                            const owned = ownedGlobalIds.has(g.id)
                            const selected = selectedGlobalId === g.id
                            return (
                              <button
                                key={g.id}
                                type="button"
                                disabled={owned}
                                onClick={() => { handleGlobalPick(g.id); setPickerOpen(false) }}
                                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 text-right
                                  ${selected ? 'bg-blue-50' : 'bg-white'}
                                  ${owned ? 'opacity-40' : 'active:bg-gray-50'}`}
                              >
                                {g.image_url
                                  ? <img src={g.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                  : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg shrink-0">📷</div>
                                }
                                <span className="flex-1 text-gray-800 text-sm font-medium">{g.name_he}</span>
                                {owned && <span className="text-gray-400 text-xs">✓ קיים</span>}
                                {selected && !owned && <span className="text-blue-500 text-base">✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Divider when a global was picked */}
            {isNew && selectedGlobalId && (
              <div className="border-t border-gray-100" />
            )}

            <Field label="שם בעברית *">
              <input value={formData.name_he}
                onChange={e => setFormData({ ...formData, name_he: e.target.value })}
                className={inputCls} placeholder="שם התרגיל בעברית" />
            </Field>

            <Field label="שם באנגלית">
              <input value={formData.name_en}
                onChange={e => setFormData({ ...formData, name_en: e.target.value })}
                className={inputCls} placeholder="Exercise name in English" />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="קטגוריה">
                <select value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className={inputCls}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="סדר תצוגה (1–999)">
                <input type="number" min={1} max={999} value={formData.sort_order}
                  onChange={e => setFormData({ ...formData, sort_order: +e.target.value })}
                  className={inputCls} />
              </Field>
            </div>

            <Field label="קישור סרטון (ExRx)">
              <input value={formData.video_url}
                onChange={e => setFormData({ ...formData, video_url: e.target.value })}
                className={inputCls} placeholder="https://exrx.net/..." />
            </Field>

            <Field label="תמונה">
              <div className="flex items-center gap-3">
                {formImagePreview
                  ? <img src={formImagePreview} alt="" className="w-24 h-24 rounded-lg object-cover border border-gray-200 shrink-0" />
                  : <div className="w-24 h-24 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-2xl shrink-0">📷</div>
                }
                <button type="button" onClick={() => formFileInputRef.current?.click()}
                  className="flex-1 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-sm font-medium">
                  {formImagePreview ? 'החלף תמונה' : 'העלה תמונה'}
                </button>
                <input ref={formFileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setFormImageFile(file)
                    setFormImagePreview(URL.createObjectURL(file))
                  }} />
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field label="סטים">
                <input type="number" min={1} value={formData.default_sets}
                  onChange={e => setFormData({ ...formData, default_sets: +e.target.value })}
                  className={inputCls} />
              </Field>
              <Field label="חזרות">
                <input type="number" min={1} value={formData.default_reps}
                  onChange={e => setFormData({ ...formData, default_reps: +e.target.value })}
                  className={inputCls} />
              </Field>
              <Field label='משקל ק"ג'>
                <input type="number" min={0} step={1} value={formData.default_weight}
                  onChange={e => setFormData({ ...formData, default_weight: +e.target.value })}
                  className={inputCls} />
              </Field>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.is_bilateral}
                onChange={e => setFormData({ ...formData, is_bilateral: e.target.checked })}
                className="w-4 h-4" />
              <span className="text-gray-700 text-sm">תרגיל דו-צדדי (מכפיל חזרות)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.double_weight}
                onChange={e => setFormData({ ...formData, double_weight: e.target.checked })}
                className="w-4 h-4" />
              <span className="text-gray-700 text-sm">כפל משקל (משקל בשתי ידיים)</span>
            </label>

            <Field label="הערות">
              <textarea value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                className={inputCls + ' h-16 resize-none'} />
            </Field>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: list ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">ניהול תרגילים</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
          <button onClick={openNew}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
            + חדש
          </button>
        </div>
      </div>

      <p className="text-gray-400 text-xs text-center mt-3 mb-1">
        ☰ גרור לסדר · ✏️ עריכה · 📷 תמונה · 👁 הסתרה
      </p>

      <input ref={listFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleListFileChange} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={exercises.map(e => e.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1 p-3">
            {exercises.map(ex => (
              <SortableExerciseRow
                key={ex.id}
                exercise={ex}
                uploadingId={uploadingId}
                onImageClick={handleImageClick}
                onEdit={openEdit}
                onDelete={deleteExercise}
                onToggle={toggleActive}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'הסתרה / הצגה', body: '👁 מסתיר תרגיל ממסך הבית מבלי למחוק אותו. לחץ שוב להחזרה.' },
          { title: 'שינוי סדר', body: 'לחץ לחיצה ממושכת על ☰ וגרור לסדר הרצוי.' },
          { title: 'תרגיל חדש', body: 'לחץ "+ חדש". ניתן לבחור מהספרייה הכללית או להוסיף תרגיל מאפס.' },
          { title: 'עריכה ותמונה', body: '✏️ לעריכת כל פרטי התרגיל. לחץ על תמונה/📷 להחלפה מהירה.' },
          { title: 'מחיקה', body: '🗑 מוחק לצמיתות מהרשימה האישית שלך.' },
        ]} />
      )}
    </div>
  )
}

function SortableExerciseRow({ exercise: ex, uploadingId, onImageClick, onEdit, onDelete, onToggle }: {
  exercise: ExerciseUser
  uploadingId: string | null
  onImageClick: (id: string) => void
  onEdit: (ex: ExerciseUser) => void
  onDelete: (id: string) => void
  onToggle: (id: string, current: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} data-id={ex.id}
      className={`bg-white rounded-xl px-3 py-3 flex items-center gap-2 shadow-sm ${!ex.is_active ? 'opacity-40' : ''}`}>

      {/* Drag handle */}
      <button
        {...attributes} {...listeners}
        className="text-gray-300 hover:text-gray-500 text-xl shrink-0 cursor-grab active:cursor-grabbing touch-none px-1"
        title="גרור לשינוי סדר"
      >
        ☰
      </button>

      {/* Thumbnail */}
      <button onClick={() => onImageClick(ex.id)} disabled={uploadingId === ex.id}
        className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0"
        title="העלה תמונה">
        {uploadingId === ex.id
          ? <span className="text-xs text-gray-400">...</span>
          : ex.image_url
            ? <><img src={ex.image_url} alt="" className="w-full h-full object-cover" />
                <span className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 text-white text-xs">📷</span></>
            : <span className="text-lg">📷</span>
        }
      </button>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-gray-800 font-medium text-sm truncate">{ex.name_he}</p>
        <p className="text-gray-400 text-xs">{ex.category}{ex.is_bilateral ? ' · דו-צדדי' : ''}{ex.double_weight ? ' · כפל משקל' : ''}</p>
      </div>

      {/* Edit */}
      <button onClick={() => onEdit(ex)} className="text-blue-400 hover:text-blue-600 text-lg shrink-0" title="עריכה">✏️</button>

      {/* Delete */}
      <button onClick={() => onDelete(ex.id)} className="text-red-400 hover:text-red-600 text-lg shrink-0" title="מחק">🗑</button>

      {/* Toggle */}
      <button onClick={() => onToggle(ex.id, ex.is_active)}
        className={`text-xl shrink-0 ${ex.is_active ? 'text-gray-600' : 'text-gray-300'}`}>
        {ex.is_active ? '👁' : '🙈'}
      </button>
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
