import { useOfflineStatus } from '../../hooks/useOfflineStatus'

export function OfflineBanner() {
  const { isOnline, lastSync } = useOfflineStatus()

  if (isOnline) return null

  const syncDate = lastSync
    ? new Date(lastSync).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800"
    >
      <span className="inline-flex items-center gap-1.5">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M8.464 15.536a5 5 0 010-7.072M15.536 8.464a5 5 0 010 7.072" />
          <line x1="4" y1="4" x2="20" y2="20" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        Offline mode
        {syncDate && <span className="text-amber-600">— using cached data from {syncDate}</span>}
        {!syncDate && <span className="text-amber-600">— no cached data available</span>}
      </span>
    </div>
  )
}
