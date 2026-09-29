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
  period_start: string | null
  period_end: string | null
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The plan is weekly, so the default period is this training week. */
function sundayOfThisWeek() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return toISODate(d)
}

/** "20.9–26.9" — the form used in the report this was modelled on. */
function fmtRange(from: string | null, to: string | null) {
  if (!from || !to) return null
  const short = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${Number(d)}.${Number(m)}`
  }
  return from === to ? short(from) : `${short(from)}–${short(to)}`
}

const ERRORS: Record<string, string> = {
  missing_server_config: 'השירות לא מוגדר עדיין. חסר מפתח API בהגדרות השרת.',
  bad_api_key:           'מפתח ה-API של השירות אינו תקין. יש לבדוק את הגדרות השרת.',
  unauthenticated:       'ההתחברות פגה. יש להתחבר מחדש.',
  no_recent_activity:    'אין אימונים ב-4 השבועות האחרונים, אז אין על מה להתבסס.',
  no_new_activity:       'אין פעילות חדשה מאז הדוח האחרון. נסה שוב אחרי האימון הבא, או בחר טווח תאריכים.',
  no_activity_in_period: 'לא נרשמו אימונים בטווח התאריכים שנבחר.',
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
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  /** Newest workout that exists right now. null until the check has run. */
  const [latest, setLatest]   = useState<string | null>(null)
  /** Null while using the weekly default; a chosen range once opened. */
  const [range, setRange]     = useState<{ from: string; to: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** The report produced in this visit. Shown expanded; everything else stays
   *  collapsed in the list, so opening the page is a choice, not a wall of text. */
  const [fresh, setFresh]     = useState<Insight | null>(null)

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
          .select('id, text, generated_at, latest_logged_at, focus_label, period_start, period_end')
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
    setErrorDetail(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('unauthenticated'); return }

      const res = await fetch('/api/coach-insights', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          lastSeenLoggedAt: current?.latest_logged_at ?? null,
          ...(range ? { from: range.from, to: range.to } : {}),
        }),
      })

      // A platform-level timeout kills the function before its own error
      // handling runs, so the response is HTML rather than JSON. Reporting the
      // status is the only way to tell that apart from an API failure.
      const body = await res.json().catch(() => null)
      if (!body) {
        setError('ai_failed')
        setErrorDetail(`HTTP ${res.status}${res.status === 504 ? ' — function timed out' : ''}`)
        return
      }
      if (body.error) {
        setError(body.error)
        setErrorDetail(body.detail ?? null)
        if (body.latestLoggedAt) setLatest(body.latestLoggedAt)
        return
      }

      const next: Insight = {
        id:               body.id ?? `local-${Date.now()}`,
        text:             body.text,
        generated_at:     body.generatedAt,
        latest_logged_at: body.latestLoggedAt,
        focus_label:      body.focusLabel ?? null,
        period_start:     body.periodStart ?? null,
        period_end:       body.periodEnd ?? null,
      }
      setHistory(prev => [next, ...(prev ?? [])])
      setFresh(next)
      setLatest(body.latestLoggedAt)
      if (body.saved === false) setError('load_failed')
    } catch {
      setError('ai_failed')
    } finally {
      setLoading(false)
    }
  }

  // Everything except the report just generated, which shows expanded above.
  const previous = (history ?? []).filter(r => r.id !== fresh?.id)

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
        {/* Period selector first: choosing the period comes before producing a
            report on it. Compact, since it is a control rather than content. */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => {
              setPickerOpen(o => !o)
              if (!range) setRange({ from: sundayOfThisWeek(), to: toISODate(new Date()) })
            }}
            className="w-full px-3 py-2 flex items-center justify-between text-right active:bg-gray-50"
          >
            <span className="text-gray-700 text-xs">
              <span className="text-gray-400">תקופה: </span>
              {range ? fmtRange(range.from, range.to) : 'השבוע הנוכחי'}
            </span>
            <span className="text-gray-300 text-base">{pickerOpen ? '−' : '+'}</span>
          </button>

          {pickerOpen && range && (
            <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-2">
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-gray-400 text-[11px] block mb-0.5">מתאריך</span>
                  <input
                    type="date"
                    value={range.from}
                    max={range.to}
                    onChange={e => setRange(r => r && { ...r, from: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-gray-400 text-[11px] block mb-0.5">עד תאריך</span>
                  <input
                    type="date"
                    value={range.to}
                    min={range.from}
                    max={toISODate(new Date())}
                    onChange={e => setRange(r => r && { ...r, to: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2 py-1.5 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </label>
              </div>
              <button
                onClick={() => { setRange(null); setPickerOpen(false) }}
                className="text-blue-600 text-xs font-medium"
              >
                חזור לשבוע הנוכחי
              </button>
            </div>
          )}
        </div>

        <button
          onClick={generate}
          disabled={loading || history === null || noLogsAtAll || (!range && !!current && !hasNewActivity)}
          className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-2xl py-3 text-sm transition-colors"
        >
          {loading ? '…' : current ? 'הפק תובנות מחדש' : 'הפק תובנות'}
        </button>

        {!range && current && !hasNewActivity && !loading && (
          <p className="text-gray-400 text-xs text-center leading-relaxed">
            אין פעילות חדשה מאז הדוח האחרון.<br />
            נסה שוב אחרי האימון הבא, או בחר טווח תאריכים למעלה.
          </p>
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
            {/* The technical cause, for reporting a failure rather than
                guessing at it. Deliberately quiet and secondary. */}
            {errorDetail && (
              <p dir="ltr" className="text-amber-600/70 text-[11px] mt-2 font-mono break-words text-left">
                {errorDetail}
              </p>
            )}
          </div>
        )}

        {/* The report just produced, between the control that produced it and
            the archive. Earlier reports stay collapsed in the list below. */}
        {fresh && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="border-b border-gray-100 pb-2.5 mb-3">
              <p className="font-bold text-base" style={{ color: HEADING }}>
                דוח אימונים · {fmtRange(fresh.period_start, fresh.period_end) ?? fresh.focus_label ?? ''}
              </p>
              <p className="text-gray-400 text-xs mt-0.5">הופק ב-{fmtWhen(fresh.generated_at)}</p>
            </div>
            <Insights text={fresh.text} />
          </div>
        )}

        {history === null && !error && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-gray-400 text-sm">טוען…</p>
          </div>
        )}

        {history !== null && history.length === 0 && !loading && !error && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-4xl mb-3">🧠</p>
            <p className="text-gray-700 font-bold text-sm mb-1">תובנות מהמאמן</p>
            <p className="text-gray-500 text-xs leading-relaxed">
              ניתוח האימונים בתקופה שתבחר — מה עבד, ומה כדאי לשנות בפעם הבאה.
              מבוסס על האימונים, ה-RIR וההערות שרשמת, עם 4 השבועות שקדמו לתקופה כרקע.
            </p>
          </div>
        )}

        {previous.length > 0 && (
          <div className="pt-2">
            <p className="text-gray-500 text-xs font-bold mb-2 px-1">
              {fresh ? 'דוחות קודמים' : 'הדוחות שלי'}
            </p>
            <div className="space-y-2">
              {previous.map(r => (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-right active:bg-gray-50"
                  >
                    <span className="min-w-0">
                      {/* The period is what identifies a report; the date it
                          was produced is secondary. */}
                      <span className="text-gray-700 text-sm font-medium block">
                        {fmtRange(r.period_start, r.period_end) ?? r.focus_label ?? fmtDate(r.generated_at)}
                      </span>
                      <span className="text-gray-400 text-[11px]">הופק {fmtDate(r.generated_at)}</span>
                    </span>
                    <span className="text-gray-300 text-lg shrink-0">{openId === r.id ? '−' : '+'}</span>
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
          { title: 'מבנה הדוח', body: 'מבט לאחור: דבקות בתוכנית (כמה אימונים בוצעו ומה נדחה או דולג), התקדמות, ומה עולה מההערות. אחר כך מבט קדימה — לכל תרגיל, מה בוצע ומה לעשות בפעם הבאה, מקובץ לפי אימוני התוכנית. ואם שאלת שאלה בהערות, יש גם תשובות.' },
          { title: 'תרגיל שנדחה מול תרגיל שדולג', body: 'אם תרגיל לא בוצע ביום שלו אבל כן בוצע ביום אחר — למשל כי המכונה הייתה תפוסה — הדוח מזהה זאת ולא מתייחס לזה כדילוג. תרגיל שבאמת לא בוצע מצוין בנפרד, כולל כמה זמן הוא נעדר.' },
          { title: 'על איזו תקופה', body: 'ברירת המחדל היא שבוע האימונים הנוכחי — מיום ראשון ועד היום — כי התוכנית שבועית. הטווח מוצג בראש הדוח. 4 השבועות שקדמו לתקופה נשלחים כרקע בלבד, לזיהוי מגמה.' },
          { title: 'בחירת טווח תאריכים', body: 'שורת "תקופה" מעל כפתור ההפקה פותחת בחירת מתאריך–עד תאריך, להפקת דוח על שבוע קודם או על כל תקופה אחרת. בטווח שנבחר ידנית אין מגבלת הפקה.' },
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

interface Report {
  lookback: { adherence: string; progress: string; notes: string; pain: string | null }
  workouts: { name: string; exercises: { name: string; this_week: string; next_time: string }[] }[]
  questions: { question: string; answer: string }[]
  closing: string
}

/** Reports are stored as JSON now. Anything written before that change is
 *  plain text and still has to render, so this decides which it is. */
function parseReport(text: string): Report | null {
  try {
    const r = JSON.parse(text)
    return r && typeof r === 'object' && r.lookback && Array.isArray(r.workouts) ? r as Report : null
  } catch {
    return null
  }
}

function Insights({ text }: { text: string }) {
  const report = parseReport(text)
  return report ? <StructuredReport report={report} /> : <PlainText text={text} />
}

/** The green from the emailed report Itzik asked this to match. */
const HEADING = '#1a5d1a'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold text-base mb-2" style={{ color: HEADING }}>{title}</p>
      {children}
    </div>
  )
}

function StructuredReport({ report }: { report: Report }) {
  return (
    <div className="space-y-5">
      <Section title="מבט לאחור">
        <div className="space-y-2">
          <p className="text-gray-700 text-sm leading-relaxed">{report.lookback.adherence}</p>
          <p className="text-gray-700 text-sm leading-relaxed">{report.lookback.progress}</p>
          <p className="text-gray-700 text-sm leading-relaxed">{report.lookback.notes}</p>
        </div>
      </Section>

      {/* Pain is visually separated on purpose — it must never read as one more
          line of training commentary. */}
      {report.lookback.pain && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-800 font-bold text-sm mb-1">⚠ שים לב</p>
          <p className="text-red-800 text-sm leading-relaxed">{report.lookback.pain}</p>
        </div>
      )}

      <Section title="מבט קדימה">
        <div className="space-y-4">
          {report.workouts.map((w, i) => (
            <div key={i}>
              <p className="font-bold text-sm mb-1.5" style={{ color: HEADING }}>{w.name}</p>
              {/* A real three-column table, as in the emailed report. The
                  overflow wrapper is a safety valve for a long exercise name —
                  the table is sized to fit a phone without it. */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right" style={{ minWidth: 300 }}>
                  <thead>
                    <tr>
                      <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-[11px] font-bold text-gray-600 w-[30%]">תרגיל</th>
                      <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-[11px] font-bold text-gray-600 w-[28%]">השבוע</th>
                      <th className="border border-gray-300 bg-gray-50 px-1.5 py-1 text-[11px] font-bold text-gray-600">בפעם הבאה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.exercises.map((ex, j) => (
                      <tr key={j}>
                        <td className="border border-gray-300 px-1.5 py-1.5 text-[11px] font-semibold text-gray-800 align-top leading-snug">
                          {ex.name}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1.5 text-[11px] text-gray-600 align-top leading-snug">
                          {ex.this_week}
                        </td>
                        <td className="border border-gray-300 px-1.5 py-1.5 text-[11px] text-gray-800 align-top leading-snug">
                          {ex.next_time}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {report.questions.length > 0 && (
        <Section title="לגבי מה ששאלת">
          <div className="space-y-2.5">
            {report.questions.map((q, i) => (
              <div key={i}>
                <p className="text-gray-700 text-sm font-semibold leading-snug">{q.question}</p>
                <p className="text-gray-600 text-sm leading-relaxed mt-0.5">{q.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.closing && (
        <p className="text-gray-500 text-sm text-center pt-1">{report.closing}</p>
      )}
    </div>
  )
}

/** Reports written before the structured format. */
function PlainText({ text }: { text: string }) {
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
