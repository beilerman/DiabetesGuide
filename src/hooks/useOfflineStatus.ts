import { useState, useEffect, useSyncExternalStore } from 'react'
import { getLastSync } from '../lib/offline-db'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

export function useOfflineStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot)
  const [lastSync, setLastSyncState] = useState<string | null>(null)

  useEffect(() => {
    // Cancellation token: connectivity flaps (in-park mobile) fire this effect
    // repeatedly, and the async IndexedDB reads can resolve out of order. Only
    // the latest effect run is allowed to set state, which also avoids a
    // setState-after-unmount during a flap.
    let cancelled = false
    getLastSync()
      .then((v) => { if (!cancelled) setLastSyncState(v) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isOnline])

  return { isOnline, lastSync }
}
