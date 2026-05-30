import { describe, it, expect } from 'vitest'
import { STORAGE_KEYS, LOCAL_APP_STORAGE_KEYS } from '../storage-keys'

describe('storage-keys registry', () => {
  it('the clear-all list contains every registered key', () => {
    const registered = Object.values(STORAGE_KEYS)
    for (const key of registered) {
      expect(LOCAL_APP_STORAGE_KEYS).toContain(key)
    }
    expect(LOCAL_APP_STORAGE_KEYS).toHaveLength(registered.length)
  })

  // Regression for the real bug: the previous hand-maintained clear-list in
  // Settings.tsx omitted these two keys, so "Clear all app data" left the
  // estimator acknowledgment and the menu-count cache behind.
  it('includes the keys the old hand-maintained list dropped', () => {
    expect(LOCAL_APP_STORAGE_KEYS).toContain('dg_estimator_acknowledged_v1')
    expect(LOCAL_APP_STORAGE_KEYS).toContain('dg_menu_item_counts_by_park_v1')
  })

  it('clears both the current and legacy trip-plan keys', () => {
    expect(LOCAL_APP_STORAGE_KEYS).toContain('dg.trips.v1')
    expect(LOCAL_APP_STORAGE_KEYS).toContain('dg_trip_plan')
  })

  it('has no duplicate key values', () => {
    const values = Object.values(STORAGE_KEYS)
    expect(new Set(values).size).toBe(values.length)
  })
})
