import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCompare, __resetCompareState } from '../useCompare'
import type { MenuItemWithNutrition } from '../../lib/types'

function makeItem(id: string, name: string): MenuItemWithNutrition {
  return {
    id,
    name,
    category: 'entree',
    description: null,
    price: null,
    is_vegetarian: false,
    is_fried: false,
    is_seasonal: false,
    restaurant_id: 'rest-1',
    restaurant: { id: 'rest-1', name: 'Test Restaurant', park_id: 'park-1', park: { id: 'park-1', name: 'Test Park' } },
    nutritional_data: [{
      id: 'nd-1',
      menu_item_id: id,
      calories: 500,
      carbs: 60,
      fat: 20,
      protein: 20,
      sugar: 10,
      fiber: 3,
      sodium: 800,
      cholesterol: null,
      alcohol_grams: null,
      source: 'official',
      source_detail: null,
      confidence_score: 90,
      created_at: '2026-01-01',
      updated_at: null,
    }],
    allergens: [],
  } as unknown as MenuItemWithNutrition
}

beforeEach(() => {
  window.localStorage.clear()
  __resetCompareState()
})

describe('useCompare.isInCompare', () => {
  // Regression test for P1-010: isInCompare previously closed over module-level
  // `sharedItems` with an empty dep array, so the callback was frozen across
  // renders and `useMemo`/`useEffect` consumers held stale references after
  // add/remove. The fix reads React state and tracks `[items]` in deps so the
  // callback re-creates when compare state mutates.
  it('returns updated value after add and remove', () => {
    const { result } = renderHook(() => useCompare())
    const item = makeItem('item-1', 'Test Item')

    expect(result.current.isInCompare('item-1')).toBe(false)

    act(() => { result.current.addToCompare(item) })
    expect(result.current.isInCompare('item-1')).toBe(true)

    act(() => { result.current.removeFromCompare('item-1') })
    expect(result.current.isInCompare('item-1')).toBe(false)
  })

  it('returns a fresh callback reference when items change', () => {
    const { result } = renderHook(() => useCompare())
    const firstRef = result.current.isInCompare

    act(() => { result.current.addToCompare(makeItem('item-2', 'Another Item')) })
    const secondRef = result.current.isInCompare

    // Same reference would mean useMemo/useEffect consumers cached stale values.
    expect(secondRef).not.toBe(firstRef)
  })
})
