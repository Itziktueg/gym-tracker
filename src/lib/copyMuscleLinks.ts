import { supabase } from './supabase'

/**
 * Copies an exercise's muscle-group assignments from the global library to the
 * user's own copy.
 *
 * Copying the exercise row alone is not enough, and the omission is silent: an
 * exercise with no muscle rows is counted nowhere in נפח לפי שריר, so that
 * report simply under-reports instead of failing. Six of eight users had no
 * muscle data at all before this was noticed and backfilled on 2026-10-01.
 *
 * Call this from every place that copies global → user. Safe to call twice:
 * the junction table's primary key is (exercise_id, muscle_group_id) and
 * duplicates are ignored.
 */
export async function copyMuscleLinks(
  pairs: { userExerciseId: string; globalExerciseId: string }[],
): Promise<void> {
  if (pairs.length === 0) return

  const globalIds = [...new Set(pairs.map(p => p.globalExerciseId))]
  const { data: links } = await supabase
    .from('exercise_muscle_groups')
    .select('exercise_id, muscle_group_id, role')
    .in('exercise_id', globalIds)

  if (!links || links.length === 0) return

  // One global exercise can be the source for several user rows
  const byGlobal: Record<string, typeof links> = {}
  for (const l of links) (byGlobal[l.exercise_id] ??= []).push(l)

  const rows = pairs.flatMap(p =>
    (byGlobal[p.globalExerciseId] ?? []).map(l => ({
      exercise_id:     p.userExerciseId,
      muscle_group_id: l.muscle_group_id,
      role:            l.role,
    })),
  )

  if (rows.length === 0) return

  const { error } = await supabase
    .from('exercise_muscle_groups_user')
    .upsert(rows, { onConflict: 'exercise_id,muscle_group_id', ignoreDuplicates: true })

  // Not thrown: failing to copy must not block adding the exercise. But it is
  // logged — an unreported failure here is how the data went missing in the
  // first place, and the only symptom is a report quietly reading low.
  if (error) console.error('copyMuscleLinks failed', error.message)
}
