import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

interface Props {
  onClose: () => void
}

const CATEGORY_ORDER = ['פלג גוף תחתון', 'גב וכתפיים', 'חזה וזרועות', 'בטן וליבה']

const CATEGORY_COLORS: Record<string, string> = {
  'פלג גוף תחתון': 'bg-blue-500',
  'גב וכתפיים':    'bg-violet-500',
  'חזה וזרועות':   'bg-orange-500',
  'בטן וליבה':     'bg-teal-500',
}

interface ExerciseRow {
  id: string
  name_he: string
  category: string
  userId: string
}

interface UserBlock {
  userId: string
  nickname: string
  exercises: ExerciseRow[]
  dates: string[]
  pivot: Record<string, Record<string, number>>
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

const COL_WIDTH  = 64
const NAME_WIDTH = 140

export default function AdminProgressPage({ onClose }: Props) {
  const [users, setUsers]         = useState<Profile[]>([])
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [blocks, setBlocks]       = useState<UserBlock[]>([])
  const [loading, setLoading]     = useState(true)
  const [open, setOpen]           = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Load users with nicknames
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('nickname')
      .then(({ data }) => {
        const profiles = (data ?? []).filter(u => u.nickname)
        setUsers(profiles)
        const all = new Set(profiles.map((u: Profile) => u.id))
        setSelected(all)
      })
  }, [])

  // Load data whenever selection changes
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
      .select('id, name_he, category, user_id')
      .in('user_id', ids)

    if (!logs || !exData) { setLoading(false); return }

    const newBlocks: UserBlock[] = []

    for (const userId of ids) {
      const user = users.find(u => u.id === userId)
      if (!user) continue

      const userLogs  = logs.filter(l => l.user_id === userId)
      const userEx    = exData.filter(e => e.user_id === userId)

      const pivotMap: Record<string, Record<string, number>> = {}
      const dateSet   = new Set<string>()
      const exWithLogs = new Set<string>()

      for (const log of userLogs) {
        const date = log.logged_at.slice(0, 10)
        dateSet.add(date)
        exWithLogs.add(log.exercise_id)
        if (!pivotMap[log.exercise_id]) pivotMap[log.exercise_id] = {}
        pivotMap[log.exercise_id][date] = (pivotMap[log.exercise_id][date] ?? 0) + (log.intensity ?? 0)
      }

      const exerciseRows: ExerciseRow[] = userEx
        .filter(e => exWithLogs.has(e.id))
        .sort((a, b) => {
          const catA = CATEGORY_ORDER.indexOf(a.category ?? '')
          const catB = CATEGORY_ORDER.indexOf(b.category ?? '')
          if (catA !== catB) return catA - catB
          return a.name_he.localeCompare(b.name_he, 'he')
        })
        .map(e => ({ id: e.id, name_he: e.name_he, category: e.category ?? '', userId }))

      newBlocks.push({
        userId,
        nickname: user.nickname ?? user.email,
        exercises: exerciseRows,
        dates: [...dateSet].sort(),
        pivot: pivotMap,
      })
    }

    setBlocks(newBlocks)
    setLoading(false)
  }

  // Close dropdown on outside click
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
        <h1 className="text-gray-800 font-bold text-lg">התקדמות עצימות — כל המשתמשים</h1>
        <div className="w-12" />
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
            {/* All option */}
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

      {/* Table */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400">טוען...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1">
            {blocks.map(block => {
              let lastCategory = ''
              return (
                <table
                  key={block.userId}
                  className="border-collapse mb-4"
                  style={{ minWidth: NAME_WIDTH + COL_WIDTH * block.dates.length }}
                >
                  {/* Nickname header */}
                  <thead>
                    <tr>
                      <th
                        colSpan={block.dates.length + 1}
                        className="bg-gray-900 text-white text-sm font-bold px-4 py-2 text-right"
                      >
                        👤 {block.nickname}
                      </th>
                    </tr>
                    <tr>
                      <th
                        className="sticky right-0 top-0 z-30 bg-gray-800 border-b border-l border-gray-700 text-gray-400 text-xs font-medium px-2 py-2"
                        style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                      >
                        תרגיל
                      </th>
                      {block.dates.map(d => (
                        <th
                          key={d}
                          className="sticky top-0 z-20 bg-gray-800 border-b border-r border-gray-700 text-gray-200 text-xs font-medium px-1 py-2 text-center"
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                        >
                          {formatDate(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {block.exercises.map(ex => {
                      const showCategoryHeader = ex.category !== lastCategory
                      if (showCategoryHeader) lastCategory = ex.category
                      const catColor = CATEGORY_COLORS[ex.category] ?? 'bg-gray-500'

                      return (
                        <>
                          {showCategoryHeader && (
                            <tr key={`dates-${block.userId}-${ex.category}`}>
                              <td
                                className="sticky right-0 z-20 bg-gray-700 border-b border-l border-gray-600 text-gray-400 text-xs font-medium px-2 py-1"
                                style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                              >
                                תרגיל
                              </td>
                              {block.dates.map(d => (
                                <td
                                  key={d}
                                  className="bg-gray-700 border-b border-r border-gray-600 text-gray-300 text-xs font-medium px-1 py-1 text-center"
                                  style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                                >
                                  {formatDate(d)}
                                </td>
                              ))}
                            </tr>
                          )}
                          {showCategoryHeader && (
                            <tr key={`cat-${block.userId}-${ex.category}`}>
                              <td
                                className={`sticky right-0 z-10 ${catColor} text-white text-xs font-bold px-3 py-1`}
                                style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                              >
                                {ex.category}
                              </td>
                              <td colSpan={block.dates.length} className={`${catColor} py-1`} />
                            </tr>
                          )}
                          <tr key={ex.id} className="even:bg-gray-50 odd:bg-white">
                            <td
                              className="sticky right-0 z-10 bg-inherit border-b border-l border-gray-200 px-2 py-2 text-gray-800 text-xs font-medium"
                              style={{ width: NAME_WIDTH, minWidth: NAME_WIDTH }}
                            >
                              {ex.name_he}
                            </td>
                            {block.dates.map(d => {
                              const val = block.pivot[ex.id]?.[d]
                              return (
                                <td
                                  key={d}
                                  className="border-b border-r border-gray-200 text-center text-xs py-2 px-1"
                                  style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                                >
                                  {val ? (
                                    <span className={`font-semibold ${
                                      val >= 3000 ? 'text-green-600' :
                                      val >= 1500 ? 'text-blue-600' :
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
                        </>
                      )
                    })}
                  </tbody>
                </table>
              )
            })}
          </div>

          {/* Legend */}
          <div className="bg-white border-t border-gray-200 px-4 py-2 flex gap-4 justify-center shrink-0">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="text-green-600 font-bold">■</span> ≥ 3000
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="text-blue-600 font-bold">■</span> ≥ 1500
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="text-gray-700 font-bold">■</span> &lt; 1500
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
