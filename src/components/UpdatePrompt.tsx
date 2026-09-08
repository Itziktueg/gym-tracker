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
  // reload this page — so the tab keeps running the old bundle until it does.
  // Watching for the controller swap is what tells us new code is waiting.
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

  // Deliberately not reloading on its own: a silent reload mid-set would throw
  // away whatever is typed into the log modal. The user picks the moment.
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-3 pb-5" dir="rtl">
      <div className="mx-auto max-w-lg bg-blue-600 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">גרסה חדשה מוכנה</p>
          <p className="text-blue-100 text-xs mt-0.5">רענן כדי לעבור אליה</p>
        </div>
        <button
          onClick={() => location.reload()}
          className="bg-white text-blue-700 font-bold text-sm rounded-xl px-4 py-2 shrink-0 active:opacity-80"
        >
          רענן
        </button>
      </div>
    </div>
  )
}
