import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

interface Cached {
  text: string
  generatedAt: string
  /** Newest workout that existed when this was generated. The gate below
   *  compares against it, so one report is earned per completed workout. */
  latestLoggedAt: string
}

/** Phase 1 keeps no server state, so the cache and the usage gate both live
 *  here. Clearing site data or switching device resets them and allows one
 *  extra generation — accepted for a small, trusted user base. */
const KEY = (userId: string) => `coach-insights:${userId}`

function load(userId: string): Cached | null {
  try {
    const raw = localStorage.getItem(KEY(userId))
    return raw ? JSON.parse(raw) as Cached : null
  } catch {
    return null
  }
}

function save(userId: string, value: Cached) {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(value))
  } catch { /* private mode, quota — the panel still works, just won't persist */ }
}

const ERRORS: Record<string, string> = {
  missing_server_config: 'השירות לא מוגדר עדיין. חסר מפתח API בהגדרות השרת.',
  bad_api_key:           'מפתח ה-API של השירות אינו תקין. יש לבדוק את הגדרות השרת.',
  unauthenticated:       'ההתחברות פגה. יש להתחבר מחדש.',
  no_recent_activity:    'אין אימונים ב-4 השבועות האחרונים, אז אין על מה להתבסס.',
  no_new_activity:       'אין פעילות חדשה מאז הדוח האחרון. נסה שוב אחרי האימון הבא.',
  rate_limited:          'השירות עמוס כרגע. נסה שוב בעוד כמה דקות.',
  refused:               'לא ניתן היה להפיק תובנות מהנתונים האלה.',
  empty_response:        'לא התקבלה תשובה. נסה שוב.',
  ai_failed:             'השירות לא זמין כרגע. נסה שוב מאוחר יותר.',
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function CoachInsightsPage({ userId, onClose }: Props) {
  const [cached, setCached]   = useState<Cached | null>(() => load(userId))
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  /** Newest workout that exists right now. null until the check has run. */
  const [latest, setLatest]   = useState<string | null>(null)

  // One row. Drives the button state before anything is spent; the endpoint
  // re-checks independently, since this side can be edited.
  useEffect(() => {
    let alive = true
    supabase
      .from('workout_logs')
      .select('logged_at')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (alive) setLatest(data?.[0]?.logged_at ?? '')
      })
    return () => { alive = false }
  }, [userId])

  const hasNewActivity = latest === null
    ? false
    : !cached || (latest !== '' && latest > cached.latestLoggedAt)

  const noLogsAtAll = latest === ''

  async function generate() {
    if (loading) return           // double-tap guard
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('unauthenticated'); return }

      const res = await fetch('/api/coach-insights', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lastSeenLoggedAt: cached?.latestLoggedAt ?? null }),
      })

      const body = await res.json().catch(() => null)
      if (!body) { setError('ai_failed'); return }
      if (body.error) {
        setError(body.error)
        if (body.latestLoggedAt) setLatest(body.latestLoggedAt)
        return
      }

      const next: Cached = {
        text: body.text,
        generatedAt: body.generatedAt,
        latestLoggedAt: body.latestLoggedAt,
      }
      setCached(next)
      save(userId, next)
      setLatest(body.latestLoggedAt)
    } catch {
      setError('ai_failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between shadow-sm">
        <button onClick={onClose} className="text-gray-500 text-sm font-medium">חזור</button>
        <h1 className="text-gray-800 font-bold text-lg">תובנות מאמן</h1>
        <button
          onClick={() => setHelpOpen(true)}
          className="text-gray-400 hover:text-gray-600 text-base font-bold w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center"
        >?</button>
      </div>

      <div className="flex-1 p-4 space-y-3">
        {cached && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-gray-400 text-xs mb-3">
              הופק ב-{fmtWhen(cached.generatedAt)}
            </p>
            <Insights text={cached.text} />
          </div>
        )}

        {!cached && !loading && !error && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-4xl mb-3">🧠</p>
            <p className="text-gray-700 font-bold text-sm mb-1">תובנות מהמאמן</p>
            <p className="text-gray-500 text-xs leading-relaxed">
              ניתוח האימונים מאז הדוח הקודם — מה עבד, ומה כדאי לשנות בפעם הבאה.
              מבוסס על האימונים, ה-RIR וההערות שרשמת, עם 4 השבועות האחרונים כרקע.
            </p>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-gray-500 text-sm">המאמן בוחן את הנתונים…</p>
            <p className="text-gray-400 text-xs mt-1">זה לוקח כמה שניות</p>
          </div>
        )}

        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-amber-800 text-sm leading-relaxed">
            {ERRORS[error] ?? ERRORS.ai_failed}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading || noLogsAtAll || (!!cached && !hasNewActivity)}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-2xl py-3 text-sm transition-colors"
        >
          {loading ? '…' : cached ? 'הפק תובנות מחדש' : 'הפק תובנות'}
        </button>

        {cached && !hasNewActivity && !loading && (
          <p className="text-gray-400 text-xs text-center leading-relaxed">
            אין פעילות חדשה מאז הדוח האחרון.<br />
            נסה שוב אחרי האימון הבא.
          </p>
        )}

        <p className="text-gray-400 text-[11px] text-center leading-relaxed pt-1">
          התובנות נוצרות על ידי AI ומבוססות על הנתונים שרשמת בלבד.
          הן אינן ייעוץ רפואי. בכל כאב או מיחוש — פנה לפיזיותרפיסט או לרופא.
        </p>
      </div>

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} sections={[
          { title: 'מה זה', body: 'מאמן AI שקורא את האימונים שלך — סטים, חזרות, משקלים, RIR והערות — ונותן מבט לאחור ומבט קדימה.' },
          { title: 'על איזו תקופה', body: 'הדוח מתמקד באימונים שבוצעו מאז הדוח הקודם, כך שכל דוח עוסק במה שחדש. 4 השבועות האחרונים נשלחים כרקע בלבד, כדי לזהות מגמה — משקל שעולה, נתקע או יורד. בדוח הראשון המוקד הוא השבוע האחרון.' },
          { title: 'מתי אפשר להפיק', body: 'פעם אחת אחרי כל אימון. כל עוד לא נרשם אימון חדש מאז הדוח האחרון, הכפתור נעול — אין נתונים חדשים לנתח.' },
          { title: 'על מה זה מסתמך', body: 'הנתונים שלך בלבד: התוכנית הפעילה, התרגילים שביצעת, ה-RIR שסימנת, ההערות שכתבת, והנפח השבועי לפי שריר.' },
          { title: 'שיטת האימון', body: 'ההמלצות בנויות על RIR של בערך 2 ברוב הסטים, והתקדמות כפולה — קודם מעלים חזרות בתוך הטווח, ורק אחר כך משקל.' },
          { title: 'כאב', body: 'הערה שמתארת כאב מסומנת בנפרד, עם המלצה לפנות לאיש מקצוע. המאמן לעולם לא ימליץ להתאמן דרך כאב ולא יאבחן סיבה.' },
          { title: 'פרטיות', body: 'הניתוח מתבצע על הנתונים שלך בלבד. משתמשים אחרים אינם נכללים ואינם נחשפים.' },
        ]} />
      )}
    </div>
  )
}

/** The model returns "## heading" sections with numbered lines beneath. Light
 *  formatting only — no markdown dependency for two heading levels. */
function Insights({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} className="h-1" />
        if (t.startsWith('## ')) {
          return (
            <p key={i} className="text-gray-800 font-bold text-sm pt-2 first:pt-0">
              {t.slice(3)}
            </p>
          )
        }
        if (t.startsWith('# ')) {
          return (
            <p key={i} className="text-gray-800 font-bold text-base pt-2 first:pt-0">
              {t.slice(2)}
            </p>
          )
        }
        return (
          <p key={i} className="text-gray-700 text-sm leading-relaxed">
            {t.replace(/\*\*(.+?)\*\*/g, '$1')}
          </p>
        )
      })}
    </div>
  )
}
