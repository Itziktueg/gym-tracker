import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

const NICKNAME_RE = /^[֐-׿a-zA-Z0-9 ]*$/

export default function UsersTab() {
  const [users, setUsers]   = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  // per-user editing state: userId -> draft nickname
  const [drafts, setDrafts]   = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState<Record<string, boolean>>({})
  const [errors, setErrors]   = useState<Record<string, string>>({})

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        const profiles = data ?? []
        setUsers(profiles)
        // init drafts from existing nicknames
        const d: Record<string, string> = {}
        for (const u of profiles) d[u.id] = u.nickname ?? ''
        setDrafts(d)
        setLoading(false)
      })
  }, [])

  async function toggleRole(user: Profile) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', user.id)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    }
  }

  async function saveNickname(user: Profile) {
    const val = drafts[user.id]?.trim() ?? ''

    if (val && !NICKNAME_RE.test(val)) {
      setErrors(prev => ({ ...prev, [user.id]: 'אותיות, ספרות ורווחים בלבד' }))
      return
    }

    setSaving(prev => ({ ...prev, [user.id]: true }))
    setErrors(prev => ({ ...prev, [user.id]: '' }))

    const { error } = await supabase
      .from('profiles')
      .update({ nickname: val || null })
      .eq('id', user.id)

    if (error) {
      setErrors(prev => ({ ...prev, [user.id]: error.message }))
    } else {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, nickname: val || null } : u))
    }
    setSaving(prev => ({ ...prev, [user.id]: false }))
  }

  if (loading) return <p className="text-center text-gray-400 mt-8">טוען...</p>

  return (
    <div className="flex flex-col gap-2 p-3">
      {users.map(user => (
        <div key={user.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex flex-col gap-2">
          {/* Row 1: email + role toggle */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 font-medium text-sm truncate">{user.email}</p>
              <p className="text-gray-400 text-xs font-mono truncate">{user.id}</p>
              <p className="text-gray-400 text-xs">{new Date(user.created_at).toLocaleDateString('he-IL')}</p>
            </div>
            <button
              onClick={() => toggleRole(user)}
              className={`
                text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0
                ${user.role === 'admin'
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
              `}
            >
              {user.role === 'admin' ? 'מנהל ✓' : 'משתמש'}
            </button>
          </div>

          {/* Row 2: nickname */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={drafts[user.id] ?? ''}
              onChange={e => {
                setDrafts(prev => ({ ...prev, [user.id]: e.target.value }))
                setErrors(prev => ({ ...prev, [user.id]: '' }))
              }}
              placeholder="כינוי (אופציונלי)"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-300"
            />
            <button
              onClick={() => saveNickname(user)}
              disabled={saving[user.id] || drafts[user.id] === (user.nickname ?? '')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-40 shrink-0"
            >
              {saving[user.id] ? '...' : 'שמור'}
            </button>
          </div>
          {errors[user.id] && (
            <p className="text-red-500 text-xs">{errors[user.id]}</p>
          )}
        </div>
      ))}
    </div>
  )
}
