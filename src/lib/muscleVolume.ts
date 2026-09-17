/** Weekly set-volume per muscle, shared by the נפח לפי שריר report and the AI
 *  coach endpoint so both describe training balance the same way.
 *
 *  Counts sets, not reps x weight, which is why time-based exercises stay in:
 *  a plank set is real core stimulus. See the is_time_based exclusion in the
 *  intensity reports for the opposite case. */

export interface VolumeLog {
  exercise_id: string
  logged_at: string
  sets_completed: number | null
}

export interface MuscleLink {
  exercise_id: string
  muscle_group_id: string
  role: string | null
}

export function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function sundayOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - dt.getDay())
  return toISODate(dt)
}

/** exercise id -> the muscles it trains and how much each set counts for. */
export function buildExerciseMuscleMap(
  links: MuscleLink[],
  muscleName: Map<string, string>,
): Record<string, { muscle: string; w: number }[]> {
  const byExercise: Record<string, { muscle: string; w: number }[]> = {}
  for (const r of links) {
    const name = muscleName.get(r.muscle_group_id)
    if (!name) continue
    ;(byExercise[r.exercise_id] ??= []).push({
      muscle: name,
      w: r.role === 'primary' ? 1 : 0.5,   // secondary counts half
    })
  }
  return byExercise
}

/** muscle -> week (Sunday ISO) -> sets. Exercises with no muscle mapping,
 *  cardio for instance, are deliberately skipped rather than bucketed. */
export function aggregateMuscleVolume(
  logs: VolumeLog[],
  byExercise: Record<string, { muscle: string; w: number }[]>,
): { vol: Record<string, Record<string, number>>; weeks: string[] } {
  const acc: Record<string, Record<string, number>> = {}
  const weekSet = new Set<string>()

  for (const l of logs) {
    const links = byExercise[l.exercise_id]
    if (!links) continue
    const wk = sundayOf(l.logged_at.slice(0, 10))
    weekSet.add(wk)
    const sets = l.sets_completed ?? 1
    for (const { muscle, w } of links) {
      acc[muscle] ??= {}
      acc[muscle][wk] = (acc[muscle][wk] ?? 0) + sets * w
    }
  }

  return { vol: acc, weeks: [...weekSet].sort() }
}
