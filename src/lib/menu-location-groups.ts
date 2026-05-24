import { findCategoryForPark, findResortForPark, RESORT_CONFIG } from './resort-config'
import type { MenuItemWithNutrition, Park } from './types'

export interface RestaurantLocationGroup {
  id: string
  name: string
  itemCount: number
  items: MenuItemWithNutrition[]
}

export interface AreaLocationGroup {
  id: string
  name: string
  itemCount: number
  restaurants: RestaurantLocationGroup[]
}

export interface VenueLocationGroup {
  id: string
  name: string
  itemCount: number
  areas: AreaLocationGroup[]
}

export interface CategoryLocationGroup {
  id: string
  name: string
  icon: string
  itemCount: number
  venues: VenueLocationGroup[]
}

export interface ResortLocationGroup {
  id: string
  name: string
  icon: string
  itemCount: number
  categories: CategoryLocationGroup[]
}

type MutableRestaurantGroup = RestaurantLocationGroup
type MutableAreaGroup = Omit<AreaLocationGroup, 'restaurants'> & {
  restaurants: Map<string, MutableRestaurantGroup>
}
type MutableVenueGroup = Omit<VenueLocationGroup, 'areas'> & {
  sortIndex: number
  areas: Map<string, MutableAreaGroup>
}
type MutableCategoryGroup = Omit<CategoryLocationGroup, 'venues'> & {
  sortIndex: number
  venues: Map<string, MutableVenueGroup>
}
type MutableResortGroup = Omit<ResortLocationGroup, 'categories'> & {
  sortIndex: number
  categories: Map<string, MutableCategoryGroup>
}

interface LocationMeta {
  resort: {
    id: string
    name: string
    icon: string
    sortIndex: number
  }
  category: {
    id: string
    name: string
    icon: string
    sortIndex: number
  }
  venueSortIndex: number
}

const OTHER_GROUP_ID = 'other'
const OTHER_GROUP_NAME = 'Other Destinations'
const OTHER_GROUP_ICON = ''
const OTHER_CATEGORY_ID = 'destinations'
const OTHER_CATEGORY_NAME = 'Destinations'
const OTHER_CATEGORY_ICON = ''
const DEFAULT_AREA_NAME = 'Dining Locations'
const UNKNOWN_RESTAURANT_NAME = 'Unknown Restaurant'

function slug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'unknown'
}

function parkFromItem(item: MenuItemWithNutrition, parksById: Map<string, Park>): Park | undefined {
  if (item.restaurant?.park) return item.restaurant.park
  if (item.restaurant?.park_id) return parksById.get(item.restaurant.park_id)
  return undefined
}

function locationMeta(park: Park | undefined): LocationMeta {
  const resort = park ? findResortForPark(park) : undefined
  if (!resort) {
    return {
      resort: {
        id: OTHER_GROUP_ID,
        name: OTHER_GROUP_NAME,
        icon: OTHER_GROUP_ICON,
        sortIndex: RESORT_CONFIG.length,
      },
      category: {
        id: OTHER_CATEGORY_ID,
        name: OTHER_CATEGORY_NAME,
        icon: OTHER_CATEGORY_ICON,
        sortIndex: 0,
      },
      venueSortIndex: Number.MAX_SAFE_INTEGER,
    }
  }

  const resortSortIndex = RESORT_CONFIG.findIndex(config => config.id === resort.id)
  const category = park ? findCategoryForPark(resort, park) : undefined
  const categorySortIndex = category
    ? resort.categories.findIndex(config => config.id === category.id)
    : resort.categories.length
  const venueSortIndex = category?.matchParkNames?.findIndex(pattern =>
    park?.name.toLowerCase().includes(pattern.toLowerCase()),
  ) ?? Number.MAX_SAFE_INTEGER

  return {
    resort: {
      id: resort.id,
      name: resort.name,
      icon: resort.icon,
      sortIndex: resortSortIndex === -1 ? RESORT_CONFIG.length : resortSortIndex,
    },
    category: {
      id: category?.id ?? 'other',
      name: category?.label ?? 'Other Locations',
      icon: category?.icon ?? '',
      sortIndex: categorySortIndex === -1 ? resort.categories.length : categorySortIndex,
    },
    venueSortIndex: venueSortIndex === -1 ? Number.MAX_SAFE_INTEGER : venueSortIndex,
  }
}

