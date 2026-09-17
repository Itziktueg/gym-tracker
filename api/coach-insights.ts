import Anthropic from '@anthropic-ai/sdk'
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
הדוח עוסק בתקופת המוקד — האימונים האחרונים, מאז הדוח הקודם. נתוני ארבעת השבועות מופיעים כרקע בלבד, כדי שתוכל לומר אם משקל עולה, נתקע או יורד. אל תסכם מחדש את כל החודש: אם תרגיל לא בוצע בתקופת המוקד, אל תעסוק בו אלא אם הוא נעדר באופן שראוי לציין.

מבנה התשובה — בדיוק שני חלקים:
## מבט לאחור
פסקה קצרה על תקופת המוקד: מה קרה באימונים האחרונים, מה בלט לטובה ומה לרעה. השווה לרקע רק כשזה מוסיף משהו — "שלישי ברציפות באותו משקל" או "עלייה ראשונה מזה שלושה שבועות".

## מבט קדימה
המלצות ממוספרות וקונקרטיות לאימונים הקרובים — מה לשנות בפעם הבאה, עם שמות תרגילים ומספרים.

זה פאנל בתוך אפליקציה, לא דוח ארוך. תהיה תמציתי.`

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

  // ── Active plan structure
  let planSummary: unknown = null
  if (plan) {
    const [{ data: workouts }, { data: links }] = await Promise.all([
      supabase.from('plan_workouts').select('id, name, day_of_week').eq('plan_id', plan.id),
      supabase
        .from('workout_plan_exercises')
        .select('exercise_id, workout_id, is_optional')
        .eq('plan_id', plan.id),
    ])
    const woName = new Map((workouts ?? []).map((w: any) => [w.id, w.name]))
    const byWorkout: Record<string, string[]> = {}
    for (const l of links ?? []) {
      const key = (l.workout_id && woName.get(l.workout_id)) || 'ללא שיוך'
      const ex = exMap.get(l.exercise_id)
      if (!ex) continue
      ;(byWorkout[key] ??= []).push(ex.name_he + (l.is_optional ? ' (רשות)' : ''))
    }
    planSummary = { שם: plan.name, החל_מ: plan.start_date, אימונים: byWorkout }
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
    תרגילים_בתקופת_המוקד: focusSummary,
    רקע_4_שבועות: backgroundSummary,
    הערה_על_הרקע: `רקע בלבד, ${LOOKBACK_DAYS} הימים האחרונים כולל תקופת המוקד. משמש להשוואת מגמה — האם משקל עולה, נתקע או יורד. הדוח עצמו עוסק בתקופת המוקד.`,
    נפח_שבועי_לפי_שריר: volumeSummary,
    הערה_על_נפח: 'סטים שבועיים. שריר ראשי = סט מלא, שריר משני = חצי סט. 10 סטים הוא מינימום אפקטיבי, 10-20 טווח מיטבי.',
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [{
        role: 'user',
        content: `הנה נתוני האימונים שלי. תן לי מבט לאחור ומבט קדימה.\n\n${JSON.stringify(context, null, 1)}`,
      }],
    })

    if (message.stop_reason === 'refusal') {
      res.status(200).json({ error: 'refused' })
      return
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    if (!text) {
      res.status(200).json({ error: 'empty_response' })
      return
    }

    res.status(200).json({
      text,
      generatedAt: new Date().toISOString(),
      latestLoggedAt,
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
