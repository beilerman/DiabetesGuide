import { useCallback, useEffect, useState } from 'react'
import { FAVORITES_STORAGE_KEY, toggleFavorite } from '../lib/favorites'

/**
 * Favorites are shared across every component that mounts this hook via a single
 * module-level store + listener set (the same pattern as `useMealCart`). A
 * per-instance `useState` would let a stale instance's write clobber another's,
 * silently reverting a user's curated "safe foods" list. We also subscribe to
 * the cross-tab `storage` event so a change in one tab propagates to the others.
 */

function readFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    // Guard the shape: a corrupted value (object, number, array of non-strings)
    // must not crash `new Set(...)` or yield `[object Object]` ids.
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

let sharedFavorites: Set<string> = readFromStorage()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function writeToStorage(favorites: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]))
}

function setSharedFavorites(next: Set<string>) {
  sharedFavorites = next
  writeToStorage(next)
  notify()
}

// Cross-tab sync: the `storage` event fires only in OTHER tabs, so there's no
// echo loop with our own writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === FAVORITES_STORAGE_KEY) {
      sharedFavorites = readFromStorage()
      notify()
    }
  })
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(sharedFavorites)

  useEffect(() => {
    const listener = () => setFavorites(new Set(sharedFavorites))
    listeners.add(listener)
    // Reconcile in case the shared store changed between module init and mount.
    listener()
    return () => { listeners.delete(listener) }
  }, [])

  const toggle = useCallback((id: string) => {
    setSharedFavorites(toggleFavorite(sharedFavorites, id))
  }, [])

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites])

  return { favorites, toggle, isFavorite }
}

export function __resetFavoritesState(favorites?: Set<string>) {
  listeners.clear()
  sharedFavorites = favorites ?? new Set()
  writeToStorage(sharedFavorites)
}
