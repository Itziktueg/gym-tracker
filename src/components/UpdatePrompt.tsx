import { useRegisterSW } from 'virtual:pwa-register/react'

/** How often to ask the server whether a new build exists */
const CHECK_INTERVAL_MS = 60 * 60 * 1000   // 1 hour

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = () => {
        // Don't bother while offline — update() would just fail
        if (navigator.onLine) registration.update()
      }

      setInterval(check, CHECK_INTERVAL_MS)

      // A PWA can sit backgrounded for days; check whenever it comes forward
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-3 pb-5" dir="rtl">
      <div className="mx-auto max-w-lg bg-blue-600 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">גרסה חדשה זמינה</p>
          <p className="text-blue-100 text-xs mt-0.5">רענן כדי לקבל את העדכונים האחרונים</p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="bg-white text-blue-700 font-bold text-sm rounded-xl px-4 py-2 shrink-0 active:opacity-80"
        >
          רענן
        </button>
      </div>
    </div>
  )
}
