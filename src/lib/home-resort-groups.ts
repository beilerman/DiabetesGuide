import {
  findCategoryForPark,
  findResortForPark,
  RESORT_CONFIG,
  type ResortCategory,
  type ResortConfig,
} from './resort-config'
import type { Park } from './types'

export interface HomeResortPark {
  id: string
  name: string
  itemCount: number
  park: Park
}

export interface HomeResortCategoryGroup {
  id: string
  label: string
  icon: string
  itemCount: number
  locationCount: number
  parks: HomeResortPark[]
}

export interface HomeResortGroup {
  id: string
  name: string
  location: string
  icon: string
  itemCount: number
  locationCount: number
  categories: HomeResortCategoryGroup[]
}

type MutableCategoryGroup = Omit<HomeResortCategoryGroup, 'locationCount' | 'parks'> & {
  sortIndex: number
  parks: Array<HomeResortPark & { sortIndex: number }>
}

type MutableResortGroup = Omit<HomeResortGroup, 'locationCount' | 'categories'> & {
  sortIndex: number
  categories: Map<string, MutableCategoryGroup>
}

const OTHER_RESORT_ID = 'other'
const OTHER_RESORT_NAME = 'Supplemental Dining'
const OTHER_RESORT_LOCATION = 'Additional theme-park dining records'
const OTHER_RESORT_ICON = ''
const OTHER_CATEGORY_ID = 'destinations'
const OTHER_CATEGORY_LABEL = 'Additional Locations'
const OTHER_CATEGORY_ICON = ''

function resortSortIndex(resort: ResortConfig | undefined): number {
  if (!resort) return RESORT_CONFIG.length
  const index = RESORT_CONFIG.findIndex(config => config.id === resort.id)
  return index === -1 ? RESORT_CONFIG.length : index
}

function categorySortIndex(resort: ResortConfig | undefined, category: ResortCategory | undefined): number {
  if (!resort || !category) return 0
  const index = resort.categories.findIndex(config => config.id === category.id)
  return index === -1 ? resort.categories.length : index
}

function parkSortIndex(category: ResortCategory | undefined, park: Park): number {
  const index = category?.matchParkNames?.findIndex(pattern =>
    park.name.toLowerCase().includes(pattern.toLowerCase()),
  )
  return index == null || index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function toResortGroup(group: MutableResortGroup): HomeResortGroup {
  const categories = [...group.categories.values()]
    .sort((a, b) => a.sortIndex - b.sortIndex || a.label.localeCompare(b.label))
    .map(category => {
      const parks = category.parks
        .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))
        .map(park => ({
          id: park.id,
          name: park.name,
          itemCount: park.itemCount,
          park: park.park,
        }))

      return {
        id: category.id,
        label: category.label,
        icon: category.icon,
        itemCount: category.itemCount,
        locationCount: parks.length,
        parks,
      }
    })

  return {
    id: group.id,
    name: group.name,
    location: group.location,
    icon: group.icon,
    itemCount: group.itemCount,
    locationCount: categories.reduce((total, category) => total + category.locationCount, 0),
    categories,
  }
}

export function hasUsableHomeItemCounts(itemCounts: Map<string, number> | undefined): boolean {
  return itemCounts != null && [...itemCounts.values()].some(count => count > 0)
}

export function buildHomeResortGroups(
  parks: Park[],
  itemCounts?: Map<string, number>,
): HomeResortGroup[] {
  const shouldFilterKnownEmptyParks = hasUsableHomeItemCounts(itemCounts)
  const groups = new Map<string, MutableResortGroup>()

  for (const park of parks) {
    const itemCount = itemCounts?.get(park.id) ?? 0
    if (shouldFilterKnownEmptyParks && itemCounts?.has(park.id) && itemCount <= 0) continue

    const resort = findResortForPark(park)
    const category = resort ? findCategoryForPark(resort, park) : undefined
    const resortId = resort?.id ?? OTHER_RESORT_ID
    const categoryId = category?.id ?? OTHER_CATEGORY_ID

    if (!groups.has(resortId)) {
      groups.set(resortId, {
        id: resortId,
        name: resort?.name ?? OTHER_RESORT_NAME,
        location: resort?.location ?? OTHER_RESORT_LOCATION,
        icon: resort?.icon ?? OTHER_RESORT_ICON,
        sortIndex: resortSortIndex(resort),
        itemCount: 0,
        categories: new Map(),
      })
    }

    const group = groups.get(resortId)!
    group.itemCount += itemCount

    if (!group.categories.has(categoryId)) {
      group.categories.set(categoryId, {
        id: categoryId,
        label: category?.label ?? OTHER_CATEGORY_LABEL,
        icon: category?.icon ?? OTHER_CATEGORY_ICON,
        sortIndex: categorySortIndex(resort, category),
        itemCount: 0,
        parks: [],
      })
    }

    const categoryGroup = group.categories.get(categoryId)!
    categoryGroup.itemCount += itemCount
    categoryGroup.parks.push({
      id: park.id,
      name: park.name,
      itemCount,
      park,
      sortIndex: parkSortIndex(category, park),
    })
  }

  return [...groups.values()]
    .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))
    .map(toResortGroup)
}
