import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComparisonTray } from '../ComparisonTray'
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
  ])
})

describe('ComparisonTray', () => {
  it('lets users dismiss the tray without clearing selected comparison items', async () => {
    const user = userEvent.setup()
    let dismissed = false

    render(<ComparisonTray onOpenModal={() => {}} onDismiss={() => { dismissed = true }} />)

    await user.click(screen.getByRole('button', { name: 'Dismiss comparison tray' }))

    expect(dismissed).toBe(true)
    expect(screen.getByText('Dole Whip')).toBeInTheDocument()
  })
})
