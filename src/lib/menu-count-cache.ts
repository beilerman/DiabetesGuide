import { STORAGE_KEYS } from './storage-keys'

const CACHE_KEY = STORAGE_KEYS.menuItemCounts
const CACHE_VERSION = 1
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type CountStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface CachePayload {
  version: number
  savedAt: number
  counts: Array<[string, number]>
}

function getDefaultStorage(): CountStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function isValidCountEntry(entry: unknown): entry is [string, number] {
  return Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === 'string' &&
    typeof entry[1] === 'number' &&
    Number.isFinite(entry[1]) &&
    entry[1] >= 0
}

export function readMenuItemCountsCache(options?: {
  storage?: CountStorage
  now?: number
  maxAgeMs?: number
}): Map<string, number> | undefined {
  const storage = options?.storage ?? getDefaultStorage()
  if (!storage) return undefined

  try {
    const raw = storage.getItem(CACHE_KEY)
    if (!raw) return undefined

    const payload = JSON.parse(raw) as Partial<CachePayload>
    const now = options?.now ?? Date.now()
    const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS

    if (
      payload.version !== CACHE_VERSION ||
      typeof payload.savedAt !== 'number' ||
      now - payload.savedAt > maxAgeMs ||
      !Array.isArray(payload.counts) ||
      !payload.counts.every(isValidCountEntry)
    ) {
      return undefined
    }

    return new Map(payload.counts)
  } catch {
    return undefined
  }
}

export function writeMenuItemCountsCache(
  counts: Map<string, number>,
  options?: { storage?: CountStorage; now?: number },
): void {
  const storage = options?.storage ?? getDefaultStorage()
  if (!storage) return

  try {
    const payload: CachePayload = {
      version: CACHE_VERSION,
      savedAt: options?.now ?? Date.now(),
      counts: [...counts.entries()],
    }
    storage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    storage.removeItem(CACHE_KEY)
  }
}
