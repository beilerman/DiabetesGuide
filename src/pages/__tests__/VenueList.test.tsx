import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VenueList from '../VenueList'
import type { Park, Restaurant } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useParks: vi.fn(),
  useRestaurants: vi.fn(),
  useMenuItemCount: vi.fn(),
  useCatalogPreview: vi.fn(),
}))

import { useCatalogPreview, useMenuItemCount, useParks, useRestaurants } from '../../lib/queries'
import type { CatalogPreview } from '../../lib/catalog-preview'

function renderVenueList(path = '/resort/wdw/theme-parks') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/resort/:resortId/:categoryId" element={<VenueList />} />
      </Routes>
    </MemoryRouter>,
  )
}

function makePark(id: string, name: string): Park {
  return {
    id,
    name,
    location: 'Orlando, Florida',
    timezone: 'America/New_York',
    first_aid_locations: [],
    created_at: '',
  }
}

function makeRestaurant(id: string, parkId: string, name: string, land: string): Restaurant {
  return {
    id,
    park_id: parkId,
    name,
    land,
    cuisine_type: null,
    hours: null,
    lat: null,
    lon: null,
    created_at: '',
  }
}

const previewFixture: CatalogPreview = {
  version: 1,
  snapshotDate: '2026-05-25',
  generatedAt: '2026-05-26T00:00:00.000Z',
  totalItems: 126,
  totalRestaurants: 3,
  totalDestinations: 2,
  parks: [
    {
      id: 'magic-kingdom-park',
      name: 'Magic Kingdom Park',
      location: 'Walt Disney World',
      timezone: 'America/New_York',
      resortId: 'wdw',
      categoryId: 'theme-parks',
      itemCount: 84,
      restaurantCount: 2,
      lands: ['Main Street, U.S.A.', 'Tomorrowland'],
    },
    {
      id: 'epcot',
      name: 'EPCOT',
      location: 'Walt Disney World',
      timezone: 'America/New_York',
      resortId: 'wdw',
      categoryId: 'theme-parks',
      itemCount: 42,
      restaurantCount: 1,
      lands: ['World Celebration'],
    },
  ],
}

describe('VenueList', () => {
  beforeEach(() => {
    vi.mocked(useCatalogPreview).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useCatalogPreview>)
  })

  it('shows skeleton cards instead of zero counts while venue counts load', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [makePark('mk', 'Magic Kingdom Park')],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useParks>)
    vi.mocked(useRestaurants).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useRestaurants>)
    vi.mocked(useMenuItemCount).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useMenuItemCount>)

    renderVenueList()

    expect(screen.getByLabelText(/loading counts for magic kingdom park/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 restaurants/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/0 items/i)).not.toBeInTheDocument()
  })

  it('renders loaded restaurant and item counts after both count requests resolve', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [makePark('mk', 'Magic Kingdom Park')],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useParks>)
    vi.mocked(useRestaurants).mockReturnValue({
      data: [
        makeRestaurant('r1', 'mk', "Casey's Corner", 'Main Street, U.S.A.'),
        makeRestaurant('r2', 'mk', 'Cosmic Ray\'s Starlight Cafe', 'Tomorrowland'),
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useRestaurants>)
    vi.mocked(useMenuItemCount).mockReturnValue({
      data: 84,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useMenuItemCount>)

    renderVenueList()

    const card = screen.getByRole('link', { name: /magic kingdom park/i })
    expect(within(card).getByText(/2 restaurants/i)).toBeInTheDocument()
    expect(within(card).getByText(/84 menu items/i)).toBeInTheDocument()
  })

  it('surfaces a count-specific error when venue count requests fail', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [makePark('mk', 'Magic Kingdom Park')],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useParks>)
    vi.mocked(useRestaurants).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('catalog unavailable'),
    } as ReturnType<typeof useRestaurants>)
    vi.mocked(useMenuItemCount).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useMenuItemCount>)

    renderVenueList()

    expect(screen.getByText(/counts unavailable/i)).toBeInTheDocument()
    expect(screen.getByText(/try refreshing/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 restaurants/i)).not.toBeInTheDocument()
  })

  it('renders cached preview venue counts while live park data is still loading', () => {
    vi.mocked(useCatalogPreview).mockReturnValue({
      data: previewFixture,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useCatalogPreview>)
    vi.mocked(useParks).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof useParks>)
    vi.mocked(useRestaurants).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useRestaurants>)
    vi.mocked(useMenuItemCount).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useMenuItemCount>)

    renderVenueList()

    const cards = screen.getAllByRole('link')
      .filter(link => link.getAttribute('href')?.startsWith('/resort/wdw/theme-parks/'))
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText(/2 restaurants/i)).toBeInTheDocument()
    expect(within(cards[0]).getByText(/84 menu items/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/loading counts/i)).not.toBeInTheDocument()
  })
})
