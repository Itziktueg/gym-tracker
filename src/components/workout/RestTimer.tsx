import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'rest-timer-seconds'
const STEP = 10
const MIN_SECS = 10
const MAX_SECS = 600

function playBeep() {
  const ctx = new AudioContext()
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.3
    osc.start(ctx.currentTime + i * 0.4)
    osc.stop(ctx.currentTime + i * 0.4 + 0.25)
  }
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

export default function RestTimer({ defaultSeconds }: { defaultSeconds: number }) {
  const [duration, setDuration] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : defaultSeconds
  })
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist duration whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(duration))
  }, [duration])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev === null || prev <= 1) {
            setRunning(false)
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

  function start() {
    setSecondsLeft(duration)
    setRunning(true)
  }

  function stop() {
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
