import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MenuItemCard } from '../MenuItemCard'
import type { MenuItemWithNutrition } from '../../../lib/types'

function makeItem(): MenuItemWithNutrition {
  return {
    id: 'item-1',
    restaurant_id: 'r1',
    name: 'Mystery Entree',
    description: null,
    price: null,
    category: 'entree',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: [],
    allergens: [],
  }
}

describe('MenuItemCard nutrition safety', () => {
  it('does not add no-nutrition items to the meal as zero-carb entries', async () => {
    const user = userEvent.setup()
    const addToMeal = vi.fn()

    render(
      <MemoryRouter>
        <MenuItemCard
          item={makeItem()}
          onAddToMeal={addToMeal}
          isFavorite={false}
          onToggleFavorite={vi.fn()}
        />
      </MemoryRouter>,
    )

    const addButton = screen.getByRole('button', { name: /nutrition needed/i })
    expect(addButton).toBeDisabled()

    await user.click(addButton)

    expect(addToMeal).not.toHaveBeenCalled()
    expect(screen.getByText(/cannot add to meal totals/i)).toBeInTheDocument()
  })
})
