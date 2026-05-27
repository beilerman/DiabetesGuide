import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MenuItemDetail from '../MenuItemDetail'
import type { MenuItemWithNutrition } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useMenuItem: vi.fn(),
}))

vi.mock('../../hooks/useMealCart', () => ({
  useMealCart: () => ({ addItem: vi.fn() }),
}))

vi.mock('../../hooks/useFavorites', () => ({
  useFavorites: () => ({ isFavorite: vi.fn(() => false), toggle: vi.fn() }),
}))

vi.mock('../../hooks/useCompare', () => ({
  useCompare: () => ({ addToCompare: vi.fn() }),
}))

import { useMenuItem } from '../../lib/queries'

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/item/item-1']}>
      <Routes>
        <Route path="/item/:itemId" element={<MenuItemDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MenuItemDetail', () => {
  it('keeps item-detail nutrition and grade context concise and linked', async () => {
    const user = userEvent.setup()
    vi.mocked(useMenuItem).mockReturnValue({
      data: makeMenuItem(),
      isLoading: false,
    } as ReturnType<typeof useMenuItem>)

    renderDetail()

    expect(screen.queryByText('Sodium:')).not.toBeInTheDocument()
    expect(screen.getByText(/updated feb 15, 2026/i)).toBeInTheDocument()
    expect(screen.getByText(/fewer is better/i)).toHaveTextContent(/scale shows item vs\. category median \(0-5\)/i)
    await user.click(screen.getByText(/what does grade f mean\?/i))
    expect(screen.getByRole('link', { name: /grade rubric/i })).toHaveAttribute('href', '/data-sources#grade-rubric')
  })
})

function makeMenuItem(): MenuItemWithNutrition {
  return {
    id: 'item-1',
    restaurant_id: 'restaurant-1',
    name: 'Giant Funnel Cake Sundae',
    description: 'A large dessert with ice cream and chocolate sauce.',
    price: null,
    category: 'dessert',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: true,
    photo_url: null,
    created_at: '2026-02-15T00:00:00.000Z',
    nutritional_data: [{
      id: 'nutrition-1',
      menu_item_id: 'item-1',
      calories: 1100,
      carbs: 140,
      fat: 48,
      sugar: 90,
      protein: 8,
      fiber: 2,
      sodium: 40,
      cholesterol: 80,
      alcohol_grams: null,
      source: 'official',
      source_detail: 'Test source',
      confidence_score: 85,
      created_at: '2026-02-15T00:00:00.000Z',
    }],
    allergens: [],
    restaurant: {
      id: 'restaurant-1',
      park_id: 'park-1',
      name: 'Test Bakery',
      land: 'Test Land',
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
      park: {
        id: 'park-1',
        name: 'Test Park',
        location: 'Orlando, Florida',
        timezone: 'America/New_York',
        first_aid_locations: [],
        created_at: '',
      },
    },
  }
}
