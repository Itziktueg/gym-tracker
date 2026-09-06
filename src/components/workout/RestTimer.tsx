import { useState, useEffect, useRef } from 'react'
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

function getSecondsLeft(): number | null {
  const endAt = getEndAt()
  if (endAt === null) return null
  return Math.max(1, Math.round((endAt - Date.now()) / 1000))
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

/** rightSlot renders at the start of the bar — the right side in RTL — while the
 *  timer controls sit at the opposite end. */
export default function RestTimer({ defaultSeconds, rightSlot }: {
  defaultSeconds: number
  rightSlot?: ReactNode
}) {
  const [duration, setDuration] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : defaultSeconds
  })
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [running, setRunning]         = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist duration
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(duration))
  }, [duration])

  // Restore timer state on mount (handles navigation away and back)
  useEffect(() => {
    const endAt = getEndAt()
    const left  = getSecondsLeft()
    if (endAt !== null && left !== null) {
      setSecondsLeft(left)
      setRunning(true)
      // Re-arm the OS notification in case it was lost
      scheduleNotification(endAt)
    }
  }, []) // runs only on mount

  // Countdown tick
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev === null || prev <= 1) {
            setRunning(false)
            localStorage.removeItem(STORAGE_END_KEY)
            playBeep()
            return null
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  // Sync display when app comes back to foreground from another app
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      const left = getSecondsLeft()
      if (left === null && running) {
        setRunning(false)
        setSecondsLeft(null)
        playBeep()
      } else if (left !== null) {
        setSecondsLeft(left)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [running])

  function start() {
    requestNotificationPermission().then(() => {
      const endAt = Date.now() + duration * 1000
      localStorage.setItem(STORAGE_END_KEY, String(endAt))
      setSecondsLeft(duration)
      setRunning(true)
      scheduleNotification(endAt)
    })
  }

  function stop() {
    localStorage.removeItem(STORAGE_END_KEY)
    cancelScheduledNotification()
    setRunning(false)
    setSecondsLeft(null)
  }

  function adjust(delta: number) {
    setDuration(d => Math.min(MAX_SECS, Math.max(MIN_SECS, d + delta)))
  }

  if (running) {
    return (
      <div className="flex items-center justify-between gap-3 bg-orange-500 px-3 py-2">
        {rightSlot ?? <span />}
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg tabular-nums">
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
    <div className="flex items-center justify-between gap-2 bg-gray-50 border-b border-gray-200 px-3 py-2">
      {rightSlot ?? <span />}
      <div className="flex items-center gap-2">
      <button
        onClick={() => adjust(-STEP)}
        disabled={duration <= MIN_SECS}
        className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-gray-700 font-bold text-base leading-none flex items-center justify-center"
      >
        −
      </button>

      <button
        onClick={start}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold tabular-nums"
      >
        <span>⏱</span>
        <span>{fmt(duration)}</span>
      </button>

      <button
        onClick={() => adjust(STEP)}
        disabled={duration >= MAX_SECS}
        className="w-7 h-7 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-gray-700 font-bold text-base leading-none flex items-center justify-center"
      >
        +
      </button>
      </div>
    </div>
  )
}
