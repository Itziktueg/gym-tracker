interface Props {
  onClose: () => void
  onAdminPage: () => void
  onAdminProgress: () => void
  onAdminDensity: () => void
}

export default function AdminHub({ onClose, onAdminPage, onAdminProgress, onAdminDensity }: Props) {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">ניהול מערכת</h1>
        <div className="w-12" />
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
