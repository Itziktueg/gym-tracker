import { useState } from 'react'
import UsersTab from './admin/UsersTab'
import ExercisesTab from './admin/ExercisesTab'
import InviteTab from './admin/InviteTab'

type Tab = 'users' | 'invites' | 'exercises'

interface Props {
  onClose: () => void
  adminId: string
}

export default function AdminPage({ onClose, adminId }: Props) {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
        >
          ← חזרה
        </button>
        <h1 className="text-gray-800 font-bold text-lg">ניהול מערכת</h1>
        <div className="w-12" />
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200">
        <TabBtn label="משתמשים"   active={tab === 'users'}     onClick={() => setTab('users')} />
        <TabBtn label="הזמנות"    active={tab === 'invites'}   onClick={() => setTab('invites')} />
        <TabBtn label="תרגילים"   active={tab === 'exercises'} onClick={() => setTab('exercises')} />
      </div>

      {tab === 'users'     && <UsersTab />}
      {tab === 'invites'   && <InviteTab adminId={adminId} />}
      {tab === 'exercises' && <ExercisesTab />}
    </div>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 py-3 text-sm font-semibold border-b-2 transition-colors
        ${active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-400 hover:text-gray-600'}
      `}
    >
      {label}
    </button>
  )
}
