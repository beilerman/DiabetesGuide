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
    getLastSync().then(setLastSyncState).catch(() => {})
  }, [isOnline])

  return { isOnline, lastSync }
}
