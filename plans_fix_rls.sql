-- ============================================================
-- RLS policies for the workout plan tables.
-- These are the policies actually deployed (verified 2026-08-06).
-- Idempotent — safe to run repeatedly.
--
-- Deliberately minimal: no CREATE TABLE, no function dependencies,
-- nothing that can abort partway and leave RLS enabled with zero
-- policies (which denies everything: empty SELECTs, rejected INSERTs).
-- ============================================================

ALTER TABLE workout_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plan_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_select"   ON workout_plans;
DROP POLICY IF EXISTS "plans_insert"   ON workout_plans;
DROP POLICY IF EXISTS "plans_update"   ON workout_plans;
DROP POLICY IF EXISTS "plans_delete"   ON workout_plans;
DROP POLICY IF EXISTS "plan_ex_select" ON workout_plan_exercises;
DROP POLICY IF EXISTS "plan_ex_insert" ON workout_plan_exercises;
DROP POLICY IF EXISTS "plan_ex_delete" ON workout_plan_exercises;

CREATE POLICY "plans_select" ON workout_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "plans_insert" ON workout_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_update" ON workout_plans
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_delete" ON workout_plans
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "plan_ex_select" ON workout_plan_exercises
  FOR SELECT USING (EXISTS (SELECT 1 FROM workout_plans p
    WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "plan_ex_insert" ON workout_plan_exercises
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM workout_plans p
    WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "plan_ex_delete" ON workout_plan_exercises
  FOR DELETE USING (EXISTS (SELECT 1 FROM workout_plans p
    WHERE p.id = plan_id AND p.user_id = auth.uid()));

-- NOTE: no admin read policy exists on these tables yet. Admin-facing
-- plan reports will need one added before they can read other users'
-- plans, the way exercises_user has "admins read all user exercises".

-- Verify: expect 4, 3, 7, true
SELECT
  (SELECT count(*) FROM pg_policies WHERE tablename = 'workout_plans')          AS plan_policies,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'workout_plan_exercises') AS link_policies,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_name = 'workout_plans' AND grantee = 'authenticated')          AS plan_grants,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'workout_plans')         AS rls_enabled;
