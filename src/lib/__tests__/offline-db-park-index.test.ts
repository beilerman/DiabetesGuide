import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  writeAllItems,
  readAllItems,
  readItemsByPark,
  clearOfflineData,
} from '../offline-db'
import type { MenuItemWithNutrition } from '../types'

// We only care about id + the restaurant/park nesting that drives the offline
// `by-park` index, so cast the partials.
function item(id: string, restaurant: unknown): MenuItemWithNutrition {
  return { id, restaurant } as unknown as MenuItemWithNutrition
}

beforeEach(async () => {
  await clearOfflineData()
})

describe('offline-db park index (v2 flat _parkId)', () => {
  it('finds items by park when restaurant/park is a nested object', async () => {
    await writeAllItems([item('a', { id: 'r1', park: { id: 'p1' } })])
    const found = await readItemsByPark('p1')
    expect(found.map(i => i.id)).toEqual(['a'])
  })

  // Regression for finding P2-1: a Supabase nested select can return the join as
  // a one-element ARRAY. The old index keyPath 'restaurant.park.id' evaluates to
  // undefined for an array, silently dropping EVERY such item from the park
  // index. The flat _parkId (computed by parkIdOf, which unwraps arrays) keeps
  // them findable.
  it('finds items by park when restaurant/park come back as arrays', async () => {
    await writeAllItems([item('b', [{ id: 'r1', park: [{ id: 'p1' }] }])])
    const found = await readItemsByPark('p1')
    expect(found.map(i => i.id)).toEqual(['b'])
  })

  it('keeps a park-less item out of the park index but still in readAllItems', async () => {
    await writeAllItems([
      item('withpark', { id: 'r1', park: { id: 'p1' } }),
      item('nopark', null),
      item('noparkjoin', { id: 'r2' }),
    ])

    const p1 = await readItemsByPark('p1')
    expect(p1.map(i => i.id)).toEqual(['withpark'])

    // the "All Parks" path still returns everything — no silent total loss
    const all = await readAllItems()
    expect(all.map(i => i.id).sort()).toEqual(['nopark', 'noparkjoin', 'withpark'])
  })

  it('stamps the internal _parkId used by the index without mangling the record', async () => {
    await writeAllItems([item('a', { id: 'r1', park: { id: 'p1' } })])
    const [stored] = await readItemsByPark('p1')
    expect(stored.id).toBe('a')
    expect((stored as { _parkId?: string })._parkId).toBe('p1')
  })
})
