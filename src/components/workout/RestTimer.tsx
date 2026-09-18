import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY     = 'rest-timer-seconds'
const STORAGE_END_KEY = 'rest-timer-end-at'
const STEP     = 10
const MIN_SECS = 10
const MAX_SECS = 600

// Module-level: survives component remounts
let scheduledNotif: ReturnType<typeof setTimeout> | null = null

function playBeep() {
  const ctx = new AudioContext()
  for (let i = 0; i < 3; i++) {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value     = 0.3
    osc.start(ctx.currentTime + i * 0.4)
    osc.stop(ctx.currentTime + i * 0.4 + 0.25)
  }
}

function fmt(s: number) {
  const m  = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

function getEndAt(): number | null {
  const raw = localStorage.getItem(STORAGE_END_KEY)
  if (!raw) return null
  const endAt = parseInt(raw, 10)
  if (endAt <= Date.now()) {
    localStorage.removeItem(STORAGE_END_KEY)
    return null
  }
  return endAt
}

async function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

// Schedule an OS-level notification at a precise timestamp.
// Uses Notification Scheduling API (Chrome Android) when available,
// falls back to setTimeout for when the app is open/backgrounded same browser.
async function scheduleNotification(endAt: number) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  // ── Option 1: Notification Scheduling API (Chrome Android ≥ 80) ──────────
  // The OS fires this even when the app is fully backgrounded or screen is off.
  if ('serviceWorker' in navigator && 'TimestampTrigger' in window) {
    try {
      const reg = await navigator.serviceWorker.ready
      // Cancel any previous scheduled notification
      const existing = await reg.getNotifications({ tag: 'rest-timer' })
      existing.forEach(n => n.close())

      await reg.showNotification('⏱ זמן מנוחה הסתיים!', {
        body: 'הגיע הזמן לסט הבא 💪',
        icon: '/icon-192-v2.png',
        tag:  'rest-timer',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        showTrigger: new (window as any).TimestampTrigger(endAt),
      } as NotificationOptions)
      return   // done — OS handles the rest
    } catch {
      // fall through to setTimeout
    }
  }

  // ── Option 2: setTimeout fallback ─────────────────────────────────────────
  // Works when the app is open or backgrounded in the same browser session.
  const delay = Math.max(0, endAt - Date.now())
  if (scheduledNotif) clearTimeout(scheduledNotif)
  scheduledNotif = setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification('⏱ זמן מנוחה הסתיים!', {
        body: 'הגיע הזמן לסט הבא 💪',
        icon: '/icon-192-v2.png',
        tag:  'rest-timer',
      } as NotificationOptions)
    }
    scheduledNotif = null
  }, delay)
}

async function cancelScheduledNotification() {
  if (scheduledNotif) { clearTimeout(scheduledNotif); scheduledNotif = null }
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.getNotifications({ tag: 'rest-timer' })
      existing.forEach(n => n.close())
    } catch { /* ignore */ }
  }
}

// ── Shared store ────────────────────────────────────────────────────────────
// There are two of these on screen: the bar under the header and the one inside
// the log sheet. They are one timer, not two, so the state lives here rather
// than in component state — otherwise starting it in the sheet would leave the
// header showing idle, and closing the sheet would look like the timer was lost.
// Only duration and endAt are stored; each instance derives the countdown from
// endAt, so they cannot disagree about what is left.
type TimerState = { duration: number; endAt: number | null }

let store: TimerState = {
  duration: 0,          // replaced on first mount from localStorage
  endAt:    null,
}
let initialised = false
const listeners = new Set<() => void>()

function emit() { for (const fn of listeners) fn() }

