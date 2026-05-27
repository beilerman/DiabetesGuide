import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Plan from '../Plan'
import { __resetTripPlanState } from '../../hooks/useTripPlan'

vi.mock('../../lib/queries', () => ({
  useParks: () => ({
    data: [
      { id: 'park-mk', name: 'Magic Kingdom', location: 'Florida' },
      { id: 'park-epcot', name: 'EPCOT', location: 'Florida' },
    ],
  }),
  useFavoriteMenuItems: () => ({ data: [], isLoading: false }),
}))

beforeEach(() => {
  localStorage.clear()
  __resetTripPlanState({
    resortId: 'wdw',
    carbGoalPerMeal: 60,
    mealsPerDay: 1,
    days: [
      {
        date: '2026-01-01',
        parkId: null,
        meals: [{ name: 'Breakfast', items: [] }],
      },
    ],
  })
})

describe('Plan', () => {
  it('creates a dated trip with selected parks and backup JSON controls', () => {
    __resetTripPlanState(null)
    render(<Plan />)

    expect(screen.getByRole('heading', { name: /favorites & trip plan/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /trip plan/i }))
    fireEvent.change(screen.getByLabelText(/trip name/i), { target: { value: 'June Disney Trip' } })
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-06-03' } })
    fireEvent.click(screen.getByLabelText(/magic kingdom/i))
    fireEvent.click(screen.getByRole('button', { name: /create trip/i }))

    expect(screen.getByRole('heading', { name: /june disney trip/i })).toBeInTheDocument()
    expect(screen.getByText(/3 days/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import json/i })).toBeInTheDocument()

    const stored = JSON.parse(localStorage.getItem('dg.trips.v1') ?? '{}')
    expect(stored.trips[0].selectedParkIds).toEqual(['park-mk'])
  })

  it('confirms before clearing an existing trip plan', () => {
    render(<Plan />)

    fireEvent.click(screen.getByRole('button', { name: /trip plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear plan/i }))

    expect(screen.getByRole('dialog', { name: /clear trip plan/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /day 1/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog', { name: /clear trip plan/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /day 1/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /^clear trip plan$/i }))

    expect(screen.getByRole('heading', { name: /create trip/i })).toBeInTheDocument()
  })
})
