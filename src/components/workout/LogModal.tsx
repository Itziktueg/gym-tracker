import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExerciseUser, WorkoutLog } from '../../types/database'
import RestTimer, { useRestTimerState, stopRestTimer, formatRestTime } from './RestTimer'

interface Props {
  exercise: ExerciseUser
  todayLogs: WorkoutLog[]
  userId: string
  logDate: Date
  onClose: () => void
  onSaved: (exerciseId: string, newLogs: WorkoutLog[]) => void
  onUndo: (exerciseId: string) => void
  onEditExercise: () => void
  workoutId: string | null
  lang?: 'he' | 'en'
  restTimerSeconds: number
}

interface SetLine {
  reps: number
  weight: number          // always kilograms — see the unit toggle below
  rir: number | null      // reps in reserve; null = not recorded
}

type Unit = 'kg' | 'lb'

/** Gym machines here are mostly metric, but a few are plated in pounds. The
 *  toggle changes what is shown and typed, never what is stored. */
const LB_PER_KG = 2.20462
const UNIT_KEY  = 'log-weight-unit'

const toUnit   = (kg: number, u: Unit) => u === 'kg' ? kg : kg * LB_PER_KG
const fromUnit = (v: number,  u: Unit) => u === 'kg' ? v  : v / LB_PER_KG
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

function loadUnit(): Unit {
  try {
    return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'
  } catch {
    return 'kg'
  }
}

function saveUnit(u: Unit) {
  try { localStorage.setItem(UNIT_KEY, u) } catch { /* private mode */ }
}

