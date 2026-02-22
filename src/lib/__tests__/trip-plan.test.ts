import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTripPlan } from '../../hooks/useTripPlan'

beforeEach(() => {
  localStorage.clear()
  // Reset shared state by removing and re-importing
  // We rely on localStorage.clear() since the hook reads from storage on init
})

const mockItem = {
  id: 'item-1',
  name: 'Turkey Leg',
  carbs: 40,
  calories: 600,
  fat: 30,
  protein: 45,
  sugar: 5,
  fiber: 0,
  sodium: 800,
  restaurant: "Casey's Corner",
  parkName: 'Magic Kingdom',
}

describe('useTripPlan', () => {
  it('starts with no plan', () => {
    const { result } = renderHook(() => useTripPlan())
    expect(result.current.plan).toBeNull()
    expect(result.current.hasPlan).toBe(false)
  })

  it('creates a plan with correct structure', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 3, 3, 60) })

    expect(result.current.hasPlan).toBe(true)
    expect(result.current.plan!.resortId).toBe('wdw')
    expect(result.current.plan!.days).toHaveLength(3)
    expect(result.current.plan!.carbGoalPerMeal).toBe(60)
    expect(result.current.plan!.mealsPerDay).toBe(3)

    // Each day has 3 meal slots with default names
    const day = result.current.plan!.days[0]
    expect(day.parkId).toBeNull()
    expect(day.meals).toHaveLength(3)
    expect(day.meals[0].name).toBe('Breakfast')
    expect(day.meals[1].name).toBe('Lunch')
    expect(day.meals[2].name).toBe('Dinner')
  })

  it('assigns a park to a day', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 2) })
    act(() => { result.current.assignPark(0, 'park-mk') })

    expect(result.current.plan!.days[0].parkId).toBe('park-mk')
    expect(result.current.plan!.days[1].parkId).toBeNull()
  })

  it('adds and removes items from meal slots', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 1, 2) })
    act(() => { result.current.addItemToSlot(0, 0, mockItem) })

    expect(result.current.plan!.days[0].meals[0].items).toHaveLength(1)
    expect(result.current.plan!.days[0].meals[0].items[0].name).toBe('Turkey Leg')

    act(() => { result.current.removeItemFromSlot(0, 0, 0) })
    expect(result.current.plan!.days[0].meals[0].items).toHaveLength(0)
  })

  it('computes day totals', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 1, 2) })
    act(() => { result.current.addItemToSlot(0, 0, mockItem) })
    act(() => { result.current.addItemToSlot(0, 1, { ...mockItem, id: 'item-2', carbs: 20, calories: 300 }) })

    expect(result.current.dayTotals[0].carbs).toBe(60)
    expect(result.current.dayTotals[0].calories).toBe(900)
    expect(result.current.dayTotals[0].itemCount).toBe(2)
  })

  it('computes trip totals across days', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 2, 1) })
    act(() => { result.current.addItemToSlot(0, 0, mockItem) })
    act(() => { result.current.addItemToSlot(1, 0, mockItem) })

    expect(result.current.tripTotals.carbs).toBe(80)
    expect(result.current.tripTotals.itemCount).toBe(2)
  })

  it('clears the plan', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 2) })
    expect(result.current.hasPlan).toBe(true)

    act(() => { result.current.clearPlan() })
    expect(result.current.hasPlan).toBe(false)
    expect(result.current.plan).toBeNull()
  })

  it('adds and removes days', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 2) })
    expect(result.current.plan!.days).toHaveLength(2)

    act(() => { result.current.addDay() })
    expect(result.current.plan!.days).toHaveLength(3)

    act(() => { result.current.removeDay(2) })
    expect(result.current.plan!.days).toHaveLength(2)
  })

  it('does not remove the last day', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 1) })
    act(() => { result.current.removeDay(0) })
    expect(result.current.plan!.days).toHaveLength(1)
  })

  it('updates carb goal', () => {
    const { result } = renderHook(() => useTripPlan())
    act(() => { result.current.createPlan('wdw', 1) })
    act(() => { result.current.updateCarbGoal(45) })
    expect(result.current.plan!.carbGoalPerMeal).toBe(45)
  })

  it('ignores operations when no plan exists', () => {
    const { result } = renderHook(() => useTripPlan())
    // Clear any shared state from prior tests
    act(() => { result.current.clearPlan() })
    expect(result.current.plan).toBeNull()

    // None of these should throw or create a plan
    act(() => { result.current.assignPark(0, 'park-1') })
    act(() => { result.current.addItemToSlot(0, 0, mockItem) })
    act(() => { result.current.removeItemFromSlot(0, 0, 0) })
    act(() => { result.current.updateCarbGoal(45) })
    expect(result.current.plan).toBeNull()
  })
})
