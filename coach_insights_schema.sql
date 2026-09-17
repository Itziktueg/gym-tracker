-- ============================================================
-- COACH INSIGHTS — generated coaching reports, one row per report
--
-- Fully idempotent: every statement is IF NOT EXISTS or
-- DROP-then-CREATE, so re-running cannot abort partway and leave
-- RLS enabled with zero policies (which denies everything —
-- empty SELECTs and rejected INSERTs). That failure happened on
-- 2026-08-06 with the plan tables; see plans_fix_rls.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS coach_insights (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  text             text NOT NULL,
  -- Newest workout that existed when this was generated. The usage gate
  -- compares it against the current newest log, so one report is earned
  -- per completed workout — now shared across devices rather than per browser.
  latest_logged_at timestamptz NOT NULL,
  focus_label      text,
  model            text
);

CREATE INDEX IF NOT EXISTS coach_insights_user_time_idx
  ON coach_insights (user_id, generated_at DESC);

ALTER TABLE coach_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_insights_select" ON coach_insights;
DROP POLICY IF EXISTS "coach_insights_insert" ON coach_insights;
DROP POLICY IF EXISTS "coach_insights_delete" ON coach_insights;

CREATE POLICY "coach_insights_select" ON coach_insights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "coach_insights_insert" ON coach_insights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Deliberately no UPDATE policy: a report is a record of what the coach
-- said at a point in time. It can be deleted, never rewritten.
CREATE POLICY "coach_insights_delete" ON coach_insights
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON coach_insights TO authenticated;

-- Supabase grants anon by default on new public tables. RLS already returns
-- nothing to it (auth.uid() is NULL, so no policy matches), but this table has
-- no anonymous use case at all, and a stray grant is how workout_logs_view
-- ended up readable with the public key.
REVOKE ALL ON coach_insights FROM anon;
