# Gym Tracking App

## Stack
- Vite + React + TypeScript + Tailwind CSS
- Supabase (auth + database)
- Will deploy to Vercel later

## Server environment variables (Vercel)
`api/coach-insights.ts` is the only server-side code. It needs three variables
set in the Vercel project, none of them prefixed `VITE_` — Vite exposes only
`VITE_*` to the client bundle, so these stay server-side:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key. Never commit it; never expose it to the client. The only one that must be added by hand. |
| `SUPABASE_URL` | Optional — falls back to the existing `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | Optional — falls back to the existing `VITE_SUPABASE_ANON_KEY`. |

The `VITE_` prefix only controls what Vite inlines into the client bundle;
Vercel passes every variable to serverless functions regardless. So the two
Supabase variables the app already has serve the function too, and only the
Anthropic key needs adding.

The anon key is deliberate: the endpoint builds its Supabase client from the
**caller's** access token so existing RLS scopes every query. The service role
key must never be used there — it would bypass RLS and turn a filter bug into a
cross-user data leak.

Without these the panel returns a clear Hebrew error rather than failing blank.

## Status
- Database schema is ready in schema.sql
- 6 tables: profiles, muscle_groups, exercises_global, exercises_user, exercise_muscle_groups, workout_logs
- RLS policies included
- Seed data: 19 muscle groups + 14 exercises from ExRx

## Auth
- Email + password (Supabase Auth)
- Two roles: 'user' and 'admin'
- New signups default to 'user'; admin must promote manually via SQL

## Features (from spec)
- Multi-user support
- Per-user personal exercise library (copied from global)
- Each exercise: name (Hebrew), image, ExRx video link, default sets/reps/weight, bilateral flag, performance notes, muscle groups
- "My Workout" screen: grid of exercise tiles (image + name), tap to open and log
- Daily summary at top: total exercises, sets, reps (doubled for bilateral exercises)
- Rest timer button (default 90s, configurable, beep when done)
- Green border on tiles for exercises completed today
- Admin screen: manage users + edit global exercise library
- UI in Hebrew, RTL layout
- Mobile-first (Android + iPhone)

## Build order
1. Init Vite + React + TS + Tailwind
2. Install @supabase/supabase-js
3. Set up .env with Supabase URL and anon key
4. Create src/lib/supabase.ts
5. Generate TypeScript types from the database
6. Login + signup screens
7. Auth context + protected routes
8. "My Workout" screen (grid + daily summary + timer)
9. Exercise detail modal (log a set)
10. Personal exercise management
11. Admin screens