/** Whole numbers where possible: "60.6" needs the decimal, "40" does not. */
function fmtWeight(kg: number, u: Unit) {
  const v = round1(toUnit(kg, u))
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

/** Same muscle-group colours the tiles and reports use, so a set card is tied
 *  to its exercise without adding any extra chrome. */
const CATEGORY_ACCENT: Record<string, string> = {
  'פלג גוף תחתון': '#3b82f6',   // blue-500
  'גב וכתפיים':    '#8b5cf6',   // violet-500
  'חזה וזרועות':   '#f97316',   // orange-500
  'בטן וליבה':     '#14b8a6',   // teal-500
}

/** 4 is the catch-all "4 or more reps still in the tank".
 *  Colour runs red (to failure) to green (plenty left), so the scale reads
 *  without needing the numbers. */
const RIR_OPTIONS = [
  { value: 0, label: '0',  idle: 'bg-red-100 text-red-700 hover:bg-red-200',          on: 'bg-red-500 text-white' },
  { value: 1, label: '1',  idle: 'bg-orange-100 text-orange-700 hover:bg-orange-200', on: 'bg-orange-500 text-white' },
  { value: 2, label: '2',  idle: 'bg-amber-100 text-amber-700 hover:bg-amber-200',    on: 'bg-amber-500 text-white' },
  { value: 3, label: '3',  idle: 'bg-lime-100 text-lime-700 hover:bg-lime-200',       on: 'bg-lime-600 text-white' },
  { value: 4, label: '+4', idle: 'bg-green-100 text-green-700 hover:bg-green-200',    on: 'bg-green-600 text-white' },
]

export default function LogModal({ exercise, todayLogs, userId, logDate, onClose, onSaved, onUndo, onEditExercise, workoutId, lang = 'he', restTimerSeconds }: Props) {
  const englishName = lang === 'en' ? exercise.name_en?.trim() : ''
  const accent = CATEGORY_ACCENT[exercise.category ?? ''] ?? '#d1d5db'
  const numSets = Math.max(exercise.default_sets, 1)

  const [lines, setLines] = useState<SetLine[]>(
    todayLogs.length > 0
      ? todayLogs.map(l => ({ reps: l.reps_completed, weight: l.weight, rir: l.rir ?? null }))
      : Array.from({ length: numSets }, () => ({
          reps: exercise.default_reps,
          weight: exercise.default_weight,
          rir: null as number | null,
        }))
  )
  // One note per exercise per day. Stored on every set row of this save, so it
  // survives even if some rows are later removed.
  const [note, setNote] = useState(todayLogs.find(l => l.notes)?.notes ?? '')
  const [loading, setLoading]           = useState(false)
  const [undoing, setUndoing]           = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [defaultsSaved, setDefaultsSaved]   = useState(false)

  // Same timer as the one in the header — this sheet just draws it much larger
  // while it runs, and hands the normal controls back when it finishes.
  const { running: resting, secondsLeft } = useRestTimerState(restTimerSeconds)

  // Display unit only. lines[].weight is always kilograms, because every log,
  // default, intensity figure and report in the app is in kilograms — storing a
  // mix would quietly corrupt years of history. Pounds are converted at the edge.
  const [unit, setUnit] = useState<Unit>(loadUnit)
  useEffect(() => { saveUnit(unit) }, [unit])

  function updateLine(i: number, field: 'reps' | 'weight' | 'rir', value: number | null) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  /** Steps in whole display units — 1 lb in pounds mode, 1 kg in kilos — and
   *  converts back to kg for storage. Rounding the shown value first stops
   *  repeated conversions drifting into 89.9999. */
  function stepWeight(i: number, delta: number) {
    const shown = round1(toUnit(lines[i].weight, unit))
    const next  = Math.max(0, shown + delta)
    updateLine(i, 'weight', round2(fromUnit(next, unit)))
  }

  // Defaults can only be saved when all sets are identical
  const allSame = lines.every(l => l.reps === lines[0].reps && l.weight === lines[0].weight)

  async function handleSubmit() {
    setLoading(true)
    // Remove any existing logs for this exercise today (safety)
    if (todayLogs.length > 0) {
      await supabase.from('workout_logs').delete().in('id', todayLogs.map(l => l.id))
    }
    const loggedAt = new Date(logDate)
    loggedAt.setHours(12, 0, 0, 0)
    const records = lines.map(line => ({
      user_id:        userId,
      exercise_id:    exercise.id,
      sets_completed: 1,
      reps_completed: line.reps,
      weight:         line.weight,
      intensity:      line.reps * line.weight * ((exercise.is_bilateral || exercise.double_weight) ? 2 : 1),
      logged_at:      loggedAt.toISOString(),
      // Recorded from the exercise's own assignment, so it is right regardless
      // of which tab the user happened to be on
      workout_id:     workoutId,
      notes:          note.trim() || null,
      rir:            line.rir,
    }))
    const { data } = await supabase.from('workout_logs').insert(records).select()
    onSaved(exercise.id, (data ?? []) as WorkoutLog[])
    setLoading(false)
  }

  async function handleUndo() {
    if (!confirm('לבטל את ביצוע התרגיל להיום?')) return
    setUndoing(true)
    await supabase.from('workout_logs').delete().in('id', todayLogs.map(l => l.id))
    onUndo(exercise.id)
    setUndoing(false)
  }

  async function handleUpdateDefaults() {
    setSavingDefaults(true)
    await supabase
      .from('exercises_user')
      .update({
        default_sets:   lines.length,
        default_reps:   lines[0].reps,
        default_weight: lines[0].weight,
      })
      .eq('id', exercise.id)
    setSavingDefaults(false)
    setDefaultsSaved(true)
    setTimeout(() => setDefaultsSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70"
      onClick={onClose}
    >
      {/* Full height, not a capped sheet: a long exercise note plus the header
          left too little room for three set cards. Split into three regions so
          only the set list scrolls — the title and the action buttons stay put
          however many sets there are. */}
      <div
        className="w-full max-w-lg bg-white shadow-2xl h-dvh flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none w-10 h-10 flex items-center justify-center"
          >
            ×
          </button>
          <h2 dir={englishName ? 'ltr' : 'rtl'}
            className="text-gray-800 text-lg font-bold text-center flex-1">
            {englishName || exercise.name_he}
          </h2>
          {/* Demo link lives in the header rather than its own row: that row cost
              ~36px, which is the difference between three set cards fitting and
              not once the undo button is present. */}
          <div className="flex items-center shrink-0">
            {exercise.video_url && (
              <a
                href={exercise.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 ml-1 rounded-xl bg-green-500 hover:bg-green-600 active:bg-green-700 shadow-sm flex items-center justify-center transition-colors"
                title="צפה בהדגמה"
                aria-label="צפה בהדגמה"
              >
                {/* Rounded-corner triangle: stroked as well as filled, which is
                    what softens the points. Stays pointing right in RTL — the
                    play glyph is read as a play button, not as a direction. */}
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                  <path
                    d="M9 5.5 19 12 9 18.5Z"
                    fill="white"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            )}
            <button
              onClick={onEditExercise}
              className="text-gray-400 hover:text-gray-600 w-10 h-10 flex items-center justify-center text-lg"
              title="עריכת תרגיל"
            >
              ✏️
            </button>
          </div>
        </div>

        {exercise.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2 mb-3 text-amber-800 text-sm leading-relaxed">
            {exercise.notes}
          </div>
        )}

        {/* Logging set by set means this sheet is open through the whole rest
            period, with the header timer behind it. Same timer, not a second
            one — RestTimer shares its state across mounted instances.
            While it runs the controls are replaced by the large countdown
            below, so the bar is not shown twice. */}
        {!resting && (
          <div className="mb-2">
            <RestTimer defaultSeconds={restTimerSeconds} compact />
          </div>
        )}

        </div>

        {/* While resting, the countdown takes over this whole region — readable
            from across the gym without picking the phone up. It overlays rather
            than resizes, so the sets underneath keep their positions and the
            footer buttons stay reachable. It disappears by itself when the
            countdown ends, since `resting` goes false. */}
        {/* Explicit height, not flex-1: the hidden set list is what normally
            gives the sheet its height, so a flex child with no content of its
            own would collapse to nothing. */}
        {resting && (
          <div className="px-4 pb-2 shrink-0">
            <div className="h-[45dvh] rounded-3xl bg-orange-500 flex flex-col items-center justify-center gap-3">
              <p className="text-white/80 text-sm font-medium">זמן מנוחה</p>
              <p className="text-white font-bold tabular-nums leading-none text-7xl">
                {formatRestTime(secondsLeft ?? 0)}
              </p>
              <button
                onClick={stopRestTimer}
                className="mt-1 bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-bold rounded-2xl px-6 py-2.5 text-sm"
              >
                ■ עצור
              </button>
            </div>
          </div>
        )}

        {/* One card per set: reps/weight and its RIR live inside the same box,
            separated by a hairline, with clear space between sets.
            min-h-0 is required or the flex child refuses to shrink and scroll. */}
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-1 space-y-4 ${resting ? 'hidden' : ''}`}>
          {lines.map((line, i) => (
            <div
              key={i}
              className="bg-gray-50 rounded-2xl px-4 py-3"
              style={{ borderInlineStart: `3px solid ${accent}` }}
            >
              <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs font-bold w-8 shrink-0 text-right">
                סט {i + 1}
              </span>

              {/* Reps */}
              <div className="flex items-center gap-1 flex-1 justify-center">
                <button
                  onClick={() => updateLine(i, 'reps', Math.max(1, line.reps - 1))}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >−</button>
                <span className="text-gray-800 font-extrabold text-[17px] w-[34px] text-center tabular-nums">{line.reps}</span>
                <button
                  onClick={() => updateLine(i, 'reps', line.reps + 1)}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >+</button>
                <span className="text-gray-400 text-xs w-6">חז'</span>
              </div>

              {/* Weight — shown in the selected unit, stored in kg */}
              <div className="flex items-center gap-1 flex-1 justify-center">
                <button
                  onClick={() => stepWeight(i, -1)}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >−</button>
                <span className="text-gray-800 font-extrabold text-[17px] w-10 text-center tabular-nums">
                  {fmtWeight(line.weight, unit)}
                </span>
                <button
                  onClick={() => stepWeight(i, 1)}
                  className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 font-bold text-lg leading-none"
                >+</button>
                {/* The unit label is the toggle. It costs no extra row, and it
                    is already where the eye is when setting a weight. */}
                <button
                  onClick={() => setUnit(u => u === 'kg' ? 'lb' : 'kg')}
                  title={unit === 'kg' ? 'הצג בליברות' : 'הצג בקילוגרמים'}
                  className="w-7 shrink-0 text-[10px] font-bold text-gray-500 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded py-0.5 transition-colors"
                >
                  {unit === 'kg' ? 'ק"ג' : 'lb'}
                </button>
              </div>
              </div>

              {/* RIR for this set — tap again to clear */}
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-gray-200">
                <span className="text-gray-400 text-xs font-bold w-8 shrink-0 text-right">RIR</span>
                <div className="flex items-center gap-1 flex-1 justify-center">
                  {RIR_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateLine(i, 'rir', line.rir === opt.value ? null : opt.value)}
                      className={`flex-1 h-8 rounded-lg text-xs font-bold transition-all ${
                        line.rir === opt.value
                          ? `${opt.on} ring-2 ring-offset-2 ring-offset-gray-50 ring-gray-300`
                          : `${opt.idle} ${line.rir !== null ? 'opacity-45' : ''}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tight chrome so three set cards clear the scroll area on a phone */}
        <div className="px-6 pb-4 pt-2 shrink-0">
        {/* How the exercise felt — read later by the coach */}
        <div className="mb-2">
          <label className="text-gray-500 text-xs font-medium block mb-0.5">
            איך היה התרגיל? (רשות)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={1}
            placeholder="הרגשה, קושי, כאב, הערה למאמן..."
            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* One row for every action. Each stacked button cost a whole line, and
            a long exercise note was enough to push the third set card out of
            view. אשר stays widest — it is the one you press every time. */}
        <div className="flex gap-2 items-stretch">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-[1.4] font-bold rounded-2xl py-2.5 text-base bg-green-600 hover:bg-green-500 active:bg-green-700 text-white transition-colors disabled:opacity-50"
          >
            {loading ? '...' : 'אשר ✓'}
          </button>

          <button
            onClick={handleUpdateDefaults}
            disabled={!allSame || savingDefaults}
            title={!allSame ? 'לא ניתן לשמור ברירות מחדל כאשר הסטים שונים זה מזה' : ''}
            className="flex-1 font-bold rounded-2xl px-1 py-2 text-xs leading-tight bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-200 transition-colors disabled:opacity-40"
          >
            {savingDefaults ? '...' : defaultsSaved ? '✓ נשמר' : 'עדכן ברירות מחדל'}
          </button>

          {/* Only shown if logs already exist for today */}
          {todayLogs.length > 0 && (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="flex-1 px-1 py-2 rounded-2xl bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 text-xs font-bold leading-tight disabled:opacity-50"
            >
              {undoing ? '...' : '↩ בטל ביצוע'}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