function setStore(next: Partial<TimerState>) {
  store = { ...store, ...next }
  emit()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Ends the rest period. Guarded so that with two instances ticking, only the
 *  first one through beeps and clears. */
function finish() {
  if (store.endAt === null) return
  localStorage.removeItem(STORAGE_END_KEY)
  setStore({ endAt: null })
  playBeep()
}

function ensureInitialised(defaultSeconds: number) {
  if (initialised) return
  const saved = localStorage.getItem(STORAGE_KEY)
  store = {
    duration: saved ? parseInt(saved, 10) : defaultSeconds,
    endAt:    getEndAt(),
  }
  initialised = true
}

/** The timer's live state, for anything that wants to render its own display
 *  rather than the standard bar — the log sheet blows the countdown up to fill
 *  the screen while resting. Shares the one store, so there is still one timer. */
export function useRestTimerState(defaultSeconds = 60) {
  ensureInitialised(defaultSeconds)

  const snapshot = useSyncExternalStore(subscribe, () => store)
  const running = snapshot.endAt !== null

  // Re-render once a second while counting down. Every consumer runs its own
  // interval but reads the same endAt, so they cannot display different numbers.
  const [, force] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const secondsLeft = store.endAt === null
    ? null
    : Math.max(0, Math.round((store.endAt - Date.now()) / 1000))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(snapshot.duration))
  }, [snapshot.duration])

  // Re-arm the OS notification on mount in case it was lost
  useEffect(() => {
    if (store.endAt !== null) scheduleNotification(store.endAt)
  }, [])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        if (store.endAt !== null && store.endAt - Date.now() <= 0) finish()
        else force(n => n + 1)
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  // Sync display when the app comes back to foreground from another app
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      if (store.endAt !== null && store.endAt - Date.now() <= 0) finish()
      else force(n => n + 1)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return { running, secondsLeft, duration: snapshot.duration }
}

export function stopRestTimer() {
  localStorage.removeItem(STORAGE_END_KEY)
  cancelScheduledNotification()
  setStore({ endAt: null })
}

export { fmt as formatRestTime }

/** rightSlot renders at the start of the bar — the right side in RTL — while the
 *  timer controls sit at the opposite end.
 *  compact trims the bar for the log sheet, where vertical space is scarce. */
export default function RestTimer({ defaultSeconds, rightSlot, compact = false }: {
  defaultSeconds: number
  rightSlot?: ReactNode
  compact?: boolean
}) {
  const { running, secondsLeft, duration } = useRestTimerState(defaultSeconds)

  function start() {
    requestNotificationPermission().then(() => {
      const endAt = Date.now() + duration * 1000
      localStorage.setItem(STORAGE_END_KEY, String(endAt))
      setStore({ endAt })
      scheduleNotification(endAt)
    })
  }

  const stop = stopRestTimer

  function adjust(delta: number) {
    setStore({ duration: Math.min(MAX_SECS, Math.max(MIN_SECS, duration + delta)) })
  }

  if (running) {
    return (
      <div className={`flex items-center justify-between gap-3 bg-orange-500 px-3 ${compact ? 'py-1.5 rounded-2xl' : 'py-2'}`}>
        {rightSlot ?? <span />}
        <div className="flex items-center gap-3">
          <span className={`text-white font-bold tabular-nums ${compact ? 'text-base' : 'text-lg'}`}>
            {fmt(secondsLeft ?? 0)}
          </span>
          <button
            onClick={stop}
            className="text-white/80 hover:text-white text-xs font-medium bg-white/20 rounded-lg px-3 py-1"
          >
            ■ עצור
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between gap-2 px-3 ${
      compact ? 'py-1.5 bg-gray-100 rounded-2xl' : 'py-2 bg-gray-50 border-b border-gray-200'
    }`}>
      {rightSlot ?? <span />}
      <div className="flex items-center gap-2">
      <button
        onClick={() => adjust(-STEP)}
        disabled={duration <= MIN_SECS}
        className={`rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-gray-700 font-bold text-base leading-none flex items-center justify-center ${
          compact ? 'w-6 h-6' : 'w-7 h-7'
        }`}
      >
        −
      </button>

      <button
        onClick={start}
        className={`flex items-center gap-1.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold tabular-nums ${
          compact ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'
        }`}
      >
        <span>⏱</span>
        <span>{fmt(duration)}</span>
      </button>

      <button
        onClick={() => adjust(STEP)}
        disabled={duration >= MAX_SECS}
        className={`rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-gray-700 font-bold text-base leading-none flex items-center justify-center ${
          compact ? 'w-6 h-6' : 'w-7 h-7'
        }`}
      >
        +
      </button>
      </div>
    </div>
  )
}
