import { useState, useEffect, useRef } from 'react'

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

export default function RestTimer({ defaultSeconds }: { defaultSeconds: number }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running])

  function handlePress() {
    if (running) {
      setRunning(false)
      setSecondsLeft(null)
    } else {
      setSecondsLeft(defaultSeconds)
      setRunning(true)
    }
  }

  const mins = Math.floor((secondsLeft ?? 0) / 60)
  const secs = String((secondsLeft ?? 0) % 60).padStart(2, '0')

  return (
    <button
      onClick={handlePress}
      className={`
        fixed bottom-6 end-6 z-50
        w-16 h-16 rounded-full shadow-2xl
        flex flex-col items-center justify-center
        transition-colors
        ${running ? 'bg-orange-500 hover:bg-orange-400' : 'bg-gray-700 hover:bg-gray-600'}
      `}
      title={running ? 'עצור טיימר' : 'התחל מנוחה'}
    >
      {running ? (
        <span className="text-white text-sm font-bold tabular-nums">
          {mins}:{secs}
        </span>
      ) : (
        <span className="text-2xl">⏱️</span>
      )}
    </button>
  )
}
