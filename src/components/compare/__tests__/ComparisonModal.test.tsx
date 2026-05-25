import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComparisonModal } from '../ComparisonModal'
import { __resetCompareState } from '../../../hooks/useCompare'

beforeEach(() => {
  __resetCompareState([
    {
      id: 'item-1',
      name: 'Dole Whip',
      category: 'dessert',
      carbs: 45,
      calories: 210,
      fat: 3,
      protein: 2,
      sugar: 40,
      fiber: 1,
      sodium: 15,
      alcoholGrams: 0,
      price: null,
      restaurant: 'Aloha Isle',
      parkName: 'Magic Kingdom',
      isFried: false,
    },
    {
      id: 'item-2',
      name: 'Grilled Chicken',
      category: 'entree',
      carbs: 8,
      calories: 320,
      fat: 12,
      protein: 40,
      sugar: 2,
      fiber: 2,
      sodium: 500,
      alcoholGrams: 0,
      price: null,
      restaurant: 'Docking Bay 7',
      parkName: 'Hollywood Studios',
      isFried: false,
    },
  ])
})

describe('ComparisonModal', () => {
  it('uses an accessible backdrop close control', async () => {
    const user = userEvent.setup()
    let closed = false

    render(<ComparisonModal onClose={() => { closed = true }} />)

    expect(screen.getByRole('dialog', { name: /compare items/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close comparison overlay/i }))

    expect(closed).toBe(true)
  })
})
