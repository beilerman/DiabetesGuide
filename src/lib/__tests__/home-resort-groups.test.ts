import { describe, expect, it } from 'vitest'
import { buildHomeResortGroups } from '../home-resort-groups'
import type { Park } from '../types'

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

describe('buildHomeResortGroups', () => {
  it('groups visible parks by resort and category in destination order', () => {
    const parks = [
      makePark('fair', 'Local Fair'),
      makePark('grand-floridian', "Disney's Grand Floridian Resort"),
      makePark('magic-kingdom', 'Magic Kingdom Park'),
      makePark('blizzard-beach', "Disney's Blizzard Beach Water Park"),
      makePark('disneyland', 'Disneyland Park'),
      makePark('epic-hotels', 'Epic Universe Hotels'),
      makePark('aulani-empty', 'Aulani, A Disney Resort & Spa'),
    ]
    const counts = new Map([
      ['fair', 4],
      ['grand-floridian', 12],
      ['magic-kingdom', 20],
      ['blizzard-beach', 3],
      ['disneyland', 8],
      ['epic-hotels', 6],
      ['aulani-empty', 0],
    ])

    const groups = buildHomeResortGroups(parks, counts)

    expect(groups.map(group => group.name)).toEqual([
      'Walt Disney World',
      'Disneyland Resort',
      'Universal Orlando Resort',
      'Other Destinations',
    ])

    const wdw = groups[0]
    expect(wdw.itemCount).toBe(35)
    expect(wdw.locationCount).toBe(3)
    expect(wdw.categories.map(category => category.label)).toEqual([
      'Theme Parks',
      'Water Parks',
      'Resort Hotels',
    ])
    expect(wdw.categories[0].parks.map(park => park.name)).toEqual(['Magic Kingdom Park'])
    expect(wdw.categories[1].parks.map(park => park.name)).toEqual(["Disney's Blizzard Beach Water Park"])
    expect(wdw.categories[2].parks.map(park => park.name)).toEqual(["Disney's Grand Floridian Resort"])

    const universal = groups.find(group => group.name === 'Universal Orlando Resort')!
    expect(universal.categories.map(category => category.label)).toEqual(['Resort Hotels'])
    expect(universal.categories[0].parks.map(park => park.name)).toEqual(['Epic Universe Hotels'])

    const other = groups.at(-1)!
    expect(other.name).toBe('Other Destinations')
    expect(other.categories[0].label).toBe('Destinations')
    expect(other.categories[0].itemCount).toBe(4)
  })

  it('keeps configured resorts visible while counts are still loading', () => {
    const parks = [
      makePark('magic-kingdom', 'Magic Kingdom Park'),
      makePark('aulani', 'Aulani, A Disney Resort & Spa'),
    ]

    const groups = buildHomeResortGroups(parks)

    expect(groups.map(group => group.name)).toEqual(['Walt Disney World', 'Aulani Resort'])
    expect(groups[0].itemCount).toBe(0)
    expect(groups[0].categories[0].itemCount).toBe(0)
  })

  it('keeps destination cards visible when the count map is empty', () => {
    const parks = [
      makePark('magic-kingdom', 'Magic Kingdom Park'),
      makePark('disneyland', 'Disneyland Park'),
    ]

    const groups = buildHomeResortGroups(parks, new Map())

    expect(groups.map(group => group.name)).toEqual(['Walt Disney World', 'Disneyland Resort'])
    expect(groups[0].categories.map(category => category.label)).toEqual(['Theme Parks'])
    expect(groups[0].categories[0].parks.map(park => park.name)).toEqual(['Magic Kingdom Park'])
  })
})
