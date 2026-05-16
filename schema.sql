-- ============================================================
-- GYM TRACKER — DATABASE SCHEMA
-- ============================================================

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email              text NOT NULL,
  role               text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  rest_timer_seconds int  NOT NULL DEFAULT 90,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- MUSCLE GROUPS
-- ============================================================
CREATE TABLE muscle_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he    text NOT NULL,
  name_en    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE muscle_groups ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- EXERCISES GLOBAL (master library, admin-managed)
-- ============================================================
CREATE TABLE exercises_global (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he        text    NOT NULL,
  name_en        text    NOT NULL,
  image_url      text,
  video_url      text,
  default_sets   int     NOT NULL DEFAULT 3,
  default_reps   int     NOT NULL DEFAULT 12,
  default_weight numeric NOT NULL DEFAULT 0,
  is_bilateral   boolean NOT NULL DEFAULT false,
  notes          text,
  category       text,
  sort_order     int     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exercises_global ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- EXERCISE MUSCLE GROUPS (global exercise ↔ muscle group)
-- ============================================================
CREATE TABLE exercise_muscle_groups (
  exercise_id     uuid NOT NULL REFERENCES exercises_global ON DELETE CASCADE,
  muscle_group_id uuid NOT NULL REFERENCES muscle_groups    ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'secondary')),
  PRIMARY KEY (exercise_id, muscle_group_id)
);

