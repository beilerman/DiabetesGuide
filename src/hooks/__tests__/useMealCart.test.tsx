import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMealCart, __resetMealCartState, __normalizeStoredMealCart } from '../useMealCart'
import type { MealItem } from '../../lib/types'

const mockItem: MealItem = {
  id: 'item-1',
  name: 'Dole Whip',
  carbs: 45,
  calories: 210,
  fat: 3,
  protein: 2,
  sugar: 40,
  fiber: 3,
  sodium: 15,
  restaurant: 'Aloha Isle',
  parkName: 'Magic Kingdom',
}

beforeEach(() => {
  window.localStorage.clear()
  __resetMealCartState()
})

describe('useMealCart hook', () => {
  it('initializes with a default meal and zero totals', () => {
    const { result } = renderHook(() => useMealCart())
    expect(result.current.items).toHaveLength(0)
    expect(result.current.activeMealName).toBe('My Meal')
    expect(result.current.totals).toEqual({
      carbs: 0, calories: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0,
    })
    expect(result.current.totalItemCount).toBe(0)
  })

  it('adds, removes, and clears items on the active meal', () => {
    const { result } = renderHook(() => useMealCart())

    act(() => { result.current.addItem(mockItem) })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.totals.carbs).toBe(45)
    expect(result.current.totalItemCount).toBe(1)

    act(() => { result.current.addItem({ ...mockItem, id: 'item-2', carbs: 15 }) })
    expect(result.current.items).toHaveLength(2)
    expect(result.current.totals.carbs).toBe(60)

    act(() => { result.current.removeItem(0) })
    expect(result.current.items.map(i => i.id)).toEqual(['item-2'])

    act(() => { result.current.clear() })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.totalItemCount).toBe(0)
  })

  it('creates new meals, switches between them, and ignores invalid switches', () => {
    const { result } = renderHook(() => useMealCart())
    const firstMealId = result.current.activeMealId

    let snacksId = ''
    act(() => { snacksId = result.current.createMeal('Snacks', 'park-epcot') })
    expect(result.current.activeMealId).toBe(snacksId)
    expect(result.current.activeMealName).toBe('Snacks')
    expect(result.current.activeMealParkId).toBe('park-epcot')

    act(() => { result.current.switchMeal(firstMealId) })
    expect(result.current.activeMealId).toBe(firstMealId)

    act(() => { result.current.switchMeal('missing-id') })
    expect(result.current.activeMealId).toBe(firstMealId)
  })

  it('prevents deleting the last meal and gracefully ignores unknown ids', () => {
    const { result } = renderHook(() => useMealCart())
    const onlyMealId = result.current.activeMealId
    act(() => { result.current.deleteMeal('does-not-exist') })
    expect(result.current.mealIds).toContain(onlyMealId)

    act(() => {
      result.current.addItem(mockItem)
      result.current.deleteMeal(onlyMealId)
    })
    expect(result.current.mealIds).toHaveLength(1)
    expect(result.current.items).toHaveLength(0)
  })

  it('deletes extra meals and reassigns the active meal when needed', () => {
    const { result } = renderHook(() => useMealCart())
    const firstMealId = result.current.activeMealId

    let secondMealId = ''
    act(() => { secondMealId = result.current.createMeal('Lunch') })
    expect(result.current.activeMealId).toBe(secondMealId)

    act(() => { result.current.switchMeal(firstMealId) })
    act(() => { result.current.deleteMeal(secondMealId) })
    expect(result.current.mealIds).toEqual([firstMealId])

    act(() => { secondMealId = result.current.createMeal('Dessert') })
    act(() => { result.current.deleteMeal(firstMealId) })
    expect(result.current.activeMealId).toBe(secondMealId)
  })

  it('renames meals but keeps previous name when input is blank', () => {
    const { result } = renderHook(() => useMealCart())
    const mealId = result.current.activeMealId

    act(() => { result.current.renameMeal(mealId, '  Dinner ') })
    expect(result.current.activeMealName).toBe('  Dinner ')

    act(() => { result.current.renameMeal(mealId, '   ') })
    expect(result.current.activeMealName).toBe('  Dinner ')
  })
})

describe('__normalizeStoredMealCart', () => {
  it('migrates the legacy array format and normalizes macros', () => {
    const legacy: unknown[] = [
      { id: 'a', name: 'Pretzel', carbs: 22, calories: '200', fat: 4, protein: undefined },
      { id: 'b', name: 'Popcorn', carbs: '18', calories: 140, fat: 3, sugar: '5' },
    ]

    const normalized = __normalizeStoredMealCart(legacy)
    expect(normalized).not.toBeNull()
    if (!normalized) return

    const meal = normalized.meals[normalized.activeMealId]
    expect(meal.items).toHaveLength(2)
    expect(meal.items[0]).toMatchObject({ id: 'a', calories: 200, protein: 0 })
    expect(meal.items[1]).toMatchObject({ id: 'b', carbs: 18, sugar: 5 })
  })

  it('returns null for malformed persisted objects to force defaults', () => {
    const malformed = {
      activeMealId: 'missing',
      meals: { missing: null },
    }

    expect(__normalizeStoredMealCart(malformed)).toBeNull()
  })
})
