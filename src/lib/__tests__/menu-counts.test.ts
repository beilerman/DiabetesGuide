import { describe, expect, it } from 'vitest'
import { countMenuItemsByPark } from '../menu-counts'

describe('countMenuItemsByPark', () => {
  it('counts menu items by park in one pass through restaurant ids', () => {
    const counts = countMenuItemsByPark(
      [
        { id: 'r1', park_id: 'mk' },
        { id: 'r2', park_id: 'mk' },
        { id: 'r3', park_id: 'epcot' },
      ],
      [
        { restaurant_id: 'r1' },
        { restaurant_id: 'r1' },
        { restaurant_id: 'r2' },
        { restaurant_id: 'r3' },
      ],
    )

    expect([...counts.entries()]).toEqual([
      ['mk', 3],
      ['epcot', 1],
    ])
  })

  it('keeps known parks with restaurants at zero and ignores orphan item rows', () => {
    const counts = countMenuItemsByPark(
      [
        { id: 'r1', park_id: 'mk' },
        { id: 'r2', park_id: 'empty-park' },
      ],
      [
        { restaurant_id: 'r1' },
        { restaurant_id: 'missing-restaurant' },
      ],
    )

    expect(counts.get('mk')).toBe(1)
    expect(counts.get('empty-park')).toBe(0)
    expect(counts.has('missing-restaurant')).toBe(false)
  })
})
