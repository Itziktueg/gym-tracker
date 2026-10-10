-- ============================================================
-- GENERAL NOTES - free-text notes not attached to any exercise
--
-- A note about a colonoscopy, a bad week at work, a cold. workout_logs.notes
-- cannot hold these: that column lives on a set row, so a note with no
-- workout to attach to had nowhere to go.
--
-- Fully idempotent (IF NOT EXISTS, DROP-then-CREATE for policies) so a re-run
-- cannot abort partway and leave RLS on with zero policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS general_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  note_date  date NOT NULL DEFAULT current_date,
  text       text NOT NULL CHECK (length(btrim(text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS general_notes_user_date_idx
  ON general_notes (user_id, note_date DESC);

ALTER TABLE general_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "general_notes_select" ON general_notes;
DROP POLICY IF EXISTS "general_notes_insert" ON general_notes;
DROP POLICY IF EXISTS "general_notes_update" ON general_notes;
DROP POLICY IF EXISTS "general_notes_delete" ON general_notes;

-- Admins read everyone's, as they do for workout_logs notes; only the author
-- can write, edit or delete.
CREATE POLICY "general_notes_select" ON general_notes
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "general_notes_insert" ON general_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "general_notes_update" ON general_notes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "general_notes_delete" ON general_notes
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON general_notes TO authenticated;
REVOKE ALL ON general_notes FROM anon;
