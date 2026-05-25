import { describe, expect, it } from 'vitest'
import { groupMenuItemsByLocation } from '../menu-location-groups'
import type { MenuItemWithNutrition, Park } from '../types'

function makePark(id: string, name: string): Park {
  return {
    id,
    name,
    location: '',
    timezone: '',
    first_aid_locations: [],
    created_at: '',
  }
}

function makeItem({
  id,
  name,
  park,
  land,
  restaurant,
}: {
  id: string
  name: string
  park: Park
  land: string | null
  restaurant: string
}): MenuItemWithNutrition {
  return {
    id,
    restaurant_id: `${restaurant}-id`,
    name,
    description: null,
    price: null,
    category: 'entree',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: [],
    allergens: [],
    restaurant: {
      id: `${restaurant}-id`,
      park_id: park.id,
      name: restaurant,
      land,
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
      park,
    },
  }
}

describe('groupMenuItemsByLocation', () => {
  it('groups menu items by resort, category, venue, land, and restaurant', () => {
    const magicKingdom = makePark('mk', 'Magic Kingdom Park')
    const epcot = makePark('epcot', 'EPCOT')
    const epcotFestival = makePark('epcot-festival', 'EPCOT Flower & Garden Festival 2026')
    const blizzardBeach = makePark('blizzard-beach', "Disney's Blizzard Beach Water Park")
    const grandFloridian = makePark('grand-floridian', "Disney's Grand Floridian Resort")
    const wdwHotels = makePark('wdw-hotels', 'Walt Disney World Resorts')
    const items = [
      makeItem({
        id: 'garden-salad',
        name: 'Garden Salad',
        park: epcot,
        land: 'World Celebration',
        restaurant: 'Connections Eatery',
      }),
      makeItem({
        id: 'dole-whip',
        name: 'DOLE Whip',
        park: magicKingdom,
        land: 'Adventureland',
        restaurant: 'Aloha Isle',
      }),
      makeItem({
        id: 'turkey-leg',
        name: 'Turkey Leg',
        park: magicKingdom,
        land: 'Frontierland',
        restaurant: 'Turkey Leg Cart',
      }),
      makeItem({
        id: 'festival-skewer',
        name: 'Festival Skewer',
        park: epcotFestival,
        land: 'World Showcase',
        restaurant: 'Festival Booth',
      }),
      makeItem({
        id: 'bread-pudding',
        name: 'Bread Pudding',
        park: wdwHotels,
        land: null,
        restaurant: "Ohana",
      }),
      makeItem({
        id: 'shaved-ice',
        name: 'Shaved Ice',
        park: blizzardBeach,
        land: 'Polar Patios',
        restaurant: 'Cooling Hut',
      }),
      makeItem({
        id: 'seafood-salad',
        name: 'Seafood Salad',
        park: grandFloridian,
        land: null,
        restaurant: 'Grand Floridian Cafe',
      }),
    ]

    const groups = groupMenuItemsByLocation(items, [
      magicKingdom,
      epcot,
      epcotFestival,
      blizzardBeach,
      grandFloridian,
      wdwHotels,
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Walt Disney World')
    expect(groups[0].itemCount).toBe(7)
    expect(groups[0].categories.map(category => category.name)).toEqual([
      'Theme Parks',
      'Water Parks',
      'Resort Hotels',
      'Seasonal & Festivals',
    ])
    expect(groups[0].categories[0].venues.map(venue => venue.name)).toEqual(['Magic Kingdom Park', 'EPCOT'])
    expect(groups[0].categories[0].venues[0].areas.map(area => area.name)).toEqual([
      'Adventureland',
      'Frontierland',
    ])
    expect(groups[0].categories[0].venues[0].areas[0].restaurants[0].name).toBe('Aloha Isle')
    expect(groups[0].categories[0].venues[0].areas[0].restaurants[0].items.map(item => item.id)).toEqual(['dole-whip'])
    const resortHotels = groups[0].categories.find(category => category.name === 'Resort Hotels')!
    expect(resortHotels.venues.map(venue => venue.name)).toContain("Disney's Grand Floridian Resort")
    expect(resortHotels.venues.map(venue => venue.name)).toContain('Walt Disney World Resorts')
    expect(resortHotels.venues.find(venue => venue.name === 'Walt Disney World Resorts')!.areas[0].name).toBe('Dining Locations')
    const seasonal = groups[0].categories.find(category => category.name === 'Seasonal & Festivals')!
    expect(seasonal.venues.map(venue => venue.name)).toEqual(['EPCOT Flower & Garden Festival 2026'])
  })

  it('keeps natural category order while matching more specific venue names', () => {
    const universalStudios = makePark('usf', 'Universal Studios Florida')
    const epicHotels = makePark('epic-hotels', 'Epic Universe Hotels')
    const groups = groupMenuItemsByLocation([
      makeItem({
        id: 'burger',
        name: 'Burger',
        park: universalStudios,
        land: 'New York',
        restaurant: 'Louies',
      }),
      makeItem({
        id: 'smoothie',
        name: 'Smoothie',
        park: epicHotels,
        land: null,
        restaurant: 'Hotel Market',
      }),
    ], [universalStudios, epicHotels])

    expect(groups[0].name).toBe('Universal Orlando Resort')
    expect(groups[0].categories.map(category => category.name)).toEqual(['Theme Parks', 'Resort Hotels'])
    expect(groups[0].categories[1].venues.map(venue => venue.name)).toEqual(['Epic Universe Hotels'])
  })

  it('keeps unknown parks in an other destinations group', () => {
    const localPark = makePark('local', 'Local Fair')
    const item = makeItem({
      id: 'corn',
      name: 'Roasted Corn',
      park: localPark,
      land: null,
      restaurant: 'Main Stand',
    })

    const groups = groupMenuItemsByLocation([item], [localPark])

    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Other Destinations')
    expect(groups[0].categories[0].name).toBe('Destinations')
    expect(groups[0].categories[0].venues[0].name).toBe('Local Fair')
  })
})
