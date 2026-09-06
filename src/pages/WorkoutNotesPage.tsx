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
  date:     string      // YYYY-MM-DD
  userId:   string
  who:      string
  exercise: string
  note:     string
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
  const adminView = userId === null

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)

    let q = supabase.from('workout_logs')
      .select('user_id, exercise_id, logged_at, notes')
      .not('notes', 'is', null)
      .order('logged_at', { ascending: false })
    if (userId) q = q.eq('user_id', userId)

    const [{ data: logs }, { data: exRows }, { data: profiles }] = await Promise.all([
      q,
      supabase.from('exercises_user').select('id, name_he'),
      supabase.from('profiles').select('id, nickname, email'),
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
        userId:   l.user_id,
        who:      person.get(l.user_id) ?? '—',
        exercise: exName.get(l.exercise_id) ?? '—',
        note:     text,
      })
    }

    setRows(out)
    setLoading(false)
  }

  const people = [...new Map(rows.map(r => [r.userId, r.who])).entries()]
  const shown = who ? rows.filter(r => r.userId === who) : rows

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">הערות אימון</h1>
        <button onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

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
            בעת רישום תרגיל אפשר לכתוב איך היה, וההערה תופיע כאן.
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
                    style={{ width: 92, minWidth: 92 }}>{r.exercise}</td>
                  <td className="bg-white border-b border-gray-200 px-2 py-2 align-top text-gray-700 text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מה הדוח מראה', body: 'כל ההערות שנכתבו בעת רישום תרגילים — תאריך, תרגיל והטקסט שנכתב, מהחדש לישן.' },
          { title: 'איך כותבים הערה', body: 'במסך רישום התרגיל, מתחת לסטים, יש שדה "איך היה התרגיל?". הכתיבה בו היא רשות.' },
          { title: 'הערה אחת לתרגיל ליום', body: 'ההערה נשמרת לכל הסטים של אותו תרגיל באותו יום, ומוצגת כאן פעם אחת.' },
          { title: 'עריכה', body: 'פתיחה מחדש של רישום קיים מציגה את ההערה הקודמת וניתן לשנות אותה.' },
          ...(adminView ? [
            { title: 'תצוגת מאמן', body: 'כאן מוצגות ההערות של כל המשתמשים. התפריט העליון מאפשר לסנן למשתמש מסוים.' },
          ] : []),
        ]} />
      )}
    </div>
  )
}
