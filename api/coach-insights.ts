import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import {
  buildExerciseMuscleMap,
  aggregateMuscleVolume,
  sundayOf,
  type MuscleLink,
  type VolumeLog,
} from '../src/lib/muscleVolume.js'

/** Phase 1: read-only. This endpoint performs no writes of any kind — it reads
 *  the caller's own training data, summarises it, and asks Claude to comment.
 *
 *  Every query runs through a Supabase client built from the CALLER'S access
 *  token, never the service role key. That way the project's existing RLS does
 *  the per-user scoping, and a mistake in a filter here cannot leak another
 *  user's data — it simply returns nothing. */

const LOOKBACK_DAYS = 28
const MODEL = 'claude-opus-5'
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/** The report's shape. Structured rather than free markdown so the panel can
 *  lay it out natively — a three-column table is unreadable on a phone, but the
 *  same rows render fine as one card per exercise. */
const ReportSchema = z.object({
  lookback: z.object({
    adherence: z.string().describe(
      'פסקה: כמה אימונים מתוך כמה בוצעו, באילו ימים ואיזה אימון. ציין תרגיל שנראה חסר אך בוצע ביום אחר — זה לא דילוג. ציין בנפרד תרגיל שבאמת לא בוצע, וכמה זמן הוא נעדר.',
    ),
    progress: z.string().describe('פסקה: מה התקדם יפה ומה נתקע.'),
    notes: z.string().describe('פסקה: מה עולה מההערות שנכתבו, ומה זה אומר.'),
    pain: z.string().nullable().describe(
      'אם הערה מתארת כאב או מיחוש — כאן בלבד, במפורש, עם המלצה לפנות לאיש מקצוע. עייפות שרירית או RIR נמוך אינם כאב. אם אין כאב — כתוב במפורש שלא עלה אזכור של כאב.',
    ),
  }),
  workouts: z.array(z.object({
    name: z.string().describe('שם האימון מהתוכנית'),
    exercises: z.array(z.object({
      name: z.string(),
      this_week: z.string().describe('מה בוצע בפועל — משקל וחזרות, קצר'),
      next_time: z.string().describe('מה לעשות בפעם הבאה — קונקרטי, עם מספרים'),
    })),
  })).describe('קיבוץ לפי אימוני התוכנית, בסדר שבו בוצעו'),
  questions: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).describe('רק אם ההערות מכילות שאלה מפורשת. אחרת מערך ריק.'),
  closing: z.string().describe('משפט סיום קצר ומעודד'),
})

