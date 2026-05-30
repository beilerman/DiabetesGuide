import { openDB, type IDBPDatabase } from 'idb'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

const DB_NAME = 'diabetesguide'
// v2: the `items` park index moved from the fragile nested keyPath
// 'restaurant.park.id' to a flat, denormalized `_parkId` field computed at write
// time (see parkIdOf). IndexedDB excludes a record from an index whenever any
// segment of a nested keyPath is missing, so if a cached item's restaurant/park
// join came back null — or as a one-element array instead of an object, which a
// Supabase nested select can produce — readItemsByPark silently omitted it,
// under-reporting a park's food offline. On a tool meant for in-park use with
// poor connectivity, that's exactly when it must be complete.
const DB_VERSION = 2

/**
 * Cached menu item plus a denormalized park id used solely for the offline
 * `by-park` index. Prefixed with `_` to mark it as an internal cache field, not
 * part of the domain model.
 */
type StoredMenuItem = MenuItemWithNutrition & { _parkId?: string }

interface DGSchema {
  parks: { key: string; value: Park }
  restaurants: { key: string; value: Restaurant; indexes: { parkId: string } }
  items: { key: string; value: StoredMenuItem; indexes: { parkId: string; category: string } }
  metadata: { key: string; value: { key: string; value: string } }
}

/**
 * Extract a park id from an item, tolerating the shapes a Supabase nested select
 * can produce: `restaurant` (and `restaurant.park`) may be a single object or a
 * one-element array. Returns undefined when no park id is present, in which case
 * the item simply isn't indexed by park (it's still returned by readAllItems and
 * the "All Parks" view).
 */
function parkIdOf(item: MenuItemWithNutrition): string | undefined {
  const r = item.restaurant as unknown
  const restaurant = Array.isArray(r) ? r[0] : r
  if (!restaurant || typeof restaurant !== 'object') return undefined
  const p = (restaurant as { park?: unknown }).park
  const park = Array.isArray(p) ? p[0] : p
  if (!park || typeof park !== 'object') return undefined
  const id = (park as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}

function toStored(item: MenuItemWithNutrition): StoredMenuItem {
  const _parkId = parkIdOf(item)
  return _parkId ? { ...item, _parkId } : { ...item }
}

let dbPromise: Promise<IDBPDatabase<DGSchema>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DGSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('parks')) {
          db.createObjectStore('parks', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('restaurants')) {
          const store = db.createObjectStore('restaurants', { keyPath: 'id' })
          store.createIndex('parkId', 'park_id')
        }
        // The items store's park index changed keyPath in v2. Recreate the store
        // so the index is rebuilt and any pre-v2 rows (which lack `_parkId`) are
        // dropped — they're a cache and get refetched online-first.
        if (db.objectStoreNames.contains('items') && oldVersion < 2) {
          db.deleteObjectStore('items')
        }
        if (!db.objectStoreNames.contains('items')) {
          const store = db.createObjectStore('items', { keyPath: 'id' })
          store.createIndex('parkId', '_parkId')
          store.createIndex('category', 'category')
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
        }
      },
    })
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
    ...items.map(item => tx.store.put(toStored(item))),
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

export function __resetDbForTests(): void {
  dbPromise = null
}
