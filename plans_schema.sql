-- ============================================================
-- WORKOUT PLANS — run once in the Supabase SQL editor
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────
CREATE TABLE workout_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       text,
  start_date date NOT NULL,
  end_date   date,                       -- NULL = currently active
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX workout_plans_user_start_idx ON workout_plans (user_id, start_date DESC);

-- Only one open plan per user
CREATE UNIQUE INDEX workout_plans_one_active_idx
  ON workout_plans (user_id) WHERE end_date IS NULL;

CREATE TABLE workout_plan_exercises (
  plan_id     uuid NOT NULL REFERENCES workout_plans  ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises_user ON DELETE CASCADE,
  PRIMARY KEY (plan_id, exercise_id)
);

ALTER TABLE workout_plan_exercises ENABLE ROW LEVEL SECURITY;

-- ── RLS: workout_plans ──────────────────────────────────────
CREATE POLICY "users read own plans"
  ON workout_plans FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own plans"
  ON workout_plans FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own plans"
  ON workout_plans FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users delete own plans"
  ON workout_plans FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "admins read all plans"
  ON workout_plans FOR SELECT USING (is_admin());

-- ── RLS: workout_plan_exercises ─────────────────────────────
CREATE POLICY "users read own plan exercises"
  ON workout_plan_exercises FOR SELECT
  USING (EXISTS (SELECT 1 FROM workout_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "users insert own plan exercises"
  ON workout_plan_exercises FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM workout_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "users delete own plan exercises"
  ON workout_plan_exercises FOR DELETE
  USING (EXISTS (SELECT 1 FROM workout_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE POLICY "admins read all plan exercises"
  ON workout_plan_exercises FOR SELECT USING (is_admin());

-- ── Grants ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plans          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_plan_exercises TO authenticated;

-- ============================================================
-- SEED — register every user's current exercises as "תוכנית 1"
-- ============================================================
-- NOTE: do NOT run the seed from the Supabase SQL editor. The policies on
-- exercises_user are USING (auth.uid() = user_id), and auth.uid() is NULL
-- there, so the SELECT below matches zero rows and the INSERT silently
-- inserts nothing. The DDL above is unaffected — only this data step is.
--
-- Run seed_plan1.mjs instead (service role key bypasses RLS). It is
-- idempotent: users that already have an active plan are skipped.
--
--   node seed_plan1.mjs
--
-- Kept here for reference only:
--
-- INSERT INTO workout_plans (user_id, name, start_date)
-- SELECT DISTINCT user_id, 'תוכנית 1', CURRENT_DATE
-- FROM exercises_user WHERE is_active = true;
--
-- INSERT INTO workout_plan_exercises (plan_id, exercise_id)
-- SELECT p.id, e.id FROM workout_plans p
-- JOIN exercises_user e ON e.user_id = p.user_id AND e.is_active = true
-- WHERE p.end_date IS NULL;
