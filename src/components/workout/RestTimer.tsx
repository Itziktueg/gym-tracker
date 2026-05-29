import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY     = 'rest-timer-seconds'
const STORAGE_END_KEY = 'rest-timer-end-at'
const STEP     = 10
const MIN_SECS = 10
const MAX_SECS = 600

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

function showNotification() {
  if (Notification.permission === 'granted') {
    new Notification('⏱ זמן מנוחה הסתיים!', {
      body: 'הגיע הזמן לסט הבא 💪',
      icon: '/icon-192-v2.png',
      tag:  'rest-timer',
      renotify: true,
    })
  }
}

function fmt(s: number) {
  const m  = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

function getSecondsLeft(): number | null {
  const endAt = localStorage.getItem(STORAGE_END_KEY)
  if (!endAt) return null
  const left = Math.round((parseInt(endAt, 10) - Date.now()) / 1000)
  if (left <= 0) {
    localStorage.removeItem(STORAGE_END_KEY)
    return null
  }
  return left
}

async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

export default function RestTimer({ defaultSeconds }: { defaultSeconds: number }) {
  const [duration, setDuration] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : defaultSeconds
  })

  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => getSecondsLeft())
  const [running, setRunning]         = useState<boolean>(() => getSecondsLeft() !== null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notifRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Persist duration
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(duration))
  }, [duration])

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

  // Sync display when app comes back to foreground
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      const left = getSecondsLeft()
      if (left === null) {
        // Timer expired while away — beep + stop
        if (running) {
          setRunning(false)
          setSecondsLeft(null)
          playBeep()
        }
      } else {
        // Correct the display to match actual remaining time
        setSecondsLeft(left)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [running])

  function start() {
    requestNotificationPermission()

    const endAt = Date.now() + duration * 1000
    localStorage.setItem(STORAGE_END_KEY, String(endAt))
    setSecondsLeft(duration)
    setRunning(true)

    // Schedule a native notification for when the timer ends
    // This fires even when the app is backgrounded or another app is open
    if (notifRef.current) clearTimeout(notifRef.current)
    notifRef.current = setTimeout(() => {
      showNotification()
    }, duration * 1000)
  }

  function stop() {
    localStorage.removeItem(STORAGE_END_KEY)
    if (notifRef.current) clearTimeout(notifRef.current)
    setRunning(false)
    setSecondsLeft(null)
  }

  function adjust(delta: number) {
    setDuration(d => Math.min(MAX_SECS, Math.max(MIN_SECS, d + delta)))
  }

  if (running) {
    return (
      <div className="flex items-center justify-center gap-3 bg-orange-500 px-4 py-2">
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
    )
  }

  return (
    <div className="flex items-center justify-center gap-2 bg-gray-50 border-b border-gray-200 px-4 py-2">
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
  )
}