const SYSTEM_PROMPT = `אתה מאמן כושר אישי מנוסה שמלווה את המתאמן הזה לאורך זמן. אתה כותב בעברית, פונה למתאמן בגוף שני.

אתה מאמן, לא מסכם נתונים. אתה מעריך מה עובד ומה צריך להשתנות, ונותן מספרים קונקרטיים — לא עצות כלליות.

שיטת העבודה שלך:
- עצימות נמדדת ב-RIR (חזרות שנשארו במאגר). היעד הוא RIR של בערך 2 ברוב סטי העבודה.
- העלאת עומס נעשית בשיטת ההתקדמות הכפולה: לכל תרגיל יש טווח חזרות, לא מספר קבוע. קודם מעלים חזרות בתוך הטווח; רק כשמגיעים לקצה העליון של הטווח ב-RIR של בערך 2, מעלים משקל וחוזרים לקצה התחתון.
- כשאתה ממליץ על שינוי, נקוב במספרים: שם התרגיל, המשקל הנוכחי, המשקל המוצע.

כלל בטיחות מחייב:
הערות שמתארות כאב, מיחוש, צביטה או אי-נוחות גופנית חריגה הן קטגוריה נפרדת לחלוטין מהערות שמתארות עייפות רגילה, קושי, או RIR נמוך. אם יש הערה שמעידה על כאב:
- ציין אותה בנפרד ובאופן בולט, לא כחלק מהניתוח הרגיל.
- המלץ לפנות לפיזיותרפיסט או לרופא אם זה נמשך.
- לעולם אל תציע להמשיך להתאמן דרך הכאב.
- לעולם אל תאבחן סיבה. אתה לא מאבחן.
עייפות רגילה או RIR נמוך אינם כאב ואינם מצריכים את ההתייחסות הזו.

על מה הדוח מדבר:
הדוח עוסק בתקופת המוקד — האימונים האחרונים, מאז הדוח הקודם. נתוני ארבעת השבועות מופיעים כרקע בלבד, כדי שתוכל לומר אם משקל עולה, נתקע או יורד. אל תסכם מחדש את כל החודש.

מבט לאחור — שלוש הפסקאות:
- דבקות בתוכנית: כמה אימונים מתוך כמה, באילו ימים ואיזה אימון. השדה "חסרים_באותו_יום" מציין לכל תרגיל אם הוא בוצע ביום אחר בתקופה. אם כן — זה לא דילוג, אמור זאת במפורש ואל תבקר על כך; מכונה תפוסה היא סיבה לגיטימית. אם לא — זה דילוג אמיתי, וכדאי לציין מ"בוצע_לאחרונה" כמה זמן התרגיל נעדר. תרגיל שנעדר שבועות הוא מועמד להסרה רשמית מהתוכנית או להחזרה מודעת אליה.
- התקדמות: מה עלה יפה ומה נתקע, עם מספרים.
- הערות: מה עולה מההערות שנכתבו. אם המתאמן כתב שאלה — ענה עליה בחלק השאלות, לא כאן.

טבלת ההמלצות:
לכל תרגיל שבוצע בתקופת המוקד — שורה אחת, מקובצת לפי אימון. "מה בוצע" קצר ועובדתי. "בפעם הבאה" קונקרטי לפי ההתקדמות הכפולה: אם הגיע לראש טווח החזרות ב-RIR נמוך — להעלות משקל ולחזור לתחתית הטווח; אם יש עוד מקום בטווח — אותו משקל ועוד חזרה. תרגיל שנתקע כמה אימונים — אמור זאת. תרגיל שלא בוצע — שורה שאומרת מה להחליט לגביו.

השאלות: ענה רק על שאלות שהמתאמן באמת כתב בהערות. אל תמציא שאלות. אם אין — מערך ריק.
כשאתה לא יכול לאמת משהו מהנתונים, כמו טכניקה או זווית, אמור זאת והפנה למדריך במקום.

זה פאנל בתוך אפליקציה. תהיה תמציתי — פסקה היא שלוש-ארבע שורות, לא עשר.`