ALTER TABLE exercise_muscle_groups ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- EXERCISES USER (per-user personal library)
-- ============================================================
CREATE TABLE exercises_user (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid    NOT NULL REFERENCES auth.users     ON DELETE CASCADE,
  global_exercise_id uuid             REFERENCES exercises_global ON DELETE SET NULL,
  name_he            text    NOT NULL,
  name_en            text,
  image_url          text,
  video_url          text,
  default_sets       int     NOT NULL DEFAULT 3,
  default_reps       int     NOT NULL DEFAULT 12,
  default_weight     numeric NOT NULL DEFAULT 0,
  is_bilateral       boolean NOT NULL DEFAULT false,
  notes              text,
  category           text,
  sort_order         int     NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exercises_user ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WORKOUT LOGS
-- ============================================================
CREATE TABLE workout_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid    NOT NULL REFERENCES auth.users    ON DELETE CASCADE,
  exercise_id    uuid    NOT NULL REFERENCES exercises_user ON DELETE CASCADE,
  sets_completed int     NOT NULL DEFAULT 0,
  reps_completed int     NOT NULL DEFAULT 0,
  weight         numeric NOT NULL DEFAULT 0,
  notes          text,
  logged_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: admin check (used in RLS policies)
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- HELPER: copy global exercises into a user's personal library
-- Call this once after a user's first login
-- ============================================================
CREATE OR REPLACE FUNCTION copy_global_exercises_to_user(target_user_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO exercises_user (
    user_id, global_exercise_id, name_he, name_en,
    image_url, video_url, default_sets, default_reps,
    default_weight, is_bilateral, notes, category, sort_order
  )
  SELECT
    target_user_id, id, name_he, name_en,
    image_url, video_url, default_sets, default_reps,
    default_weight, is_bilateral, notes, category, sort_order
  FROM exercises_global
  ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS POLICIES — profiles
-- ============================================================
CREATE POLICY "users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "admins read all profiles"
  ON profiles FOR SELECT USING (is_admin());

-- ============================================================
-- RLS POLICIES — muscle_groups (public read)
-- ============================================================
CREATE POLICY "anyone reads muscle groups"
  ON muscle_groups FOR SELECT USING (true);

CREATE POLICY "admins manage muscle groups"
  ON muscle_groups FOR ALL USING (is_admin());

-- ============================================================
-- RLS POLICIES — exercises_global (public read, admin write)
-- ============================================================
CREATE POLICY "anyone reads global exercises"
  ON exercises_global FOR SELECT USING (true);

CREATE POLICY "admins manage global exercises"
  ON exercises_global FOR ALL USING (is_admin());

-- ============================================================
-- RLS POLICIES — exercise_muscle_groups (public read, admin write)
-- ============================================================
CREATE POLICY "anyone reads exercise muscle groups"
  ON exercise_muscle_groups FOR SELECT USING (true);

CREATE POLICY "admins manage exercise muscle groups"
  ON exercise_muscle_groups FOR ALL USING (is_admin());

-- ============================================================
-- RLS POLICIES — exercises_user
-- ============================================================
CREATE POLICY "users read own exercises"
  ON exercises_user FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own exercises"
  ON exercises_user FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own exercises"
  ON exercises_user FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users delete own exercises"
  ON exercises_user FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "admins read all user exercises"
  ON exercises_user FOR SELECT USING (is_admin());

-- ============================================================
-- RLS POLICIES — workout_logs
-- ============================================================
CREATE POLICY "users read own logs"
  ON workout_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own logs"
  ON workout_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own logs"
  ON workout_logs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users delete own logs"
  ON workout_logs FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- SEED DATA — 19 muscle groups
-- ============================================================
INSERT INTO muscle_groups (id, name_he, name_en) VALUES
  ('11111111-0001-0000-0000-000000000000', 'ארבע-ראשי',      'Quadriceps'),
  ('11111111-0002-0000-0000-000000000000', 'המסטרינג',       'Hamstrings'),
  ('11111111-0003-0000-0000-000000000000', 'מקרבי הירך',     'Adductors'),
  ('11111111-0004-0000-0000-000000000000', 'מרחיקי הירך',    'Abductors'),
  ('11111111-0005-0000-0000-000000000000', 'ישבן',           'Gluteus Maximus'),
  ('11111111-0006-0000-0000-000000000000', 'שוקיים',         'Calves'),
  ('11111111-0007-0000-0000-000000000000', 'רחב גבי',        'Latissimus Dorsi'),
  ('11111111-0008-0000-0000-000000000000', 'טרפז',           'Trapezius'),
  ('11111111-0009-0000-0000-000000000000', 'מעוין',          'Rhomboids'),
  ('11111111-0010-0000-0000-000000000000', 'זוקפי הגב',      'Erector Spinae'),
  ('11111111-0011-0000-0000-000000000000', 'כתף קדמית',      'Anterior Deltoid'),
  ('11111111-0012-0000-0000-000000000000', 'כתף צידית',      'Lateral Deltoid'),
  ('11111111-0013-0000-0000-000000000000', 'כתף אחורית',     'Posterior Deltoid'),
  ('11111111-0014-0000-0000-000000000000', 'חזה גדול',       'Pectoralis Major'),
  ('11111111-0015-0000-0000-000000000000', 'חזה קטן',        'Pectoralis Minor'),
  ('11111111-0016-0000-0000-000000000000', 'דו-ראשי זרועי',  'Biceps Brachii'),
  ('11111111-0017-0000-0000-000000000000', 'תלת-ראשי זרועי', 'Triceps Brachii'),
  ('11111111-0018-0000-0000-000000000000', 'ישר בטני',       'Rectus Abdominis'),
  ('11111111-0019-0000-0000-000000000000', 'אלכסונים',       'Obliques');

-- ============================================================
-- SEED DATA — 14 exercises
-- ============================================================
INSERT INTO exercises_global (id, name_he, name_en, video_url, category, sort_order) VALUES
  ('22222222-0001-0000-0000-000000000000', 'רגליים דחיפה (מכונה)',              'Lever Seated Leg Press',        'https://exrx.net/WeightExercises/Quadriceps/LVSeatedLegPress',           'פלג גוף תחתון',  1),
  ('22222222-0002-0000-0000-000000000000', 'רגל הרמה (פשיטת ברכיים)',           'Lever Leg Extension',           'https://exrx.net/WeightExercises/Quadriceps/LVLegExtension',             'פלג גוף תחתון',  2),
  ('22222222-0003-0000-0000-000000000000', 'רגליים הורדה (כפיפת ברכיים בישיבה)', 'Lever Seated Leg Curl',        'https://exrx.net/WeightExercises/Hamstrings/LVSeatedLegCurl',           'פלג גוף תחתון',  3),
  ('22222222-0004-0000-0000-000000000000', 'סגירת רגליים (קירוב ירך)',           'Lever Seated Hip Adduction',    'https://exrx.net/WeightExercises/HipAdductors/LVSeatedHipAdduction',    'פלג גוף תחתון',  4),
  ('22222222-0005-0000-0000-000000000000', 'פתיחת רגליים (הרחקת ירך)',          'Lever Seated Hip Abduction',    'https://exrx.net/WeightExercises/HipAbductor/LVSeatedHipAbduction',     'פלג גוף תחתון',  5),
  ('22222222-0006-0000-0000-000000000000', 'משיכה (פולי עליון)',                 'Cable Pulldown',                'https://exrx.net/WeightExercises/LatissimusDorsi/CBFrontPulldown',      'גב וכתפיים',     6),
  ('22222222-0007-0000-0000-000000000000', 'דחיפה למעלה (לחיצת כתפיים במכונה)', 'Lever Shoulder Press',         'https://exrx.net/WeightExercises/DeltoidAnterior/LVShoulderPress',      'גב וכתפיים',     7),
  ('22222222-0008-0000-0000-000000000000', 'גב תחתון (פשיטת גו)',               'Weighted Hyperextension',       'https://exrx.net/WeightExercises/ErectorSpinae/WtHyperextension',       'גב וכתפיים',     8),
  ('22222222-0009-0000-0000-000000000000', 'גב צידי (פשיטה צידית)',             'Weighted 45° Side Bend',        'https://exrx.net/WeightExercises/Obliques/WT45SideBend',                'גב וכתפיים',     9),
  ('22222222-0010-0000-0000-000000000000', 'חזה דחיקה פנימה (פרפר במכונה)',     'Lever Pec Deck Fly',            'https://exrx.net/WeightExercises/PectoralSternal/LVPecDeckFly',         'חזה וזרועות',   10),
  ('22222222-0011-0000-0000-000000000000', 'זרוע קדמית (כפיפת מרפקים)',         'Dumbbell Curl',                 'https://exrx.net/WeightExercises/Biceps/DBCurl',                         'חזה וזרועות',   11),
  ('22222222-0012-0000-0000-000000000000', 'זרוע אחורית (פשיטת מרפקים)',        'Lever Triceps Extension',       'https://exrx.net/WeightExercises/Triceps/LVTriExt',                      'חזה וזרועות',   12),
  ('22222222-0013-0000-0000-000000000000', 'בטן קדמית (כפיפות בטן במכונה)',     'Lever Seated Crunch',           'https://exrx.net/WeightExercises/RectusAbdominis/LVSeatedCrunch',       'בטן וליבה',     13),
  ('22222222-0014-0000-0000-000000000000', 'בטן צידית (רוטציה של המותן)',        'Lever Seated Twist',            'https://exrx.net/WeightExercises/Obliques/LVTwist',                      'בטן וליבה',     14);

-- ============================================================
-- GRANTS — allow authenticated users to access tables
-- ============================================================
GRANT SELECT ON exercises_global        TO authenticated, anon;
GRANT SELECT ON muscle_groups           TO authenticated, anon;
GRANT SELECT ON exercise_muscle_groups  TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE            ON profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE    ON exercises_user  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE    ON workout_logs    TO authenticated;

-- ============================================================
-- SEED DATA — exercise ↔ muscle group links
-- ============================================================
INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, role) VALUES
  -- Leg Press
  ('22222222-0001-0000-0000-000000000000', '11111111-0001-0000-0000-000000000000', 'primary'),   -- Quadriceps
  ('22222222-0001-0000-0000-000000000000', '11111111-0005-0000-0000-000000000000', 'secondary'), -- Gluteus
  -- Leg Extension
  ('22222222-0002-0000-0000-000000000000', '11111111-0001-0000-0000-000000000000', 'primary'),   -- Quadriceps
  -- Leg Curl
  ('22222222-0003-0000-0000-000000000000', '11111111-0002-0000-0000-000000000000', 'primary'),   -- Hamstrings
  -- Hip Adduction
  ('22222222-0004-0000-0000-000000000000', '11111111-0003-0000-0000-000000000000', 'primary'),   -- Adductors
  -- Hip Abduction
  ('22222222-0005-0000-0000-000000000000', '11111111-0004-0000-0000-000000000000', 'primary'),   -- Abductors
  -- Cable Pulldown
  ('22222222-0006-0000-0000-000000000000', '11111111-0007-0000-0000-000000000000', 'primary'),   -- Lat Dorsi
  ('22222222-0006-0000-0000-000000000000', '11111111-0016-0000-0000-000000000000', 'secondary'), -- Biceps
  -- Shoulder Press
  ('22222222-0007-0000-0000-000000000000', '11111111-0011-0000-0000-000000000000', 'primary'),   -- Ant. Deltoid
  ('22222222-0007-0000-0000-000000000000', '11111111-0017-0000-0000-000000000000', 'secondary'), -- Triceps
  -- Hyperextension
  ('22222222-0008-0000-0000-000000000000', '11111111-0010-0000-0000-000000000000', 'primary'),   -- Erector Spinae
  ('22222222-0008-0000-0000-000000000000', '11111111-0005-0000-0000-000000000000', 'secondary'), -- Gluteus
  -- Side Bend
  ('22222222-0009-0000-0000-000000000000', '11111111-0019-0000-0000-000000000000', 'primary'),   -- Obliques
  -- Pec Deck Fly
  ('22222222-0010-0000-0000-000000000000', '11111111-0014-0000-0000-000000000000', 'primary'),   -- Pec Major
  -- Dumbbell Curl
  ('22222222-0011-0000-0000-000000000000', '11111111-0016-0000-0000-000000000000', 'primary'),   -- Biceps
  -- Triceps Extension
  ('22222222-0012-0000-0000-000000000000', '11111111-0017-0000-0000-000000000000', 'primary'),   -- Triceps
  -- Seated Crunch
  ('22222222-0013-0000-0000-000000000000', '11111111-0018-0000-0000-000000000000', 'primary'),   -- Rectus Abs
  -- Seated Twist
  ('22222222-0014-0000-0000-000000000000', '11111111-0019-0000-0000-000000000000', 'primary');   -- Obliques
