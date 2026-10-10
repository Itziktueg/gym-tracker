/**
 * What kind of activity an exercise is, decided by its category.
 *
 * Strength is the original model: sets x reps x weight. Cardio and stretching
 * are logged as one continuous session instead - a duration, plus a distance
 * (running, cycling...) or a floor count (stair climbing). They carry
 * is_time_based = true as well, which is what keeps them out of the intensity
 * and volume sums that would otherwise add minutes to repetitions.
 *
 * Plank is NOT one of these: it is still sets x seconds x weight, and stays on
 * the strength layout.
 */

export const CARDIO_CATEGORY  = 'אירובי'
export const STRETCH_CATEGORY = 'מתיחות / יוגה'

export type ActivityKind = 'strength' | 'cardio' | 'stretch'

export function activityKind(category: string | null | undefined): ActivityKind {
  if (category === CARDIO_CATEGORY)  return 'cardio'
  if (category === STRETCH_CATEGORY) return 'stretch'
  return 'strength'
}

/** True for the session-style activities that have no sets, reps or weight. */
export const isSession = (category: string | null | undefined) =>
  activityKind(category) !== 'strength'

/** Body-part categories first, in the order every report uses, then these. */
export const SESSION_CATEGORIES = [CARDIO_CATEGORY, STRETCH_CATEGORY]

/** Tailwind classes per category for the new kinds, matching the palette the
 *  other four use (band = solid fill, accent = hex for inline borders). */
export const SESSION_STYLE: Record<string, { band: string; accent: string }> = {
  [CARDIO_CATEGORY]:  { band: 'bg-rose-500',    accent: '#f43f5e' },
  [STRETCH_CATEGORY]: { band: 'bg-emerald-500', accent: '#10b981' },
}

/** 1800 -> "30 דק'", 3900 -> "1:05 ש'". Whole minutes; a session is not timed
 *  to the second. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—'
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} דק'`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')} ש'`
}

const trim = (n: number) => (n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100))

export interface SessionValues {
  duration_seconds: number | null
  distance_km: number | null
  floors_count: number | null
}

/** "30 דק' · 5 ק"מ" - the one-line form used wherever a session is shown. */
export function describeSession(v: SessionValues): string {
  const parts: string[] = []
  if (v.duration_seconds) parts.push(fmtDuration(v.duration_seconds))
  if (v.distance_km)      parts.push(`${trim(v.distance_km)} ק"מ`)
  if (v.floors_count)     parts.push(`${v.floors_count} קומות`)
  return parts.join(' · ') || '—'
}