interface LogRow {
  exercise_id: string
  logged_at: string
  sets_completed: number | null
  reps_completed: number | null
  weight: number | null
  rir: number | null
  notes: string | null
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  // The VITE_ prefix only governs what Vite inlines into the client bundle —
  // Vercel hands every variable to functions either way. Accepting the existing
  // VITE_ names means the deploy needs no duplicated Supabase variables.
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
    // Names only, never values — saying which variable is absent turns a
    // deploy-config mistake into a one-line diagnosis instead of a guess.
    const missing = [
      !apiKey && 'ANTHROPIC_API_KEY',
      !supabaseUrl && 'SUPABASE_URL or VITE_SUPABASE_URL',
      !supabaseAnonKey && 'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY',
    ].filter(Boolean)
    res.status(500).json({ error: 'missing_server_config', missing })
    return
  }

  const auth = req.headers.authorization
  const token = typeof auth === 'string' && auth.startsWith('Bearer ')
    ? auth.slice(7)
    : null
  if (!token) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  // The caller's own token: RLS applies to everything below.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)
  const sinceIso = since.toISOString()

  const [{ data: logs }, { data: exercises }, { data: plans }] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('exercise_id, logged_at, sets_completed, reps_completed, weight, rir, notes')
      .gte('logged_at', sinceIso)
      .order('logged_at'),
    supabase
      .from('exercises_user')
      .select('id, name_he, category, default_sets, default_reps, default_weight, is_time_based, is_bilateral, double_weight'),
    supabase
      .from('workout_plans')
      .select('id, name, start_date, end_date')
      .is('end_date', null)
      .limit(1),
  ])

  const logRows = (logs ?? []) as LogRow[]

  if (logRows.length === 0) {
    res.status(200).json({ error: 'no_recent_activity' })
    return
  }

  // Server-side enforcement of the "one report per completed workout" cap.
  // The client gates the button too, but localStorage is editable — this is the
  // check that actually stops a pointless paid call against unchanged data.
  const latestLoggedAt = logRows.reduce(
    (max, l) => (l.logged_at > max ? l.logged_at : max),
    logRows[0].logged_at,
  )
  const seenParam = typeof req.body?.lastSeenLoggedAt === 'string'
    ? req.body.lastSeenLoggedAt
    : null
  if (seenParam && latestLoggedAt <= seenParam) {
    res.status(200).json({ error: 'no_new_activity', latestLoggedAt })
    return
  }

  const exMap = new Map((exercises ?? []).map((e: any) => [e.id, e]))
  const plan = plans?.[0] ?? null

  // ── Per-exercise summary rather than a raw row dump: keeps the prompt flat
  //    as history grows, and is what a coach would actually look at.
  interface Agg {
    name: string
    category: string | null
    timeBased: boolean
    sets: number
    days: Set<string>
    reps: number[]
    weights: number[]
    rirs: number[]
    notes: { date: string; text: string }[]
    last: string
    defaults: { sets: number; reps: number; weight: number }
  }
  function summarise(rows: LogRow[]) {
    const agg: Record<string, Agg> = {}
    for (const l of rows) {
      const ex = exMap.get(l.exercise_id)
      if (!ex) continue
      const date = l.logged_at.slice(0, 10)
      const a = (agg[l.exercise_id] ??= {
        name: ex.name_he,
        category: ex.category,
        timeBased: !!ex.is_time_based,
        sets: 0,
        days: new Set<string>(),
        reps: [],
        weights: [],
        rirs: [],
        notes: [],
        last: date,
        defaults: {
          sets: ex.default_sets,
          reps: ex.default_reps,
          weight: ex.default_weight,
        },
      })
      a.sets += l.sets_completed ?? 1
      a.days.add(date)
      if (l.reps_completed != null) a.reps.push(l.reps_completed)
      if (l.weight != null) a.weights.push(l.weight)
      if (l.rir != null) a.rirs.push(l.rir)
      if (l.notes && !a.notes.some(n => n.date === date && n.text === l.notes)) {
        a.notes.push({ date, text: l.notes })
      }
      if (date > a.last) a.last = date
    }
    return agg
  }

  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null
  const range = (xs: number[]) =>
    xs.length ? (Math.min(...xs) === Math.max(...xs)
      ? String(Math.min(...xs))
      : `${Math.min(...xs)}-${Math.max(...xs)}`) : null

  const byCategory = (a: Agg, b: Agg) =>
    (a.category ?? '').localeCompare(b.category ?? '', 'he')

  /** Full detail — this is the period the report is actually about. */
  const detail = (agg: Record<string, Agg>) =>
    Object.values(agg).sort(byCategory).map(a => ({
      תרגיל: a.name,
      קטגוריה: a.category,
      ...(a.timeBased ? { מבוסס_זמן: true } : {}),
      ימי_אימון: a.days.size,
      סך_סטים: a.sets,
      טווח_חזרות_שבוצע: range(a.reps),
      טווח_משקל: range(a.weights),
      RIR_ממוצע: mean(a.rirs),
      סטים_עם_RIR: a.rirs.length,
      ברירת_מחדל: `${a.defaults.sets}x${a.defaults.reps} @ ${a.defaults.weight}`,
      אימון_אחרון: a.last,
      הערות: a.notes.length ? a.notes : undefined,
    }))

  /** Trend background only — no notes, no per-set detail. Enough to say whether
   *  a weight is climbing or stuck, without competing for the model's attention
   *  with the period being reported on. */
  const background = (agg: Record<string, Agg>) =>
    Object.values(agg).sort(byCategory).map(a => ({
      תרגיל: a.name,
      ימי_אימון: a.days.size,
      סך_סטים: a.sets,
      טווח_משקל: range(a.weights),
      RIR_ממוצע: mean(a.rirs),
    }))

  // The report covers what has happened since the previous one. Falls back to
  // the last 7 days on a first run, when there is no previous report to anchor to.
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const focusFrom = seenParam ?? weekAgo.toISOString()
  let focusRows = logRows.filter(l => l.logged_at > focusFrom)
  let focusLabel = seenParam ? 'האימונים מאז הדוח הקודם' : 'השבוע האחרון'

  // A first report from someone who last trained more than a week ago would
  // otherwise have an empty focus window. Fall back to their most recent day.
  if (focusRows.length === 0) {
    const lastDay = latestLoggedAt.slice(0, 10)
    focusRows = logRows.filter(l => l.logged_at.slice(0, 10) === lastDay)
    focusLabel = `האימון האחרון (${lastDay})`
  }

  const focusSummary = detail(summarise(focusRows))
  const backgroundSummary = background(summarise(logRows))

  // ── Active plan structure, plus per-session adherence.
  //    The adherence detail is what lets the report distinguish an exercise
  //    that was moved to another day (machine busy) from one genuinely skipped,
  //    and from one absent for weeks. Without it the model can only guess.
  let planSummary: unknown = null
  let sessions: unknown[] = []
  let neglected: unknown[] = []

  if (plan) {
    const [{ data: workouts }, { data: links }] = await Promise.all([
      supabase.from('plan_workouts').select('id, name, day_of_week').eq('plan_id', plan.id),
      supabase
        .from('workout_plan_exercises')
        .select('exercise_id, workout_id, is_optional')
        .eq('plan_id', plan.id),
    ])
    const woName = new Map((workouts ?? []).map((w: any) => [w.id, w.name as string]))
    const byWorkout: Record<string, string[]> = {}
    /** workout name -> planned exercise ids, for the done/missing comparison */
    const plannedOf: Record<string, string[]> = {}
    /** exercise id -> the workout it belongs to */
    const workoutOfEx = new Map<string, string>()

    for (const l of links ?? []) {
      const key = (l.workout_id && woName.get(l.workout_id)) || 'ללא שיוך'
      const ex = exMap.get(l.exercise_id)
      if (!ex) continue
      ;(byWorkout[key] ??= []).push(ex.name_he + (l.is_optional ? ' (רשות)' : ''))
      ;(plannedOf[key] ??= []).push(l.exercise_id)
      workoutOfEx.set(l.exercise_id, key)
    }
    planSummary = {
      שם: plan.name,
      החל_מ: plan.start_date,
      מספר_אימונים_בשבוע: Object.keys(plannedOf).length,
      אימונים: byWorkout,
    }

    // Which training day was which workout: whichever workout most of that
    // day's exercises belong to.
    const daysInFocus = [...new Set(focusRows.map(l => l.logged_at.slice(0, 10)))].sort()
    const doneInFocus = new Set(focusRows.map(l => l.exercise_id))

    sessions = daysInFocus.map(day => {
      const dayRows = focusRows.filter(l => l.logged_at.slice(0, 10) === day)
      const counts: Record<string, number> = {}
      for (const l of dayRows) {
        const w = workoutOfEx.get(l.exercise_id)
        if (w) counts[w] = (counts[w] ?? 0) + 1
      }
      const workout = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      const doneToday = new Set(dayRows.map(l => l.exercise_id))
      const planned = workout ? plannedOf[workout] ?? [] : []

      const missing = planned.filter(id => !doneToday.has(id))
      return {
        תאריך: day,
        יום: WEEKDAYS[new Date(day + 'T12:00:00').getDay()],
        אימון: workout,
        בוצעו: dayRows.length,
        // Split deliberately: "done on another day" is not a skipped exercise,
        // and the report should not scold for a busy machine.
        חסרים_באותו_יום: missing.map(id => ({
          תרגיל: exMap.get(id)?.name_he ?? '?',
          בוצע_ביום_אחר_בתקופה: doneInFocus.has(id),
        })),
      }
    })

    // Planned exercises absent from the whole 28-day window, with how long.
    const lastSeen = new Map<string, string>()
    for (const l of logRows) {
      const d = l.logged_at.slice(0, 10)
      const prev = lastSeen.get(l.exercise_id)
      if (!prev || d > prev) lastSeen.set(l.exercise_id, d)
    }
    neglected = [...workoutOfEx.entries()]
      .filter(([id]) => !doneInFocus.has(id))
      .map(([id, workout]) => ({
        תרגיל: exMap.get(id)?.name_he ?? '?',
        אימון: workout,
        בוצע_לאחרונה: lastSeen.get(id) ?? `לא ב-${LOOKBACK_DAYS} הימים האחרונים`,
      }))
  }

  // ── Muscle volume, reusing the report's own aggregation
  const [{ data: mapRows }, { data: muscles }] = await Promise.all([
    supabase.from('exercise_muscle_groups_user').select('exercise_id, muscle_group_id, role'),
    supabase.from('muscle_groups').select('id, name_he'),
  ])
  const muscleName = new Map((muscles ?? []).map((m: any) => [m.id, m.name_he as string]))
  const byExercise = buildExerciseMuscleMap((mapRows ?? []) as MuscleLink[], muscleName)
  const { vol, weeks } = aggregateMuscleVolume(logRows as VolumeLog[], byExercise)

  const recentWeeks = weeks.slice(-4)
  const volumeSummary: Record<string, Record<string, number>> = {}
  for (const [muscle, byWeek] of Object.entries(vol)) {
    const row: Record<string, number> = {}
    for (const w of recentWeeks) if (byWeek[w]) row[w] = byWeek[w]
    if (Object.keys(row).length) volumeSummary[muscle] = row
  }

  const context = {
    מוקד_הדוח: focusLabel,
    שבוע_נוכחי: sundayOf(new Date().toISOString().slice(0, 10)),
    תוכנית_פעילה: planSummary,
    אימונים_בתקופה: sessions,
    תרגילים_שלא_בוצעו_בתקופה: neglected,
    תרגילים_בתקופת_המוקד: focusSummary,
    רקע_4_שבועות: backgroundSummary,
    הערה_על_הרקע: `רקע בלבד, ${LOOKBACK_DAYS} הימים האחרונים כולל תקופת המוקד. משמש להשוואת מגמה — האם משקל עולה, נתקע או יורד. הדוח עצמו עוסק בתקופת המוקד.`,
    נפח_שבועי_לפי_שריר: volumeSummary,
    הערה_על_נפח: 'סטים שבועיים. שריר ראשי = סט מלא, שריר משני = חצי סט. 10 סטים הוא מינימום אפקטיבי, 10-20 טווח מיטבי.',
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(ReportSchema),
      },
      messages: [{
        role: 'user',
        content: `הנה נתוני האימונים שלי. תן לי דוח.\n\n${JSON.stringify(context, null, 1)}`,
      }],
    })

    if (message.stop_reason === 'refusal') {
      res.status(200).json({ error: 'refused' })
      return
    }

    // parsed_output is null when the model's output failed schema validation.
    if (!message.parsed_output) {
      res.status(200).json({ error: 'empty_response' })
      return
    }

    // Stored as JSON in the same text column. The panel parses it, and falls
    // back to plain-text rendering for reports written before this change.
    const text = JSON.stringify(message.parsed_output)

    // Stored so the report follows the user across devices instead of living
    // in one browser. Written through the caller's token, so RLS decides whose
    // row this is — user_id cannot be forged from the client.
    const { data: saved, error: saveErr } = await supabase
      .from('coach_insights')
      .insert({
        user_id:          userData.user.id,
        text,
        latest_logged_at: latestLoggedAt,
        focus_label:      focusLabel,
        model:            MODEL,
      })
      .select('id, generated_at')
      .single()

    if (saveErr) {
      // The report is already paid for — hand it back rather than lose it, and
      // let the client display it without a stored id.
      console.error('coach-insights save failed', saveErr.message)
    }

    res.status(200).json({
      id:          saved?.id ?? null,
      text,
      generatedAt: saved?.generated_at ?? new Date().toISOString(),
      latestLoggedAt,
      focusLabel,
      saved:       !saveErr,
    })
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined
    console.error('coach-insights failed', status, err instanceof Error ? err.message : err)
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: 'bad_api_key' })
      return
    }
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'rate_limited' })
      return
    }
    res.status(502).json({ error: 'ai_failed' })
  }
}
