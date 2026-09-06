import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'
import type { Profile } from '../types/database'

interface Props {
  onClose: () => void   // back to admin daily density
}

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_DOT: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

const CATEGORY_TEXT: Record<string, string> = {
  'פלג גוף תחתון': 'text-blue-600',
  'גב וכתפיים':    'text-violet-600',
  'חזה וזרועות':   'text-orange-500',
  'בטן וליבה':     'text-teal-600',
}

interface UserBlock {
  userId: string
  nickname: string
  weeks: string[]
  pivot: Record<string, Record<string, number>>
  totals: Record<string, number>
}

function getSunday(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

function weekNumber(sundayStr: string): number {
  const d    = new Date(sundayStr)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  return Math.floor((d.getTime() - jan1.getTime()) / (7 * 86400000)) + 1
}

function formatSunday(sundayStr: string) {
  return new Date(sundayStr).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

const COL_WIDTH  = 72
const NAME_WIDTH = 140

export default function AdminWeeklyDensityPage({ onClose }: Props) {
  const [users,    setUsers]    = useState<Profile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [blocks,   setBlocks]   = useState<UserBlock[]>([])
  const [loading,  setLoading]  = useState(true)
  const [open,     setOpen]     = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('nickname')
      .then(({ data }) => {
        const profiles = (data ?? []).filter((u: Profile) => u.nickname)
        setUsers(profiles)
        setSelected(new Set(profiles.map((u: Profile) => u.id)))
      })
  }, [])

  useEffect(() => {
    if (users.length === 0) return
    load()
  }, [selected, users]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const ids = [...selected]
    if (ids.length === 0) { setBlocks([]); setLoading(false); return }

    const { data: logs } = await supabase
      .from('workout_logs')
      .select('exercise_id, logged_at, intensity, user_id')
      .in('user_id', ids)
      .order('logged_at')

    const { data: exData } = await supabase
      .from('exercises_user')
      .select('id, category, user_id')
      .in('user_id', ids)

    if (!logs || !exData) { setLoading(false); return }

    const newBlocks: UserBlock[] = []

    for (const userId of ids) {
      const user = users.find(u => u.id === userId)
      if (!user) continue

      const userLogs = logs.filter(l => l.user_id === userId)
      const userEx   = exData.filter(e => e.user_id === userId)

      const exCat: Record<string, string> = {}
      for (const ex of userEx) exCat[ex.id] = ex.category ?? ''

      const pivotMap: Record<string, Record<string, number>> = {}
      const weekSet = new Set<string>()

      for (const log of userLogs) {
        const week = getSunday(log.logged_at.slice(0, 10))
        const cat  = exCat[log.exercise_id] ?? ''
        if (!CATEGORY_ORDER.includes(cat)) continue
        weekSet.add(week)
        if (!pivotMap[cat]) pivotMap[cat] = {}
        pivotMap[cat][week] = (pivotMap[cat][week] ?? 0) + (log.intensity ?? 0)
      }

      // Newest first — most recent week visible without scrolling (RTL)
      const sortedWeeks = [...weekSet].sort().reverse()
      const totalsMap: Record<string, number> = {}
      for (const w of sortedWeeks)
        totalsMap[w] = CATEGORY_ORDER.reduce((s, cat) => s + (pivotMap[cat]?.[w] ?? 0), 0)

      newBlocks.push({
        userId,
        nickname: user.nickname ?? user.email,
        weeks: sortedWeeks,
        pivot: pivotMap,
        totals: totalsMap,
      })
    }

    setBlocks(newBlocks)
    setLoading(false)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleUser(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === users.length) setSelected(new Set())
    else setSelected(new Set(users.map(u => u.id)))
  }

  const allSelected = selected.size === users.length

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">עצימות שבועית — כל המשתמשים</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      {/* Filter */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 shrink-0" ref={dropRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 transition-colors"
        >
          <span>
            {allSelected ? 'כל המשתמשים' : selected.size === 0 ? 'בחר משתמשים' : `${selected.size} משתמשים נבחרו`}
          </span>
          <span className="text-gray-400">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-40 absolute">
            <button
              onClick={toggleAll}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm font-semibold text-gray-700 border-b border-gray-100"
            >
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${allSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                {allSelected && <span className="text-white text-xs leading-none">✓</span>}
              </span>
              כל המשתמשים
            </button>
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => toggleUser(u.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm text-gray-700"
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.has(u.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                  {selected.has(u.id) && <span className="text-white text-xs leading-none">✓</span>}
                </span>
                {u.nickname ?? u.email}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tables */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">טוען...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {blocks.map(block => (
            <table
              key={block.userId}
              className="border-collapse mb-4"
              style={{ minWidth: NAME_WIDTH + COL_WIDTH * block.weeks.length }}
            >
              <thead className="sticky top-0 z-20">
                <tr>
                  <th
                    colSpan={block.weeks.length + 1}
                    className="bg-gray-900 text-white text-sm font-bold px-4 py-2 text-right"
                  >
                    👤 {block.nickname}
                  </th>
                </tr>
                <tr>
                  <th
                    className="sticky right-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2"
                    style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                  >
                    קבוצת שריר
                  </th>
                  {block.weeks.map(w => (
                    <th
                      key={w}
                      className="bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                      style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                    >
                      <div>{formatSunday(w)}</div>
                      <div className="text-gray-400 text-[10px] leading-tight">שבוע {weekNumber(w)}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {CATEGORY_ORDER.map(cat => (
                  <tr key={cat} className="even:bg-gray-50 odd:bg-white">
                    <td
                      className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 px-2 py-3"
                      style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_DOT[cat]}`} />
                        <span className={`text-xs font-bold ${CATEGORY_TEXT[cat]}`}>{cat}</span>
                      </span>
                    </td>
                    {block.weeks.map(w => {
                      const val = block.pivot[cat]?.[w]
                      return (
                        <td
                          key={w}
                          className="border-b border-r border-gray-200 text-center text-xs py-3 px-1"
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                        >
                          {val ? (
                            <span className={`font-semibold ${
                              val >= 9000 ? 'text-green-600' :
                              val >= 4500 ? 'text-blue-600' :
                              'text-gray-700'
                            }`}>
                              {val.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Total row */}
                <tr className="bg-gray-800">
                  <td
                    className="sticky right-0 z-10 bg-gray-800 border-t-2 border-l border-gray-600 px-2 py-3 text-white text-xs font-bold"
                    style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                  >
                    סה״כ
                  </td>
                  {block.weeks.map(w => {
                    const val = block.totals[w]
                    return (
                      <td
                        key={w}
                        className="border-t-2 border-r border-gray-600 text-center text-xs py-3 px-1"
                        style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      >
                        {val ? (
                          <span className={`font-bold ${
                            val >= 30000 ? 'text-green-400' :
                            val >= 15000 ? 'text-blue-400' :
                            'text-gray-300'
                          }`}>
                            {val.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          ))}
        </div>
      )}

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'סינון משתמשים', body: 'לחץ על הדרופדאון לבחירת משתמש ספציפי או "כל המשתמשים". ניתן לבחור מספר משתמשים.' },
          { title: 'קריאת הטבלה', body: 'כל בלוק = משתמש אחד. עמודות = שבועות. התאריך = יום ראשון של השבוע.' },
          { title: 'צבעים', body: 'ירוק ≥ 9,000 · כחול ≥ 4,500 · אפור < 4,500 (לפי קטגוריה). סה"כ: ירוק ≥ 30,000 · כחול ≥ 15,000.' },
          { title: 'שימוש', body: 'מעקב עומס אימון שבועי לפי קבוצת שריר עבור כל החניכים.' },
        ]} />
      )}
    </div>
  )
}