function resortComparator(a: MutableResortGroup, b: MutableResortGroup): number {
  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex
  return a.name.localeCompare(b.name)
}

function categoryComparator(a: MutableCategoryGroup, b: MutableCategoryGroup): number {
  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex
  return a.name.localeCompare(b.name)
}

function groupComparator<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name)
}

function venueComparator(a: MutableVenueGroup, b: MutableVenueGroup): number {
  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex
  return a.name.localeCompare(b.name)
}

function toVenueGroup(venue: MutableVenueGroup): VenueLocationGroup {
  return {
    id: venue.id,
    name: venue.name,
    itemCount: venue.itemCount,
    areas: [...venue.areas.values()]
      .sort(groupComparator)
      .map(area => ({
        id: area.id,
        name: area.name,
        itemCount: area.itemCount,
        restaurants: [...area.restaurants.values()].sort(groupComparator),
      })),
  }
}

export function groupMenuItemsByLocation(
  items: MenuItemWithNutrition[],
  parks: Park[] = [],
): ResortLocationGroup[] {
  const parksById = new Map(parks.map(park => [park.id, park]))
  const resortGroups = new Map<string, MutableResortGroup>()

  for (const item of items) {
    const park = parkFromItem(item, parksById)
    const location = locationMeta(park)
    const venueName = park?.name ?? item.restaurant?.park?.name ?? 'Unknown Destination'
    const venueId = park?.id ?? `venue-${slug(venueName)}`
    const areaName = item.restaurant?.land?.trim() || DEFAULT_AREA_NAME
    const areaId = `${venueId}:${slug(areaName)}`
    const restaurantName = item.restaurant?.name?.trim() || UNKNOWN_RESTAURANT_NAME
    const restaurantId = item.restaurant?.id ?? `${areaId}:${slug(restaurantName)}`

    if (!resortGroups.has(location.resort.id)) {
      resortGroups.set(location.resort.id, {
        id: location.resort.id,
        name: location.resort.name,
        icon: location.resort.icon,
        sortIndex: location.resort.sortIndex,
        itemCount: 0,
        categories: new Map(),
      })
    }
    const resortGroup = resortGroups.get(location.resort.id)!
    resortGroup.itemCount++

    if (!resortGroup.categories.has(location.category.id)) {
      resortGroup.categories.set(location.category.id, {
        id: location.category.id,
        name: location.category.name,
        icon: location.category.icon,
        sortIndex: location.category.sortIndex,
        itemCount: 0,
        venues: new Map(),
      })
    }
    const category = resortGroup.categories.get(location.category.id)!
    category.itemCount++

    if (!category.venues.has(venueId)) {
      category.venues.set(venueId, {
        id: venueId,
        name: venueName,
        sortIndex: location.venueSortIndex,
        itemCount: 0,
        areas: new Map(),
      })
    }
    const venue = category.venues.get(venueId)!
    venue.itemCount++

    if (!venue.areas.has(areaId)) {
      venue.areas.set(areaId, {
        id: areaId,
        name: areaName,
        itemCount: 0,
        restaurants: new Map(),
      })
    }
    const area = venue.areas.get(areaId)!
    area.itemCount++

    if (!area.restaurants.has(restaurantId)) {
      area.restaurants.set(restaurantId, {
        id: restaurantId,
        name: restaurantName,
        itemCount: 0,
        items: [],
      })
    }
    const restaurant = area.restaurants.get(restaurantId)!
    restaurant.itemCount++
    restaurant.items.push(item)
  }

  return [...resortGroups.values()]
    .sort(resortComparator)
    .map(resort => ({
      id: resort.id,
      name: resort.name,
      icon: resort.icon,
      itemCount: resort.itemCount,
      categories: [...resort.categories.values()]
        .sort(categoryComparator)
        .map(category => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          itemCount: category.itemCount,
          venues: [...category.venues.values()].sort(venueComparator).map(toVenueGroup),
        })),
    }))
}
