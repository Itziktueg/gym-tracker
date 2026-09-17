import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import HelpModal from '../components/HelpModal'

interface Props {
  userId: string
  onClose: () => void
}

interface Insight {
  id: string
  text: string
  generated_at: string
  /** Newest workout that existed when this was generated. The usage gate
   *  compares against it, so one report is earned per completed workout. */
  latest_logged_at: string
  focus_label: string | null
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
  load_failed:           'לא ניתן לטעון את הדוחות הקודמים.',
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function CoachInsightsPage({ userId, onClose }: Props) {
  const [history, setHistory] = useState<Insight[] | null>(null)
  const [openId, setOpenId]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  /** Newest workout that exists right now. null until the check has run. */
  const [latest, setLatest]   = useState<string | null>(null)

  const current = history?.[0] ?? null

  // Reports live in the database now, so they follow the user across devices.
  // The one-row logged_at query drives the button before anything is spent;
  // the endpoint re-checks independently, since this side can be tampered with.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [insights, logs] = await Promise.all([
        supabase
          .from('coach_insights')
          .select('id, text, generated_at, latest_logged_at, focus_label')
          .eq('user_id', userId)
          .order('generated_at', { ascending: false })
          .limit(20),
        supabase
          .from('workout_logs')
          .select('logged_at')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false })
          .limit(1),
      ])
      if (!alive) return
      if (insights.error) setError('load_failed')
      setHistory((insights.data ?? []) as Insight[])
      setLatest(logs.data?.[0]?.logged_at ?? '')
    })()
    return () => { alive = false }
  }, [userId])

  const hasNewActivity = latest === null || history === null
    ? false
    : !current || (latest !== '' && latest > current.latest_logged_at)

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
        body: JSON.stringify({ lastSeenLoggedAt: current?.latest_logged_at ?? null }),
      })

      const body = await res.json().catch(() => null)
      if (!body) { setError('ai_failed'); return }
      if (body.error) {
        setError(body.error)
        if (body.latestLoggedAt) setLatest(body.latestLoggedAt)
        return
      }

      const next: Insight = {
        id:               body.id ?? `local-${Date.now()}`,
        text:             body.text,
        generated_at:     body.generatedAt,
        latest_logged_at: body.latestLoggedAt,
        focus_label:      body.focusLabel ?? null,
      }
      setHistory(prev => [next, ...(prev ?? [])])
      setLatest(body.latestLoggedAt)
      if (body.saved === false) setError('load_failed')
    } catch {
      setError('ai_failed')
    } finally {
      setLoading(false)
    }
  }

  const previous = (history ?? []).slice(1)

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
        {history === null && !error && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-gray-400 text-sm">טוען…</p>
          </div>
        )}

        {current && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-gray-400 text-xs mb-3">
              הופק ב-{fmtWhen(current.generated_at)}
              {current.focus_label ? ` · ${current.focus_label}` : ''}
            </p>
            <Insights text={current.text} />
          </div>
        )}

        {history !== null && !current && !loading && !error && (
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
          disabled={loading || history === null || noLogsAtAll || (!!current && !hasNewActivity)}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-2xl py-3 text-sm transition-colors"
        >
          {loading ? '…' : current ? 'הפק תובנות מחדש' : 'הפק תובנות'}
        </button>

        {current && !hasNewActivity && !loading && (
          <p className="text-gray-400 text-xs text-center leading-relaxed">
            אין פעילות חדשה מאז הדוח האחרון.<br />
            נסה שוב אחרי האימון הבא.
          </p>
        )}

        {previous.length > 0 && (
          <div className="pt-2">
            <p className="text-gray-500 text-xs font-bold mb-2 px-1">דוחות קודמים</p>
            <div className="space-y-2">
              {previous.map(r => (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-right active:bg-gray-50"
                  >
                    <span className="text-gray-700 text-sm font-medium">
                      {fmtDate(r.generated_at)}
                    </span>
                    <span className="text-gray-300 text-lg">{openId === r.id ? '−' : '+'}</span>
                  </button>
                  {openId === r.id && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100">
                      <Insights text={r.text} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
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
          { title: 'היכן הדוחות נשמרים', body: 'הדוחות נשמרים בחשבון שלך, לא במכשיר, ולכן הם מופיעים בכל מכשיר שבו תתחבר — טלפון ומחשב כאחד. הדוחות הקודמים מופיעים בתחתית המסך ואפשר לפתוח אותם.' },
          { title: 'על מה זה מסתמך', body: 'הנתונים שלך בלבד: התוכנית הפעילה, התרגילים שביצעת, ה-RIR שסימנת, ההערות שכתבת, והנפח השבועי לפי שריר.' },
          { title: 'שיטת האימון', body: 'ההמלצות בנויות על RIR של בערך 2 ברוב הסטים, והתקדמות כפולה — קודם מעלים חזרות בתוך הטווח, ורק אחר כך משקל.' },
          { title: 'כאב', body: 'הערה שמתארת כאב מסומנת בנפרד, עם המלצה לפנות לאיש מקצוע. המאמן לעולם לא ימליץ להתאמן דרך כאב ולא יאבחן סיבה.' },
          { title: 'פרטיות', body: 'הניתוח מתבצע על הנתונים שלך בלבד, והדוחות נשמרים תחת החשבון שלך. משתמשים אחרים אינם נכללים ואינם יכולים לראות אותם.' },
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
