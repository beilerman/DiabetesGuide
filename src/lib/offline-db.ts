import { openDB, type IDBPDatabase } from 'idb'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

const DB_NAME = 'diabetesguide'
const DB_VERSION = 1

interface DGSchema {
  parks: { key: string; value: Park }
  restaurants: { key: string; value: Restaurant; indexes: { parkId: string } }
  items: { key: string; value: MenuItemWithNutrition; indexes: { parkId: string; category: string } }
  metadata: { key: string; value: { key: string; value: string } }
}

let dbPromise: Promise<IDBPDatabase<DGSchema>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DGSchema>(DB_NAME, DB_VERSION, {
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
