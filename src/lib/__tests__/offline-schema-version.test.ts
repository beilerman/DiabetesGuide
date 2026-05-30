import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  writeAllItems,
  readAllItems,
  setLastSync,
  getLastSync,
  DATA_SCHEMA_VERSION,
  __getStoredSchemaVersion,
  __setStoredSchemaVersion,
  __closeDbForTests,
} from '../offline-db'
import type { MenuItemWithNutrition } from '../types'

const mockItem = {
  id: 'm1',
  restaurant_id: 'r1',
  name: 'Cheeseburger',
  description: null,
  price: 12.99,
  category: 'entree' as const,
  is_seasonal: false,
  is_fried: false,
  is_vegetarian: false,
  photo_url: null,
  created_at: '2026-01-01',
  nutritional_data: [],
  allergens: [],
  // The items `parkId` index reads restaurant.park.id, so the nested shape must exist.
  restaurant: { id: 'r1', park: { id: 'p1' } },
} as unknown as MenuItemWithNutrition

// Fully tear down the DB between tests: close any live connection FIRST (so the
// delete isn't blocked), then delete and await completion.
async function resetDatabase(): Promise<void> {
  await __closeDbForTests()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('diabetesguide')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

// Regression for finding 053 (data-integrity half): a returning PWA user whose
// cached rows predate a type-shape change must not be served stale-shape data.
// On open, the persisted data-schema version is compared to the code's
// DATA_SCHEMA_VERSION; on mismatch the data stores are dropped (lastSync kept).
describe('offline-db schema versioning', () => {
  beforeEach(resetDatabase)

  it('stamps the current schema version on a fresh DB', async () => {
    await readAllItems() // triggers open → ensureSchemaVersion
    expect(await __getStoredSchemaVersion()).toBe(String(DATA_SCHEMA_VERSION))
  })

  it('drops cached data when the stored schema version is stale', async () => {
    await writeAllItems([mockItem])
    expect(await readAllItems()).toHaveLength(1)

    // Simulate data written by an older app build, then re-open.
    await __setStoredSchemaVersion('1')
    await __closeDbForTests()

    // The first access after re-open detects the mismatch and clears the stores.
    expect(await readAllItems()).toHaveLength(0)
    expect(await __getStoredSchemaVersion()).toBe(String(DATA_SCHEMA_VERSION))
  })

  it('preserves lastSync across a schema-version bump', async () => {
    await setLastSync('2026-01-01T00:00:00Z')
    await writeAllItems([mockItem])

    await __setStoredSchemaVersion('1')
    await __closeDbForTests()

    expect(await readAllItems()).toHaveLength(0) // data dropped
    expect(await getLastSync()).toBe('2026-01-01T00:00:00Z') // metadata kept
  })

  it('keeps data when the stored version already matches', async () => {
    await writeAllItems([mockItem])
    await __closeDbForTests() // re-open with a matching version
    expect(await readAllItems()).toHaveLength(1)
  })
})
