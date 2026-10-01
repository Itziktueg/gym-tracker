import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

/** Band colour per body part, matching the other reports, plus the chip fill
 *  used for primary muscles so the body part is readable from the chip alone. */
const CATEGORY_STYLE: Record<string, { band: string; chip: string }> = {
  'פלג גוף תחתון': { band: 'bg-blue-500',   chip: 'bg-blue-100 text-blue-800 border-blue-200' },
  'גב וכתפיים':    { band: 'bg-violet-500', chip: 'bg-violet-100 text-violet-800 border-violet-200' },
  'חזה וזרועות':   { band: 'bg-orange-500', chip: 'bg-orange-100 text-orange-800 border-orange-200' },
  'בטן וליבה':     { band: 'bg-teal-500',   chip: 'bg-teal-100 text-teal-800 border-teal-200' },
}
const FALLBACK = { band: 'bg-gray-500', chip: 'bg-gray-200 text-gray-800 border-gray-300' }

interface Row {
  id: string
  name: string
  category: string
  primary: string[]
  secondary: string[]
}

export default function ExerciseMusclesPage({ userId, onClose }: Props) {
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: exData }, { data: links }, { data: muscles }] = await Promise.all([
        supabase
          .from('exercises_user')
          .select('id, name_he, category')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase.from('exercise_muscle_groups_user').select('exercise_id, muscle_group_id, role'),
        supabase.from('muscle_groups').select('id, name_he'),
      ])

      if (!exData) { setLoading(false); return }

      const muscleName = new Map((muscles ?? []).map(m => [m.id, m.name_he as string]))
      const byExercise: Record<string, { primary: string[]; secondary: string[] }> = {}

      for (const l of links ?? []) {
        const name = muscleName.get(l.muscle_group_id)
        if (!name) continue
        const slot = (byExercise[l.exercise_id] ??= { primary: [], secondary: [] })
        if (l.role === 'primary') slot.primary.push(name)
        else slot.secondary.push(name)
      }

      const out: Row[] = exData
        .map(e => ({
          id: e.id,
          name: e.name_he,
          category: e.category ?? '',
          primary: byExercise[e.id]?.primary ?? [],
          secondary: byExercise[e.id]?.secondary ?? [],
        }))
        .sort((a, b) => {
          const ca = CATEGORY_ORDER.indexOf(a.category)
          const cb = CATEGORY_ORDER.indexOf(b.category)
          // Unknown categories sort last rather than first
          const ia = ca === -1 ? CATEGORY_ORDER.length : ca
          const ib = cb === -1 ? CATEGORY_ORDER.length : cb
          if (ia !== ib) return ia - ib
          return a.name.localeCompare(b.name, 'he')
        })

      setRows(out)
      setLoading(false)
    }
    load()
  }, [userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">טוען...</p>
      </div>
    )
  }

  const missing = rows.filter(r => r.primary.length === 0 && r.secondary.length === 0).length

  let lastCategory = ''

  return (
    <div className="h-dvh bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">שרירים לפי תרגיל</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">אין תרגילים פעילים.</p>
        )}

        {rows.map(r => {
          const showHeader = r.category !== lastCategory
          if (showHeader) lastCategory = r.category
          const style = CATEGORY_STYLE[r.category] ?? FALLBACK
          const none = r.primary.length === 0 && r.secondary.length === 0

          return (
            <div key={r.id}>
              {showHeader && (
                <div className={`${style.band} text-white text-xs font-bold px-4 py-1.5 sticky top-0 z-10`}>
                  {r.category || 'ללא קטגוריה'}
                </div>
              )}

              <div className="bg-white border-b border-gray-200 px-4 py-2.5">
                <p className="text-gray-800 text-sm font-semibold mb-1.5">{r.name}</p>

                {none ? (
                  // Surfaced rather than hidden: an exercise with no muscles is
                  // invisible in נפח לפי שריר, so it is worth being able to spot.
                  <p className="text-amber-700 text-xs">לא הוגדרו שרירים</p>
                ) : (
                  <div className="flex flex-wrap gap-1 items-center">
                    {/* Primary first and filled; secondary after and outlined,
                        so the distinction survives even without reading. */}
                    {r.primary.map(m => (
                      <span key={m} className={`${style.chip} border text-[11px] font-bold rounded-lg px-2 py-0.5`}>
                        {m}
                      </span>
                    ))}
                    {r.secondary.map(m => (
                      <span key={m} className="bg-white border border-gray-200 text-gray-500 text-[11px] rounded-lg px-2 py-0.5">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-2 flex gap-4 justify-center items-center shrink-0">
        <span className="text-xs text-gray-400 flex items-center gap-1.5">
          <span className="bg-gray-200 border border-gray-300 text-gray-800 text-[10px] font-bold rounded px-1.5">שריר</span>
          ראשי
        </span>
        <span className="text-xs text-gray-400 flex items-center gap-1.5">
          <span className="bg-white border border-gray-200 text-gray-500 text-[10px] rounded px-1.5">שריר</span>
          משני
        </span>
        {missing > 0 && (
          <span className="text-xs text-amber-700">{missing} ללא שיוך</span>
        )}
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מה הדוח מראה', body: 'כל תרגיל פעיל בספרייה שלך, מקובץ לפי אזור הגוף, עם השרירים שהוא מפעיל בפועל.' },
          { title: 'ראשי מול משני', body: 'שריר ראשי מוצג בתגית צבעונית ומודגשת, שריר משני בתגית לבנה ובהירה. הראשיים תמיד מופיעים ראשונים. בדוח "נפח לפי שריר" שריר ראשי נספר כסט מלא ושריר משני כחצי סט.' },
          { title: 'אזור גוף מול שריר', body: 'אזור הגוף הוא הקטגוריה של התרגיל — ארבע קבוצות כלליות. השרירים הם הפירוט האמיתי, 19 שרירים, וזה מה שמאפשר לדעת שדדליפט מפעיל גם את זוקפי הגב ולא רק רגליים.' },
          { title: 'תרגיל ללא שיוך', body: 'תרגיל שלא הוגדרו לו שרירים מסומן כך במפורש ולא מושמט מהרשימה. תרגיל כזה אינו נספר כלל בדוח "נפח לפי שריר", אז כדאי לדעת עליו.' },
          { title: 'דוח לקריאה בלבד', body: 'אי אפשר לערוך מכאן קטגוריה או שיוך שרירים.' },
        ]} />
      )}
    </div>
  )
}
