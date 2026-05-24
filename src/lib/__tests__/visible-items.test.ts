import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VISIBLE_ITEMS,
  getNextVisibleCount,
  getVisibleItems,
  hasMoreVisibleItems,
} from '../visible-items'

describe('visible item paging', () => {
  it('returns the first visible batch', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)

    expect(getVisibleItems(items, 12)).toEqual(items.slice(0, 12))
  })

  it('does not exceed the total count when loading more', () => {
    expect(getNextVisibleCount(96, 100, DEFAULT_VISIBLE_ITEMS)).toBe(100)
  })

  it('reports whether more items are available', () => {
    expect(hasMoreVisibleItems(100, 48)).toBe(true)
    expect(hasMoreVisibleItems(100, 100)).toBe(false)
  })
})
