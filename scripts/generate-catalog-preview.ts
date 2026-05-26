import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCategoryForPark, findResortForPark } from '../src/lib/resort-config'
import type { CatalogPreview, CatalogPreviewPark } from '../src/lib/catalog-preview'
import type { Park } from '../src/lib/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

interface RawItem {
  land?: string
  restaurant?: string
}

interface RawPark {
  id?: string
  name: string
  menuItems?: RawItem[]
}

interface MutablePreviewPark {
  id: string
  name: string
  location: string
  timezone: string
  resortId: string
  categoryId: string
  itemCount: number
  restaurants: Set<string>
  lands: Set<string>
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function canonicalParkName(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'magic kingdom') return 'Magic Kingdom Park'
  if (normalized === 'hollywood studios') return "Disney's Hollywood Studios"
  if (normalized === 'walt disney world parks') return 'Walt Disney World Specialty Carts'
  return name
}

function inferLocation(parkName: string): string {
  const n = parkName.toLowerCase()
  if (/aulani/.test(n)) return 'Aulani Resort'
  if (/disney (magic|wonder|dream|fantasy|wish|treasure)/.test(n)) return 'Disney Cruise Line'
  if (/downtown disney|disneyland/.test(n)) return 'Disneyland Resort'
  if (/disney|magic kingdom|epcot|hollywood studios|animal kingdom/.test(n)) return 'Walt Disney World'
  if (/epic universe/.test(n)) return 'Universal Orlando Resort'
  if (/universal.*(hollywood|studios hollywood)/.test(n)) return 'Universal Hollywood'
  if (/universal|islands of adventure|volcano bay/.test(n)) return 'Universal Orlando Resort'
  if (/seaworld/.test(n) || /busch gardens/.test(n)) return 'SeaWorld Parks'
  return 'Other'
}

function inferTimezone(parkName: string): string {
  const n = parkName.toLowerCase()
  if (/aulani/.test(n)) return 'Pacific/Honolulu'
  if (/disneyland|downtown disney|hollywood/.test(n)) return 'America/Los_Angeles'
  return 'America/New_York'
}

function toParkForConfig(name: string): Park {
  return {
    id: slugify(name),
    name,
    location: inferLocation(name),
    timezone: inferTimezone(name),
    first_aid_locations: [],
    created_at: '',
  }
}

function getSnapshotDate(): string {
  const approvedDir = resolve(root, 'data', 'approved')
  const datedFiles = readdirSync(approvedDir)
    .map(file => file.match(/20\d{2}-\d{2}-\d{2}/)?.[0])
    .filter((date): date is string => Boolean(date))
    .sort()

  return datedFiles.at(-1) ?? new Date().toISOString().slice(0, 10)
}

function readRawParks(): RawPark[] {
  const parksDir = resolve(root, 'data', 'parks')
  return readdirSync(parksDir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .flatMap(file => {
      const raw = JSON.parse(readFileSync(resolve(parksDir, file), 'utf8')) as { parks?: RawPark[] }
      return raw.parks ?? []
    })
}

function buildPreview(): CatalogPreview {
  const parks = new Map<string, MutablePreviewPark>()

  for (const rawPark of readRawParks()) {
    if ((rawPark.menuItems?.length ?? 0) === 0) continue

    const displayName = canonicalParkName(rawPark.name)
    const parkForConfig = toParkForConfig(displayName)
    const resort = findResortForPark(parkForConfig)
    const category = resort ? findCategoryForPark(resort, parkForConfig) : undefined
    const key = slugify(displayName)

    if (!parks.has(key)) {
      parks.set(key, {
        id: key,
        name: displayName,
        location: parkForConfig.location,
        timezone: parkForConfig.timezone,
        resortId: resort?.id ?? 'other',
        categoryId: category?.id ?? 'destinations',
        itemCount: 0,
        restaurants: new Set<string>(),
        lands: new Set<string>(),
      })
    }

    const park = parks.get(key)!
    for (const item of rawPark.menuItems ?? []) {
      park.itemCount += 1
      if (item.restaurant) park.restaurants.add(`${item.land ?? ''}|||${item.restaurant}`)
      if (item.land) park.lands.add(item.land)
    }
  }

  const previewParks: CatalogPreviewPark[] = [...parks.values()]
    .map(park => ({
      id: park.id,
      name: park.name,
      location: park.location,
      timezone: park.timezone,
      resortId: park.resortId,
      categoryId: park.categoryId,
      itemCount: park.itemCount,
      restaurantCount: park.restaurants.size,
      lands: [...park.lands].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    version: 1,
    snapshotDate: getSnapshotDate(),
    generatedAt: new Date().toISOString(),
    totalItems: previewParks.reduce((sum, park) => sum + park.itemCount, 0),
    totalRestaurants: previewParks.reduce((sum, park) => sum + park.restaurantCount, 0),
    totalDestinations: previewParks.length,
    parks: previewParks,
  }
}

function writePreview(preview: CatalogPreview) {
  const publicDir = resolve(root, 'public', 'data')
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(resolve(publicDir, 'catalog-preview.json'), `${JSON.stringify(preview, null, 2)}\n`)

  const source = `import type { CatalogPreview } from '../lib/catalog-preview'\n\nexport const CATALOG_PREVIEW = ${JSON.stringify(preview, null, 2)} as const satisfies CatalogPreview\n`
  writeFileSync(resolve(root, 'src', 'data', 'catalog-preview.ts'), source)
}

writePreview(buildPreview())
