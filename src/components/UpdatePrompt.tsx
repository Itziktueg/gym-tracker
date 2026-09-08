import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** How often to ask the server whether a new build exists */
const CHECK_INTERVAL_MS = 60 * 60 * 1000   // 1 hour

/** True when this page was already controlled at load. A first-ever install
 *  also fires controllerchange, and that one is not an update. */
const hadController = typeof navigator !== 'undefined'
  && !!navigator.serviceWorker?.controller

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false)

  // registerType is 'autoUpdate', so the new worker installs and activates by
  // itself and useRegisterSW's needRefresh never fires. What it cannot do is
  // reload this page — the tab keeps running the old bundle until it does.
  // The controller swap is what tells us new code is sitting there unused.
  useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = () => {
        // Pointless offline, and update() rejects rather than resolving
        if (navigator.onLine) registration.update()
      }

      setInterval(check, CHECK_INTERVAL_MS)

      // A PWA can sit backgrounded for days; check whenever it comes forward
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onChange = () => { if (hadController) setReady(true) }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [])

  if (!ready) return null

  // Blocking on purpose. A dismissible banner is easy to swipe past, and the
  // app then keeps running stale code for days. There is no close affordance
  // and the backdrop ignores taps — the only way out is to refresh.
  // It cannot lock anyone out: after the reload the worker is current, so
  // controllerchange does not fire again and this never reappears.
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-6"
      dir="rtl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
        <p className="text-4xl mb-3">🔄</p>
        <p id="update-title" className="text-gray-800 font-bold text-base mb-1">
          גרסה חדשה זמינה
        </p>
        <p className="text-gray-500 text-sm leading-relaxed mb-5">
          יש לרענן כדי להמשיך. האימונים שנשמרו אינם מושפעים.
        </p>
        <button
          onClick={() => location.reload()}
          className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold rounded-xl py-3.5 text-base"
        >
          רענן עכשיו
        </button>
      </div>
    </div>
  )
}
