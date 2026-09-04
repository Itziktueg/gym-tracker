export type UserRole = 'user' | 'admin'
export type MuscleRole = 'primary' | 'secondary'

export interface Profile {
  id: string
  email: string
  role: UserRole
  nickname: string | null
  rest_timer_seconds: number
  created_at: string
}

export interface MuscleGroup {
  id: string
  name_he: string
  name_en: string
  created_at: string
}

export interface ExerciseGlobal {
  id: string
  name_he: string
  name_en: string
  image_url: string | null
  video_url: string | null
  default_sets: number
  default_reps: number
  default_weight: number
  is_bilateral: boolean
  double_weight: boolean
  notes: string | null
  category: string | null
  sort_order: number
  created_at: string
}

export interface ExerciseMuscleGroup {
  exercise_id: string
  muscle_group_id: string
  role: MuscleRole
}

export interface ExerciseUser {
  id: string
  user_id: string
  global_exercise_id: string | null
  name_he: string
  name_en: string | null
  image_url: string | null
  video_url: string | null
  default_sets: number
  default_reps: number
  default_weight: number
  is_bilateral: boolean
  double_weight: boolean
  notes: string | null
  category: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface WorkoutPlan {
  id: string
  user_id: string
  name: string | null       // legacy; display name is derived from seq
  seq: number | null        // 0, 1, 2... assigned once, never renumbered
  start_date: string        // 'YYYY-MM-DD'
  end_date: string | null   // null = open-ended
  created_at: string
}

/** A named session inside a plan (e.g. אימון 1 - רגליים). */
export interface PlanWorkout {
  id: string
  plan_id: string
  name: string
  day_of_week: number | null   // 0=Sunday. null = no fixed day, order decides
  seq: number
  created_at: string
}

export interface WorkoutPlanExercise {
  plan_id: string
  exercise_id: string
  workout_id: string | null    // null = in the plan but not assigned to a workout
  is_optional: boolean         // true = nice to do, not required for the session
}

export interface WorkoutLog {
  id: string
  user_id: string
  exercise_id: string
  sets_completed: number
  reps_completed: number
  weight: number
  intensity: number
  notes: string | null
  logged_at: string
  workout_id: string | null    // which session this was logged under, if any
}

// Joined types used in the UI
export interface ExerciseUserWithMuscles extends ExerciseUser {
  muscle_groups?: MuscleGroup[]
}

export interface WorkoutLogWithExercise extends WorkoutLog {
  exercise?: ExerciseUser
}
