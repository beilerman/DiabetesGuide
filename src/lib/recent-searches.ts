/**
 * Pure primitives for the "recent searches" history shown on the Search page.
 *
 * Extracted from `Search.tsx` so the dedup/trim rules are unit-testable and
 * reusable. Normalisation lower-cases and trims, so "Burger", "burger", and
 * "burger " all collapse to one history entry.
 */

export const RECENT_SEARCHES_STORAGE_KEY = 'dg_recent_searches'
export const DEFAULT_MAX_RECENT_SEARCHES = 5

/** Lowercase + trim; empty after normalisation means "not a real search". */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase()
}

export interface AddRecentSearchOpts {
  /** Maximum entries to keep. Default 5. */
  maxLen?: number
}

/**
 * Insert `query` at the front of the recent list. De-dupes against any
 * previous entry that normalises to the same value, then truncates to
 * `maxLen`. Returns a new array.
 *
 * If `query` is empty (or whitespace-only) after normalisation, the input
 * list is returned unchanged.
 */
export function addRecentSearch(
  current: ReadonlyArray<string>,
  query: string,
  opts: AddRecentSearchOpts = {},
): string[] {
  const maxLen = opts.maxLen ?? DEFAULT_MAX_RECENT_SEARCHES
  const trimmed = query.trim()
  if (!trimmed) return [...current]
  const norm = normalizeQuery(trimmed)
  const filtered = current.filter((q) => normalizeQuery(q) !== norm)
  return [trimmed, ...filtered].slice(0, maxLen)
}

/** Returns an empty list — caller writes it back to storage. */
export function clearRecentSearches(): string[] {
  return []
}
