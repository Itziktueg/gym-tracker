export type UserRole = 'user' | 'admin'
export type MuscleRole = 'primary' | 'secondary'

export interface Profile {
  id: string
  email: string
  role: UserRole
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
  notes: string | null
  category: string | null
  sort_order: number
  is_active: boolean
  created_at: string
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
}

// Joined types used in the UI
export interface ExerciseUserWithMuscles extends ExerciseUser {
  muscle_groups?: MuscleGroup[]
}

export interface WorkoutLogWithExercise extends WorkoutLog {
  exercise?: ExerciseUser
}
