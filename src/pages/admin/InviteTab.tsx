import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Invite {
  id: string
  email: string
  created_at: string
}

interface Props {
  adminId: string
}

export default function InviteTab({ adminId }: Props) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('invited_emails')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setInvites(data ?? [])
        setLoading(false)
      })
  }, [])

  async function addInvite() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setAdding(true)
    setError(null)

    const { data, error } = await supabase
      .from('invited_emails')
      .insert({ email: trimmed, invited_by: adminId })
      .select()
      .single()

    if (error) {
      setError(error.code === '23505' ? 'אימייל זה כבר קיים ברשימה' : error.message)
    } else {
      setInvites(prev => [data as Invite, ...prev])
      setEmail('')
    }
    setAdding(false)
  }

  async function removeInvite(id: string) {
    await supabase.from('invited_emails').delete().eq('id', id)
    setInvites(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="p-3">
      {/* Add new invite */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
        <h3 className="text-gray-700 font-bold mb-3 text-center">הזמנת משתמש חדש</h3>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addInvite()}
            placeholder="email@example.com"
            className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={addInvite}
            disabled={adding || !email.trim()}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
          >
            {adding ? '...' : 'הוסף'}
          </button>
        </div>
        {error && (
          <p className="text-red-500 text-xs text-center mt-2">{error}</p>
        )}
        <p className="text-gray-400 text-xs text-center mt-2">
          המשתמש יוכל להירשם עם אימייל זה ולבחור סיסמה בעצמו
        </p>
      </div>

      {/* Invite list */}
      {loading ? (
        <p className="text-center text-gray-400 mt-4">טוען...</p>
      ) : invites.length === 0 ? (
        <p className="text-center text-gray-400 mt-4 text-sm">אין הזמנות פעילות</p>
      ) : (
        <div className="flex flex-col gap-2">
          {invites.map(invite => (
            <div key={invite.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 text-sm font-medium truncate">{invite.email}</p>
                <p className="text-gray-400 text-xs">
                  {new Date(invite.created_at).toLocaleDateString('he-IL')}
                </p>
              </div>
              <button
                onClick={() => removeInvite(invite.id)}
                className="text-red-400 hover:text-red-600 text-lg shrink-0"
                title="הסר הזמנה"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
