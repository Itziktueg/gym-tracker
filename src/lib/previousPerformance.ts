/**
 * "Last time" for an exercise: the sets from the most recent earlier day it was
 * done, shown in the log sheet as  קודם (27/9): 14/53 · 14/53 · 14/53
 *
 * Pure on purpose: the sheet fetches the rows, this decides what they mean, and
 * it can be checked against real data without a signed-in session.
 */

export interface PrevRow {
  logged_at: string
  sets_completed: number | null
  reps_completed: number | null
  weight: number | null
  duration_seconds: number | null
  distance_km: number | null
  steps_count: number | null
}

export interface PreviousPerformance {
  /** Local date of that session, YYYY-MM-DD */
  date: string
  /** One entry per set, in the order the rows came back */
  sets: { reps: number; weight: number }[]
  /** Cardio / stretching: the single session, instead of sets */
  session: { duration_seconds: number | null; distance_km: number | null; steps_count: number | null } | null
}

function localDate(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Rows must already be limited to this exercise and to days before the one
 *  being logged, newest first. Returns null when there is no earlier day. */
export function buildPrevious(rows: PrevRow[]): PreviousPerformance | null {
  if (rows.length === 0) return null

  const date = localDate(rows[0].logged_at)
  const sameDay = rows.filter(r => localDate(r.logged_at) === date)

  const isSession = sameDay.some(r => r.duration_seconds != null)
  if (isSession) {
    const r = sameDay[0]
    return {
      date, sets: [],
      session: {
        duration_seconds: r.duration_seconds,
        distance_km: r.distance_km,
        steps_count: r.steps_count,
      },
    }
  }

  // Current data is one row per set. Older rows hold several sets in one row,
  // so those are expanded - capped, since a corrupt count must not flood the line.
  const sets: PreviousPerformance['sets'] = []
  for (const r of sameDay) {
    const n = Math.min(Math.max(r.sets_completed ?? 1, 1), 10)
    for (let i = 0; i < n; i++) {
      sets.push({ reps: r.reps_completed ?? 0, weight: r.weight ?? 0 })
    }
  }
  return { date, sets, session: null }
}

/** "27/9" - day then month, no year, as written in the sketch this came from. */
export function shortDay(iso: string) {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}
