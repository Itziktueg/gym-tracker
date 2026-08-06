-- ============================================================
-- Repair RLS policies + grants for the workout plan tables.
-- Safe to run repeatedly. Run in the Supabase SQL editor.
--
-- Contains no CREATE TABLE, so it cannot abort on "already exists".
-- Ordered so the app-critical grants and user policies are applied
-- FIRST; anything optional comes last.
-- ============================================================

-- ── 1. RLS on ───────────────────────────────────────────────
ALTER TABLE workout_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plan_exercises ENABLE ROW LEVEL SECURITY;

-- ── 2. Grants (denied before RLS is even consulted) ─────────
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plans          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plan_exercises TO authenticated;

-- ── 3. User policies — workout_plans ────────────────────────
DROP POLICY IF EXISTS "users read own plans"   ON workout_plans;
DROP POLICY IF EXISTS "users insert own plans" ON workout_plans;
DROP POLICY IF EXISTS "users update own plans" ON workout_plans;
DROP POLICY IF EXISTS "users delete own plans" ON workout_plans;

CREATE POLICY "users read own plans"
  ON workout_plans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own plans"
  ON workout_plans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own plans"
  ON workout_plans FOR UPDATE USING (auth.uid() = user_id)
                            WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own plans"
  ON workout_plans FOR DELETE USING (auth.uid() = user_id);

-- ── 4. User policies — workout_plan_exercises ───────────────
DROP POLICY IF EXISTS "users read own plan exercises"   ON workout_plan_exercises;
DROP POLICY IF EXISTS "users insert own plan exercises" ON workout_plan_exercises;
DROP POLICY IF EXISTS "users delete own plan exercises" ON workout_plan_exercises;

CREATE POLICY "users read own plan exercises"
  ON workout_plan_exercises FOR SELECT
  USING (EXISTS (SELECT 1 FROM workout_plans p
                 WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "users insert own plan exercises"
  ON workout_plan_exercises FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM workout_plans p
                      WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "users delete own plan exercises"
  ON workout_plan_exercises FOR DELETE
  USING (EXISTS (SELECT 1 FROM workout_plans p
                 WHERE p.id = plan_id AND p.user_id = auth.uid()));

-- ── 5. Optional admin read policies ─────────────────────────
-- Defined last, and is_admin() is (re)created first, so a missing
-- helper cannot abort the critical steps above.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

DROP POLICY IF EXISTS "admins read all plans"          ON workout_plans;
DROP POLICY IF EXISTS "admins read all plan exercises" ON workout_plan_exercises;

CREATE POLICY "admins read all plans"
  ON workout_plans FOR SELECT USING (is_admin());

CREATE POLICY "admins read all plan exercises"
  ON workout_plan_exercises FOR SELECT USING (is_admin());

-- ── 6. Report — expect 9 policy rows and 8 grant rows ───────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('workout_plans', 'workout_plan_exercises')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('workout_plans', 'workout_plan_exercises')
  AND grantee = 'authenticated'
ORDER BY table_name, privilege_type;
