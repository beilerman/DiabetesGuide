import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Plan from '../Plan'
import { __resetTripPlanState } from '../../hooks/useTripPlan'

vi.mock('../../lib/queries', () => ({
  useParks: () => ({ data: [] }),
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
        parkId: null,
        meals: [{ name: 'Breakfast', items: [] }],
      },
    ],
  })
})

describe('Plan', () => {
  it('confirms before clearing an existing trip plan', () => {
    render(<Plan />)

    fireEvent.click(screen.getByRole('button', { name: /trip plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear plan/i }))

    expect(screen.getByRole('dialog', { name: /clear trip plan/i })).toBeInTheDocument()
    expect(screen.getByText('Day 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog', { name: /clear trip plan/i })).not.toBeInTheDocument()
    expect(screen.getByText('Day 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /^clear trip plan$/i }))

    expect(screen.getByText('Plan Your Trip')).toBeInTheDocument()
  })
})
