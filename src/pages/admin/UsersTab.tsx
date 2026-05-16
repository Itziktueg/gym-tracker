import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

export default function UsersTab() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        setUsers(data ?? [])
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

  if (loading) return <p className="text-center text-gray-400 mt-8">טוען...</p>

  return (
    <div className="flex flex-col gap-2 p-3">
      {users.map(user => (
        <div key={user.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="flex-1 min-w-0">
            <p className="text-gray-800 font-medium text-sm truncate">{user.email}</p>
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
      ))}
    </div>
  )
}
