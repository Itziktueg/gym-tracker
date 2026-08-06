-- ============================================================
-- Repair RLS policies + grants for the workout plan tables.
-- Safe to run repeatedly. Run this in the Supabase SQL editor.
-- (DDL is unaffected by auth.uid() being NULL there — unlike the
--  data seed, which is why that one had to move to seed_plan1.mjs.)
-- ============================================================

ALTER TABLE workout_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plan_exercises ENABLE ROW LEVEL SECURITY;

-- ── workout_plans ───────────────────────────────────────────
DROP POLICY IF EXISTS "users read own plans"   ON workout_plans;
DROP POLICY IF EXISTS "users insert own plans" ON workout_plans;
DROP POLICY IF EXISTS "users update own plans" ON workout_plans;
DROP POLICY IF EXISTS "users delete own plans" ON workout_plans;
DROP POLICY IF EXISTS "admins read all plans"  ON workout_plans;

CREATE POLICY "users read own plans"
  ON workout_plans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own plans"
  ON workout_plans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own plans"
  ON workout_plans FOR UPDATE USING (auth.uid() = user_id)
                            WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own plans"
  ON workout_plans FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "admins read all plans"
  ON workout_plans FOR SELECT USING (is_admin());

-- ── workout_plan_exercises ──────────────────────────────────
DROP POLICY IF EXISTS "users read own plan exercises"   ON workout_plan_exercises;
DROP POLICY IF EXISTS "users insert own plan exercises" ON workout_plan_exercises;
DROP POLICY IF EXISTS "users delete own plan exercises" ON workout_plan_exercises;
DROP POLICY IF EXISTS "admins read all plan exercises"  ON workout_plan_exercises;

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

CREATE POLICY "admins read all plan exercises"
  ON workout_plan_exercises FOR SELECT USING (is_admin());

-- ── Grants (missing grants deny access before RLS is consulted) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plans          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plan_exercises TO authenticated;

-- ── Report: should list 9 policies and 8 grant rows ─────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('workout_plans', 'workout_plan_exercises')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('workout_plans', 'workout_plan_exercises')
  AND grantee = 'authenticated'
ORDER BY table_name, privilege_type;
