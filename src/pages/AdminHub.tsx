import { useState } from 'react'
import HelpModal from '../components/HelpModal'

interface Props {
  onClose: () => void
  onAdminPage: () => void
  onAdminProgress: () => void
  onAdminDensity: () => void
}

export default function AdminHub({ onClose, onAdminPage, onAdminProgress, onAdminDensity }: Props) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">ניהול מערכת</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      <div className="flex flex-col gap-3 p-4 mt-2">
        <HubCard
          icon="🛡️"
          title="ניהול משתמשים ותרגילים"
          description="הוספת משתמשים, כינויים, הרשאות, תרגילים גלובליים"
          onClick={onAdminPage}
        />
        <HubCard
          icon="📊"
          title="התקדמות עצימות — כל המשתמשים"
          description="עצימות לפי תרגיל ותאריך עבור כל המשתמשים"
          onClick={onAdminProgress}
        />
        <HubCard
          icon="📈"
          title="עצימות יומית — כל המשתמשים"
          description="עצימות יומית לפי קבוצת שריר עבור כל המשתמשים"
          onClick={onAdminDensity}
        />
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'ניהול משתמשים ותרגילים', body: 'ניהול משתמשים (כינויים, הרשאות, הזמנות) וספריית התרגילים הגלובלית.' },
          { title: 'התקדמות עצימות', body: 'טבלת עצימות לפי תרגיל ותאריך — ניתן לסנן לפי משתמש.' },
          { title: 'עצימות יומית', body: 'עצימות לפי קבוצת שריר לכל יום אימון — ניתן לסנן לפי משתמש.' },
        ]} />
      )}
    </div>
  )
}

function HubCard({ icon, title, description, onClick }: {
  icon: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl px-4 py-4 shadow-sm flex items-center gap-4 text-right active:bg-gray-50 transition-colors w-full"
    >
      <span className="text-3xl shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-gray-800 font-semibold text-sm">{title}</p>
        <p className="text-gray-400 text-xs mt-0.5">{description}</p>
      </div>
      <span className="text-gray-300 text-lg shrink-0">›</span>
    </button>
  )
}
