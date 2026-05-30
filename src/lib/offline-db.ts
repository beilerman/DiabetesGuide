import { openDB, type IDBPDatabase } from 'idb'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

const DB_NAME = 'diabetesguide'
const DB_VERSION = 1

/**
 * Data-shape version, independent of the structural IndexedDB `DB_VERSION`.
 *
 * Bump this whenever the cached value shapes change — the fields of
 * `Park` / `Restaurant` / `MenuItemWithNutrition` in `types.ts`, or the `items`
 * `parkId` index path (`restaurant.park.id`). On the next open,
 * `ensureSchemaVersion()` detects the mismatch and clears the data stores
 * (parks/restaurants/items) so a returning PWA user can't be served rows with
 * missing/renamed fields — a real risk on a nutrition tool feeding insulin
 * decisions. The `metadata` store (and thus `lastSync`) is left intact.
 *
 * History:
 *   1 — implicit original shape (pre-versioning; treated as "needs refresh")
 *   2 — first versioned shape (alcohol_grams, source_detail, updated_at present)
 */
export const DATA_SCHEMA_VERSION = 2
const SCHEMA_VERSION_KEY = 'schemaVersion'

interface DGSchema {
  parks: { key: string; value: Park }
  restaurants: { key: string; value: Restaurant; indexes: { parkId: string } }
  items: { key: string; value: MenuItemWithNutrition; indexes: { parkId: string; category: string } }
  metadata: { key: string; value: { key: string; value: string } }
}

let dbPromise: Promise<IDBPDatabase<DGSchema>> | null = null

/**
 * Drop the data stores (but not `metadata`, so `lastSync` survives) when the
 * persisted data-shape version doesn't match the current code's
 * `DATA_SCHEMA_VERSION`. Runs once per open via the memoized `dbPromise`. A
 * fresh DB (no stored version) is treated as a mismatch — clearing empty stores
 * is a harmless no-op and stamps the version.
 */
async function ensureSchemaVersion(db: IDBPDatabase<DGSchema>): Promise<void> {
  const record = await db.get('metadata', SCHEMA_VERSION_KEY)
  if (record?.value === String(DATA_SCHEMA_VERSION)) return

  const tx = db.transaction(['parks', 'restaurants', 'items'], 'readwrite')
  await Promise.all([
    tx.objectStore('parks').clear(),
    tx.objectStore('restaurants').clear(),
    tx.objectStore('items').clear(),
    tx.done,
  ])
  await db.put('metadata', { key: SCHEMA_VERSION_KEY, value: String(DATA_SCHEMA_VERSION) })
}

async function openCacheDb(): Promise<IDBPDatabase<DGSchema>> {
  const db = await openDB<DGSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('parks')) {
        db.createObjectStore('parks', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('restaurants')) {
        const store = db.createObjectStore('restaurants', { keyPath: 'id' })
        store.createIndex('parkId', 'park_id')
      }
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id' })
        store.createIndex('parkId', 'restaurant.park.id')
        store.createIndex('category', 'category')
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' })
      }
    },
  })
  await ensureSchemaVersion(db)
  return db
}

function getDb() {
  if (!dbPromise) {
    dbPromise = openCacheDb()
  }
  return dbPromise
}

// Parks
export async function writeParks(parks: Park[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('parks', 'readwrite')
  await Promise.all([
    ...parks.map(p => tx.store.put(p)),
    tx.done,
  ])
}

export async function readParks(): Promise<Park[]> {
  const db = await getDb()
  return db.getAll('parks')
}

// Restaurants
export async function writeRestaurants(restaurants: Restaurant[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('restaurants', 'readwrite')
  await Promise.all([
    ...restaurants.map(r => tx.store.put(r)),
    tx.done,
  ])
}

export async function readRestaurants(): Promise<Restaurant[]> {
  const db = await getDb()
  return db.getAll('restaurants')
}

export async function readRestaurantsByPark(parkId: string): Promise<Restaurant[]> {
  const db = await getDb()
  return db.getAllFromIndex('restaurants', 'parkId', parkId)
}

// Menu items
export async function writeAllItems(items: MenuItemWithNutrition[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('items', 'readwrite')
  await Promise.all([
    ...items.map(item => tx.store.put(item)),
    tx.done,
  ])
}

export async function readAllItems(): Promise<MenuItemWithNutrition[]> {
  const db = await getDb()
  return db.getAll('items')
}

export async function readItemsByPark(parkId: string): Promise<MenuItemWithNutrition[]> {
  const db = await getDb()
  return db.getAllFromIndex('items', 'parkId', parkId)
}

// Metadata
export async function getLastSync(): Promise<string | null> {
  const db = await getDb()
  const record = await db.get('metadata', 'lastSync')
  return record?.value ?? null
}

export async function setLastSync(ts: string): Promise<void> {
  const db = await getDb()
  await db.put('metadata', { key: 'lastSync', value: ts })
}

// Clear all stores
export async function clearOfflineData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['parks', 'restaurants', 'items', 'metadata'], 'readwrite')
  await Promise.all([
    tx.objectStore('parks').clear(),
    tx.objectStore('restaurants').clear(),
    tx.objectStore('items').clear(),
    tx.objectStore('metadata').clear(),
    tx.done,
  ])
}

// --- Test-only helpers (schema versioning) ---

/** Test-only: the persisted data-shape version (or null on a fresh/cleared DB). */
export async function __getStoredSchemaVersion(): Promise<string | null> {
  const db = await getDb()
  const record = await db.get('metadata', SCHEMA_VERSION_KEY)
  return record?.value ?? null
}

/** Test-only: write a raw schema version to simulate data from an older app build. */
export async function __setStoredSchemaVersion(v: string): Promise<void> {
  const db = await getDb()
  await db.put('metadata', { key: SCHEMA_VERSION_KEY, value: v })
}

/**
 * Test-only: close the live connection and drop the memo so the next call
 * re-opens and re-runs the version check. Closing matters — leaving a connection
 * open blocks `indexedDB.deleteDatabase`, and opening a fresh connection then
 * unblocks the pending delete, wiping the DB out from under the new connection.
 */
export async function __closeDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null)
    db?.close()
    dbPromise = null
  }
}
