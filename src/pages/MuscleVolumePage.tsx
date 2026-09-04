import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

/** Display grouping over the 19 real muscles. Sums of the muscles beneath it,
 *  never a single tag on the exercise. */
const GROUPS: { name: string; dot: string; muscles: string[] }[] = [
  { name: 'רגליים', dot: 'bg-blue-500', muscles:
    ['ארבע-ראשי', 'המסטרינג', 'ישבן', 'מקרבי הירך', 'מרחיקי הירך', 'שוקיים'] },
  { name: 'גב', dot: 'bg-violet-500', muscles:
    ['רחב גבי', 'טרפז', 'מעוין', 'זוקפי הגב'] },
  { name: 'חזה', dot: 'bg-orange-500', muscles:
    ['חזה גדול', 'חזה קטן'] },
  { name: 'כתפיים', dot: 'bg-cyan-500', muscles:
    ['כתף קדמית', 'כתף צידית', 'כתף אחורית'] },
  { name: 'ידיים', dot: 'bg-rose-500', muscles:
    ['דו-ראשי זרועי', 'תלת-ראשי זרועי'] },
  { name: 'ליבה', dot: 'bg-teal-500', muscles:
    ['ישר בטני', 'אלכסונים'] },
]

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sundayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - dt.getDay())
  return toISODate(dt)
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

function weekNumber(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const jan1 = new Date(y, 0, 1)
  return Math.floor((new Date(y, m - 1, d).getTime() - jan1.getTime()) / (7 * 86400000)) + 1
}

