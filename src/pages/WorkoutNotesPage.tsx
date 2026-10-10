import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  /** null = every user (admin view) */
  userId: string | null
  onClose: () => void
}

interface NoteRow {
  key:      string
  kind:     'exercise' | 'general'
  /** general notes only - what edit and delete act on */
  id?:      string
  date:     string      // YYYY-MM-DD
  userId:   string
  who:      string
  exercise: string
  note:     string
}

/** A note being written or edited. id null = a new one. */
interface Draft { id: string | null; date: string; text: string }

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

function dayName(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { weekday: 'short' })
}

export default function WorkoutNotesPage({ userId, onClose }: Props) {
  const [rows,     setRows]     = useState<NoteRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [who,      setWho]      = useState<string>('')   // '' = all users
  const [draft,    setDraft]    = useState<Draft | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const adminView = userId === null

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)

    let q = supabase.from('workout_logs')
      .select('user_id, exercise_id, logged_at, notes')
      .not('notes', 'is', null)
      .order('logged_at', { ascending: false })
    if (userId) q = q.eq('user_id', userId)

    let gq = supabase.from('general_notes')
      .select('id, user_id, note_date, text')
      .order('note_date', { ascending: false })
    if (userId) gq = gq.eq('user_id', userId)

    const [{ data: logs }, { data: exRows }, { data: profiles }, { data: general }] = await Promise.all([
      q,
      supabase.from('exercises_user').select('id, name_he'),
      supabase.from('profiles').select('id, nickname, email'),
      gq,
    ])

    const exName = new Map((exRows ?? []).map(e => [e.id, e.name_he]))
    const person = new Map((profiles ?? []).map(p => [p.id, p.nickname || p.email]))

    // The note is written onto every set row of a save, so collapse back to one
    // entry per user + day + exercise.
    const seen = new Set<string>()
    const out: NoteRow[] = []
    for (const l of logs ?? []) {
      const text = (l.notes ?? '').trim()
      if (!text) continue
      const date = l.logged_at.slice(0, 10)
      const key = `${l.user_id}|${date}|${l.exercise_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key, date,
        kind:     'exercise',
        userId:   l.user_id,
        who:      person.get(l.user_id) ?? '—',
        exercise: exName.get(l.exercise_id) ?? '—',
        note:     text,
      })
    }

    // General notes: one row each, never collapsed - two on the same day are
    // two notes.
    for (const g of general ?? []) {
      out.push({
        key:      `g|${g.id}`,
        kind:     'general',
        id:       g.id,
        date:     g.note_date,
        userId:   g.user_id,
        who:      person.get(g.user_id) ?? '—',
        exercise: '',
        note:     g.text,
      })
    }

    // Newest first; on the same day a general note comes before exercise notes,
    // since it is usually the context for them.
    out.sort((a, b) =>
      b.date.localeCompare(a.date) ||
      (a.kind === b.kind ? 0 : a.kind === 'general' ? -1 : 1))

    setRows(out)
    setLoading(false)
  }

  async function saveDraft() {
    if (!draft || !userId) return
    const text = draft.text.trim()
    if (!text) { setError('יש לכתוב הערה'); return }
    setSaving(true)
    setError(null)

    const { error: e } = draft.id
      ? await supabase.from('general_notes')
          .update({ note_date: draft.date, text, updated_at: new Date().toISOString() })
          .eq('id', draft.id)
      : await supabase.from('general_notes')
          .insert({ user_id: userId, note_date: draft.date, text })

    setSaving(false)
    if (e) { setError('שמירת ההערה נכשלה: ' + e.message); return }
    setDraft(null)
    await load()
  }

  async function remove(r: NoteRow) {
    if (!r.id) return
    if (!confirm('למחוק את ההערה?')) return
    const { error: e } = await supabase.from('general_notes').delete().eq('id', r.id)
    if (e) { setError('מחיקת ההערה נכשלה: ' + e.message); return }
    await load()
  }

  const people = [...new Map(rows.map(r => [r.userId, r.who])).entries()]
  const shown = who ? rows.filter(r => r.userId === who) : rows

  return (
    <div className="h-dvh bg-gray-100 flex flex-col" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">הערות אימון</h1>
        <button onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      {/* Writing a note is for the signed-in user only; the coach view reads. */}
      {!adminView && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 shrink-0">
          <button
            onClick={() => { setError(null); setDraft({ id: null, date: toISODate(new Date()), text: '' }) }}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold rounded-xl py-2 text-sm"
          >
            ＋ הערה כללית
          </button>
        </div>
      )}

      {error && !draft && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 shrink-0">
          <p className="text-amber-800 text-xs">{error}</p>
        </div>
      )}

      {adminView && people.length > 1 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 shrink-0">
          <select
            value={who}
            onChange={e => setWho(e.target.value)}
            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 text-sm outline-none"
          >
            <option value="">כל המשתמשים ({rows.length})</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">טוען...</p></div>
      ) : shown.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-gray-400 text-sm text-center leading-relaxed">
            אין עדיין הערות.<br />
            בעת רישום תרגיל אפשר לכתוב איך היה, ובכפתור "הערה כללית" אפשר לכתוב משהו שלא קשור לאימון.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="bg-gray-50 border-b border-l border-gray-200 px-2 py-2 text-gray-500 text-xs font-bold"
                  style={{ width: 62, minWidth: 62 }}>תאריך</th>
                {adminView && (
                  <th className="bg-gray-50 border-b border-l border-gray-200 px-2 py-2 text-gray-500 text-xs font-bold"
                    style={{ width: 74, minWidth: 74 }}>משתמש</th>
                )}
                <th className="bg-gray-50 border-b border-l border-gray-200 px-2 py-2 text-gray-500 text-xs font-bold"
                  style={{ width: 92, minWidth: 92 }}>תרגיל</th>
                <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-gray-500 text-xs font-bold text-right">הערה</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.key}>
                  <td className="bg-white border-b border-l border-gray-200 px-2 py-2 align-top"
                    style={{ width: 62, minWidth: 62 }}>
                    <span className="block text-gray-800 text-xs font-bold">{shortDate(r.date)}</span>
                    <span className="block text-gray-400 text-[10px]">{dayName(r.date)}</span>
                  </td>
                  {adminView && (
                    <td className="bg-white border-b border-l border-gray-200 px-2 py-2 align-top text-gray-600 text-xs"
                      style={{ width: 74, minWidth: 74 }}>{r.who}</td>
                  )}
                  <td className="bg-white border-b border-l border-gray-200 px-2 py-2 align-top text-gray-800 text-xs font-medium"
                    style={{ width: 92, minWidth: 92 }}>
                    {r.kind === 'general' ? (
                      <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold rounded px-1.5 py-0.5">
                        כללית
                      </span>
                    ) : r.exercise}
                  </td>
                  <td className="bg-white border-b border-gray-200 px-2 py-2 align-top text-gray-700 text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {r.note}
                    {/* Only the author's own general notes can be changed; the
                        notes on an exercise are edited by reopening that exercise. */}
                    {r.kind === 'general' && !adminView && (
                      <span className="flex gap-4 mt-1.5">
                        <button
                          onClick={() => { setError(null); setDraft({ id: r.id ?? null, date: r.date, text: r.note }) }}
                          className="text-blue-600 text-[11px] font-medium"
                        >✏️ עריכה</button>
                        <button
                          onClick={() => remove(r)}
                          className="text-red-600 text-[11px] font-medium"
                        >🗑 מחיקה</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => !saving && setDraft(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-gray-800 font-bold text-base text-center">
              {draft.id ? 'עריכת הערה כללית' : 'הערה כללית'}
            </p>

            <label className="block">
              <span className="text-gray-400 text-[11px] block mb-0.5">תאריך</span>
              <input
                type="date"
                value={draft.date}
                onChange={e => setDraft({ ...draft, date: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>

            <label className="block">
              <span className="text-gray-400 text-[11px] block mb-0.5">הערה</span>
              <textarea
                value={draft.text}
                onChange={e => setDraft({ ...draft, text: e.target.value })}
                rows={5}
                autoFocus
                placeholder="משהו שחשוב לזכור — בדיקה רפואית, מחלה, שבוע עמוס…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </label>

            {error && <p className="text-red-600 text-xs">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={saveDraft}
                disabled={saving || !draft.text.trim() || !draft.date}
                className="flex-[1.4] bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-sm"
              >
                {saving ? '...' : 'שמור'}
              </button>
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl py-2.5 text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מה הדוח מראה', body: 'כל ההערות שלך — אלה שנכתבו בעת רישום תרגילים, וגם הערות כלליות — מהחדש לישן.' },
          { title: 'הערה כללית', body: 'הכפתור "הערה כללית" מוסיף הערה שלא קשורה לאימון או לתרגיל — בדיקה רפואית, מחלה, שבוע עמוס. בוחרים תאריך וכותבים. ההערה מסומנת "כללית" בעמודת התרגיל.' },
          { title: 'עריכה ומחיקה', body: 'מתחת לכל הערה כללית יש "עריכה" ו"מחיקה". אפשר לשנות גם את התאריך. הערה שנכתבה בעת רישום תרגיל נערכת בפתיחה מחדש של אותו תרגיל.' },
          { title: 'מי רואה', body: 'ההערות הכלליות שלך נראות רק לך ולמאמן. המאמן יכול לקרוא אותן אך לא לשנות או למחוק.' },
          { title: 'איך כותבים הערה על תרגיל', body: 'במסך רישום התרגיל, מתחת לסטים, יש שדה "איך היה התרגיל?". הכתיבה בו היא רשות, והיא נשמרת פעם אחת לתרגיל ליום.' },
          ...(adminView ? [
            { title: 'תצוגת מאמן', body: 'כאן מוצגות ההערות של כל המשתמשים, כולל הכלליות. התפריט העליון מאפשר לסנן למשתמש מסוים. תצוגה לקריאה בלבד.' },
          ] : []),
        ]} />
      )}
    </div>
  )
}
