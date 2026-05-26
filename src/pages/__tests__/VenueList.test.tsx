import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VenueList from '../VenueList'
import type { Park, Restaurant } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useParks: vi.fn(),
  useRestaurants: vi.fn(),
  useMenuItemCount: vi.fn(),
}))

import { useMenuItemCount, useParks, useRestaurants } from '../../lib/queries'

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

describe('VenueList', () => {
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
    expect(within(card).getByText(/84 items/i)).toBeInTheDocument()
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
})
