import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Search from '../Search'
import type { MenuItemWithNutrition } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useMenuItems: vi.fn(),
  useParks: vi.fn(),
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

import { useMenuItems, useParks } from '../../lib/queries'

function renderSearch(path = '/search?q=chicken') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Search />
    </MemoryRouter>,
  )
}

describe('Search', () => {
  it('does not show Searching once resolved results are available during background refetch', () => {
    vi.mocked(useParks).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useParks>)
    vi.mocked(useMenuItems).mockReturnValue({
      data: [makeMenuItem('item-1', 'Grilled Chicken Sandwich')],
      isLoading: false,
      isFetching: true,
    } as ReturnType<typeof useMenuItems>)

    renderSearch()

    expect(screen.queryByText(/searching/i)).not.toBeInTheDocument()
    expect(screen.getByText(/showing 1 of 1 matching result/i)).toHaveAttribute('aria-live', 'polite')
  })

  it('shows Searching while the initial catalog request is pending for a non-empty query', () => {
    vi.mocked(useParks).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useParks>)
    vi.mocked(useMenuItems).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    } as ReturnType<typeof useMenuItems>)

    renderSearch()

    expect(screen.getByText(/searching/i)).toBeInTheDocument()
  })

  it('clears Searching for an empty query even if the catalog is fetching', () => {
    vi.mocked(useParks).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useParks>)
    vi.mocked(useMenuItems).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    } as ReturnType<typeof useMenuItems>)

    renderSearch('/search')

    expect(screen.queryByText(/searching/i)).not.toBeInTheDocument()
  })
})

function makeMenuItem(id: string, name: string): MenuItemWithNutrition {
  return {
    id,
    restaurant_id: 'restaurant-1',
    name,
    description: null,
    price: null,
    category: 'entree',
    is_seasonal: false,
    is_fried: false,
    is_vegetarian: false,
    photo_url: null,
    created_at: '',
    nutritional_data: [{
      id: 'nutrition-1',
      menu_item_id: id,
      calories: 420,
      carbs: 38,
      fat: 12,
      sugar: 4,
      protein: 28,
      fiber: 2,
      sodium: 740,
      cholesterol: 65,
      alcohol_grams: null,
      source: 'official',
      source_detail: null,
      confidence_score: 85,
      created_at: '',
    }],
    allergens: [],
    restaurant: {
      id: 'restaurant-1',
      park_id: 'park-1',
      name: 'Test Restaurant',
      land: null,
      cuisine_type: null,
      hours: null,
      lat: null,
      lon: null,
      created_at: '',
      park: {
        id: 'park-1',
        name: 'Test Park',
        location: '',
        timezone: '',
        first_aid_locations: [],
        created_at: '',
      },
    },
  }
}