function fmt(n: number) {
  if (n === 0) return '—'
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

/** Bands are general guidance from the training literature, not personal targets */
function volClass(v: number) {
  if (v === 0)  return 'text-gray-300'
  if (v >= 20)  return 'text-violet-700 font-bold'   // at/above MAV top
  if (v >= 12)  return 'text-green-700 font-bold'    // optimal range
  if (v >= 10)  return 'text-blue-700 font-semibold' // around MEV
  return 'text-amber-700'                            // below MEV
}

const W = { name: 96, week: 58 }

export default function MuscleVolumePage({ userId, onClose }: Props) {
  const [weeks,    setWeeks]    = useState<string[]>([])
  const [vol,      setVol]      = useState<Record<string, Record<string, number>>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading,  setLoading]  = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)

    // Page through: a silent 1000-row cut would understate every number here
    let logs: { exercise_id: string; logged_at: string; sets_completed: number }[] = []
    let from = 0
    for (;;) {
      const { data } = await supabase
        .from('workout_logs')
        .select('exercise_id, logged_at, sets_completed')
        .eq('user_id', userId)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      logs = logs.concat(data)
      if (data.length < 1000) break
      from += 1000
    }

    const [{ data: mapRows }, { data: muscles }] = await Promise.all([
      supabase.from('exercise_muscle_groups_user').select('exercise_id, muscle_group_id, role'),
      supabase.from('muscle_groups').select('id, name_he'),
    ])

    const muscleName = new Map((muscles ?? []).map(m => [m.id, m.name_he]))

    // exercise -> [{ muscle, weight }]
    const byExercise: Record<string, { muscle: string; w: number }[]> = {}
    for (const r of mapRows ?? []) {
      const name = muscleName.get(r.muscle_group_id)
      if (!name) continue
      ;(byExercise[r.exercise_id] ??= []).push({
        muscle: name,
        w: r.role === 'primary' ? 1 : 0.5,   // secondary counts half
      })
    }

    const acc: Record<string, Record<string, number>> = {}
    const weekSet = new Set<string>()

    for (const l of logs) {
      const links = byExercise[l.exercise_id]
      if (!links) continue          // unmapped, e.g. cardio — deliberately skipped
      const wk = sundayOf(l.logged_at.slice(0, 10))
      weekSet.add(wk)
      const sets = l.sets_completed ?? 1
      for (const { muscle, w } of links) {
        acc[muscle] ??= {}
        acc[muscle][wk] = (acc[muscle][wk] ?? 0) + sets * w
      }
    }

    setVol(acc)
    setWeeks([...weekSet].sort().reverse())   // newest first
    setLoading(false)
  }

  const groupTotal = (g: typeof GROUPS[number], wk: string) =>
    g.muscles.reduce((s, m) => s + (vol[m]?.[wk] ?? 0), 0)

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" dir="rtl">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">נפח לפי שריר</h1>
        <button onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">טוען...</p></div>
      ) : weeks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-gray-400 text-sm text-center">אין נתונים להצגה</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="text-sm border-separate" style={{ borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky right-0 z-30 bg-gray-50 border-b border-l border-gray-200 px-2 py-2 text-gray-500 text-xs font-bold"
                  style={{ width: W.name, minWidth: W.name }}>שריר</th>
                {weeks.map(wk => (
                  <th key={wk} className="bg-gray-50 border-b border-l border-gray-200 px-1 py-2"
                    style={{ width: W.week, minWidth: W.week }}>
                    <span className="block text-gray-700 text-xs font-bold">{shortDate(wk)}</span>
                    <span className="block text-gray-400 text-[10px]">שבוע {weekNumber(wk)}</span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {GROUPS.map(g => {
                const open = expanded.has(g.name)
                return [
                  <tr key={g.name}>
                    <th onClick={() => toggle(g.name)}
                      className="sticky right-0 z-10 bg-white border-b border-l border-gray-200 px-2 py-2 text-right cursor-pointer"
                      style={{ width: W.name, minWidth: W.name }}>
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${g.dot}`} />
                        <span className="text-gray-800 text-xs font-bold flex-1">{g.name}</span>
                        <span className="text-gray-300 text-[10px]">{open ? '▲' : '▼'}</span>
                      </span>
                    </th>
                    {weeks.map(wk => {
                      const v = groupTotal(g, wk)
                      // Deliberately NOT colour-banded: the MEV/MAV thresholds
                      // describe one muscle, and a sum over six would read as
                      // "plenty" when each muscle is actually under-trained.
                      return (
                        <td key={wk} className={`bg-white border-b border-l border-gray-200 px-1 py-2 text-center text-xs tabular-nums font-bold ${v === 0 ? 'text-gray-300' : 'text-gray-700'}`}
                          style={{ width: W.week, minWidth: W.week }}>{fmt(v)}</td>
                      )
                    })}
                  </tr>,
                  ...(open ? g.muscles.map(m => (
                    <tr key={`${g.name}-${m}`}>
                      <th className="sticky right-0 z-10 bg-gray-50 border-b border-l border-gray-200 ps-6 pe-2 py-1.5 text-right"
                        style={{ width: W.name, minWidth: W.name }}>
                        <span className="text-gray-500 text-[11px] font-normal">{m}</span>
                      </th>
                      {weeks.map(wk => {
                        const v = vol[m]?.[wk] ?? 0
                        return (
                          <td key={wk} className={`bg-gray-50 border-b border-l border-gray-200 px-1 py-1.5 text-center text-[11px] tabular-nums ${volClass(v)}`}
                            style={{ width: W.week, minWidth: W.week }}>{fmt(v)}</td>
                        )
                      })}
                    </tr>
                  )) : []),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מה הדוח מראה', body: 'כמה סטים שבועיים בוצעו לכל שריר בפועל — לפי 19 קבוצות שריר אמיתיות, ולא לפי 4 אזורי גוף כלליים.' },
          { title: 'איך מחושב', body: 'כל סט נספר במלואו לשריר הראשי של התרגיל, וכחצי סט לכל שריר משני. כך דדליפט למשל מזוכה גם לזוקפי הגב ולא רק לרגליים.' },
          { title: 'קיבוץ', body: 'ברירת המחדל מציגה 6 קבוצות-על. לחיצה על שם קבוצה פותחת אותה לשרירים הבודדים שמרכיבים אותה.' },
          { title: 'צבעים ויעדים', body: 'הצבעים חלים רק על שרירים בודדים: כתום מתחת ל-10 סטים · כחול סביב 10 (מינימום אפקטיבי) · ירוק 12-20 (טווח מיטבי) · סגול מעל 20. אלה הערכות כלליות מהספרות המקצועית, לא יעדים אישיים.' },
          { title: 'שורות הקיבוץ', body: 'המספר בשורת קבוצת-על הוא סכום השרירים שמתחתיה ולכן אינו נצבע — 36 סטים ל"רגליים" הם כ-6 סטים לכל אחד מ-6 השרירים, כלומר מתחת למינימום ולא מעליו. פתח את הקבוצה כדי לראות את התמונה האמיתית.' },
          { title: 'תרגילי קרדיו', body: 'תרגילים ללא שיוך לשריר, כמו הליכון, אינם נכללים בדוח.' },
          { title: 'הבדל מדוחות העצימות', body: 'דוח זה סופר סטים (נפח), בעוד דוחות העצימות מחשבים חזרות × משקל. שתי מדידות שונות שמשלימות זו את זו.' },
        ]} />
      )}
    </div>
  )
}
