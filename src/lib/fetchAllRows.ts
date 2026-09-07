/**
 * Supabase/PostgREST returns at most 1000 rows per request, silently — no error,
 * just a short result. Any report that reads a whole history must page, or it
 * quietly loses data once the table grows past that. With an ascending sort the
 * rows lost are the most recent ones, so the report looks fine except that
 * recent workouts are missing.
 *
 * Pass a builder that applies .range(from, to) to your query:
 *
 *   const logs = await fetchAllRows((f, t) => supabase
 *     .from('workout_logs').select('...').eq('user_id', id).range(f, t))
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const SIZE = 1000
  const out: T[] = []
  for (let from = 0; ; from += SIZE) {
    const { data } = await page(from, from + SIZE - 1)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < SIZE) break
  }
  return out
}
