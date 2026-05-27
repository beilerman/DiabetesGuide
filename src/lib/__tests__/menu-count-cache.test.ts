import { describe, expect, it } from 'vitest'
import { readMenuItemCountsCache, writeMenuItemCountsCache } from '../menu-count-cache'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}

describe('menu item count cache', () => {
  it('round-trips count maps through storage', () => {
    const storage = new MemoryStorage()

    writeMenuItemCountsCache(new Map([
      ['mk', 120],
      ['epcot', 95],
    ]), { storage, now: 1_000 })

    const cached = readMenuItemCountsCache({ storage, now: 1_000 })

    expect(cached).toEqual(new Map([
      ['mk', 120],
      ['epcot', 95],
    ]))
  })

  it('returns undefined for expired or malformed cache payloads', () => {
    const expiredStorage = new MemoryStorage()
    writeMenuItemCountsCache(new Map([['mk', 120]]), { storage: expiredStorage, now: 1_000 })

    expect(readMenuItemCountsCache({
      storage: expiredStorage,
      now: 1_000 + 8 * 24 * 60 * 60 * 1000,
    })).toBeUndefined()

    const malformedStorage = new MemoryStorage()
    malformedStorage.setItem('dg_menu_item_counts_by_park_v1', '{nope')

    expect(readMenuItemCountsCache({ storage: malformedStorage, now: 1_000 })).toBeUndefined()
  })
})
