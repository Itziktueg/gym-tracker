import { supabase } from './supabase'

/**
 * Exercise ids whose logs must stay out of volume / intensity aggregations.
 *
 * A time-based exercise (פלאנק and friends) is logged with seconds in the reps
 * field, so reps × weight produces a number in the same column as real lifts
 * but in a different unit — three plank rows currently carry ~12,000 intensity,
 * more than a full week of lifting. Those rows are dropped from the sums rather
 * than converted or estimated; nothing here changes how a single set is shown.
 *
 * Pass one user id for the personal reports, or several for the admin ones.
 */
export async function fetchTimeBasedIds(
  userId: string | string[],
): Promise<Set<string>> {
  const q = supabase.from('exercises_user').select('id').eq('is_time_based', true)

  const { data } = Array.isArray(userId)
    ? await q.in('user_id', userId)
    : await q.eq('user_id', userId)

  return new Set((data ?? []).map(r => r.id))
}
