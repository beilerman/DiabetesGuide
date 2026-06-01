import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VenueMenu from '../VenueMenu'
import type { Park, MenuItemWithNutrition } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useParks: vi.fn(),
  useMenuItems: vi.fn(),
  useRestaurants: vi.fn(),
  useCatalogPreview: vi.fn(),
}))

import { useCatalogPreview, useMenuItems, useParks, useRestaurants } from '../../lib/queries'

function renderVenue(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/resort/:resortId/:categoryId/:parkId" element={<VenueMenu />} />
      </Routes>
    </MemoryRouter>,
  )
}

function makePark(id: string, name: string): Park {
  return {
    id,
    name,
    location: 'Walt Disney World',
    timezone: 'America/New_York',
    first_aid_locations: [],
    created_at: '',
  }
}

// 'epcot' is a valid park id under resort 'wdw' / category 'theme-parks'.
const VALID = '/resort/wdw/theme-parks/epcot'
// A park id that is NOT in STATIC_CATALOG_PREVIEW — required so the not-found
// race actually reproduces (a previewed id would resolve `park` synchronously).
const ABSENT = '/resort/wdw/theme-parks/not-a-real-park-xyz'

const emptyMenu = { data: undefined, isLoading: false } as unknown as ReturnType<typeof useMenuItems>
const emptyRestaurants = { data: undefined } as unknown as ReturnType<typeof useRestaurants>

describe('VenueMenu loading vs not-found', () => {
  beforeEach(() => {
    // No catalog preview → previewPark is undefined, isolating the parks-query gate.
    vi.mocked(useCatalogPreview).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useCatalogPreview>)
    vi.mocked(useRestaurants).mockReturnValue(emptyRestaurants)
    vi.mocked(useMenuItems).mockReturnValue(emptyMenu)
  })

  it('does NOT show "not found" while the parks list is still loading (the transient bug)', () => {
    vi.mocked(useParks).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useParks>)

    renderVenue(VALID)

    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/not available/i)).not.toBeInTheDocument()
    expect(screen.getByText(/loading venue/i)).toBeInTheDocument()
  })

  it('shows the genuine not-found state only once parks have settled and the id is absent', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [makePark('magic-kingdom-park', 'Magic Kingdom Park')],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useParks>)

    renderVenue(ABSENT)

    expect(screen.getByText(/not available/i)).toBeInTheDocument()
    expect(screen.queryByText(/loading venue/i)).not.toBeInTheDocument()
  })

  it('shows a retry affordance (not "not found") when the parks fetch errors', () => {
    vi.mocked(useParks).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useParks>)

    renderVenue(VALID)

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText(/not available/i)).not.toBeInTheDocument()
  })

  it('shows "loading menu…" instead of "0 items" while items load for a resolved park', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [makePark('epcot', 'EPCOT')],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useParks>)
    vi.mocked(useMenuItems).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useMenuItems>)

    renderVenue(VALID)

    expect(screen.getByText(/loading menu/i)).toBeInTheDocument()
    expect(screen.queryByText(/0 items/i)).not.toBeInTheDocument()
  })

  it('shows "N of M restaurants" only when a filter narrows the result set', () => {
    const items: MenuItemWithNutrition[] = [
      { id: 'i1', name: 'Gelato', restaurant: { id: 'r1', name: 'Gelateria', land: null }, allergens: [] } as unknown as MenuItemWithNutrition,
    ]
    vi.mocked(useParks).mockReturnValue({
      data: [makePark('epcot', 'EPCOT')],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useParks>)
    vi.mocked(useMenuItems).mockReturnValue({ data: items, isLoading: false } as unknown as ReturnType<typeof useMenuItems>)
    vi.mocked(useRestaurants).mockReturnValue({
      data: [
        { id: 'r1', park_id: 'epcot', name: 'Gelateria', land: null, cuisine_type: null, hours: null, lat: null, lon: null, created_at: '' },
        { id: 'r2', park_id: 'epcot', name: 'Other', land: null, cuisine_type: null, hours: null, lat: null, lon: null, created_at: '' },
      ],
    } as unknown as ReturnType<typeof useRestaurants>)

    renderVenue(VALID)
    // No filter active → total only.
    expect(screen.getByText(/2 restaurants/i)).toBeInTheDocument()
    expect(screen.queryByText(/of 2 restaurants/i)).not.toBeInTheDocument()
  })
})
