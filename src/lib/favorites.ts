/**
 * Pure primitives for the favorites set.
 *
 * Extracted from `useFavorites` so scripts and tests can manipulate the same
 * favorites collection without React or localStorage. The hook becomes a thin
 * wrapper around `useState` + these reducers + storage.
 */

export const FAVORITES_STORAGE_KEY = 'dg_favorites'

/** Returns a new Set with `id` added; idempotent if already present. */
export function addFavorite(current: ReadonlySet<string>, id: string): Set<string> {
  if (current.has(id)) return new Set(current)
  const next = new Set(current)
  next.add(id)
  return next
}

/** Returns a new Set with `id` removed; idempotent if absent. */
export function removeFavorite(current: ReadonlySet<string>, id: string): Set<string> {
  if (!current.has(id)) return new Set(current)
  const next = new Set(current)
  next.delete(id)
  return next
}

/** Toggles `id`. Always returns a new Set so React re-renders. */
export function toggleFavorite(current: ReadonlySet<string>, id: string): Set<string> {
  return current.has(id) ? removeFavorite(current, id) : addFavorite(current, id)
}
