import { useState } from 'react'
import HelpModal from '../components/HelpModal'

interface Props {
  onClose: () => void
  onHistory: () => void
  onProgress: () => void
  onDensity: () => void
  onWeeklyDensity: () => void
  onFrequency: () => void
}

export default function ReportsHub({ onClose, onHistory, onProgress, onDensity, onWeeklyDensity, onFrequency }: Props) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">דוחות</h1>
        <button onClick={() => setHelpOpen(true)} className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center">?</button>
      </div>

      <div className="flex flex-col gap-3 p-4 mt-2">
        <HubCard
          icon="📋"
          title="היסטוריית אימונים"
          description="כל התרגילים שבוצעו — סטים, חזרות ומשקל"
          onClick={onHistory}
        />
        <HubCard
          icon="📊"
          title="התקדמות עצימות"
          description="עצימות לפי תרגיל ותאריך לאורך זמן"
          onClick={onProgress}
        />
        <HubCard
          icon="📈"
          title="עצימות יומית"
          description="עצימות לפי קבוצת שריר לכל יום אימון"
          onClick={onDensity}
        />
        <HubCard
          icon="📅"
          title="עצימות שבועית"
          description="עצימות מצטברת לפי קבוצת שריר לכל שבוע"
          onClick={onWeeklyDensity}
        />
        <HubCard
          icon="🔢"
          title="תדירות תרגילים"
          description="כמה פעמים בוצע כל תרגיל בתקופה נבחרת"
          onClick={onFrequency}
        />
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'היסטוריית אימונים', body: 'סיכום כל התרגילים שבוצעו — מספר סטים, ממוצע חזרות ומשקל מקסימלי.' },
          { title: 'התקדמות עצימות', body: 'טבלת עצימות לפי תרגיל ותאריך — לזיהוי מגמות התקדמות.' },
          { title: 'עצימות יומית', body: 'עצימות לפי קבוצת שריר לכל יום אימון — לאיזון העומס בין האימונים.' },
          { title: 'עצימות שבועית', body: 'עצימות מצטברת לפי קבוצת שריר לכל שבוע — לזיהוי מגמות עומס לאורך זמן.' },
          { title: 'תדירות תרגילים', body: 'מספר הפעמים שכל תרגיל בוצע בתקופה נבחרת, מסודר מגבוה לנמוך.' },
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
