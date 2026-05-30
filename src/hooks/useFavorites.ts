import { useState, useEffect, useCallback } from 'react'
import { STORAGE_KEYS } from '../lib/storage-keys'

const STORAGE_KEY = STORAGE_KEYS.favorites

/**
 * Favorites are shared across every component that mounts this hook via a single
 * module-level store + listener set (the same pattern as useCompare/useMealCart/
 * useTripPlan). A per-instance `useState` would let a stale instance's write
 * clobber another's, silently dropping a user's curated favorites. We also
 * subscribe to the cross-tab `storage` event so a change in one tab (or a
 * Settings "clear data" action) propagates to the others.
 */

function load(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    // Guard the shape: a corrupted value must not crash `new Set(...)` or yield
    // non-string ids.
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

let sharedFavorites: Set<string> = load()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(l => l())
}

function persist() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...sharedFavorites]))
}

function setFavorites(next: Set<string>) {
  sharedFavorites = next
  persist()
  notify()
}

// Cross-tab sync: the `storage` event fires only in OTHER tabs, so there is no
// echo loop with our own writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      sharedFavorites = load()
      notify()
    }
  })
}

export function useFavorites() {
  const [favorites, setLocalFavorites] = useState<Set<string>>(sharedFavorites)

  useEffect(() => {
    const listener = () => setLocalFavorites(new Set(sharedFavorites))
    listeners.add(listener)
    // Reconcile in case the shared store changed between module init and mount.
    listener()
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const toggle = useCallback((id: string) => {
    const next = new Set(sharedFavorites)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFavorites(next)
  }, [])

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites])

  return { favorites, toggle, isFavorite }
}

/** Test-only: reset the shared store + clear persistence between tests. */
export function __resetFavoritesState(initial?: Iterable<string>): void {
  listeners.clear()
  sharedFavorites = new Set(initial ?? [])
  persist()
}
