import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '../Home'
import type { Park } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useParks: vi.fn(),
  useMenuItemCounts: vi.fn(),
}))

vi.mock('../../hooks/useFavorites', () => ({
  useFavorites: vi.fn(),
}))

import { useMenuItemCounts, useParks } from '../../lib/queries'
import { useFavorites } from '../../hooks/useFavorites'

function makePark(id: string, name: string): Park {
  return {
    id,
    name,
    location: '',
    timezone: '',
    first_aid_locations: [],
    created_at: '',
  }
}

describe('Home', () => {
  it('renders a compact task-first hero with search, trust copy, and useful quick filters', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [
        makePark('magic-kingdom', 'Magic Kingdom Park'),
        makePark('disneyland', 'Disneyland Park'),
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useParks>)
    vi.mocked(useMenuItemCounts).mockReturnValue({
      data: new Map([
        ['magic-kingdom', 9510],
        ['disneyland', 231],
      ]),
    } as ReturnType<typeof useMenuItemCounts>)
    vi.mocked(useFavorites).mockReturnValue({
      favorites: new Set(['item-1', 'item-2']),
      toggle: vi.fn(),
      isFavorite: vi.fn(),
    } as ReturnType<typeof useFavorites>)

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'DiabetesGuide' })).toBeInTheDocument()
    expect(screen.getByText(/for type 1 and type 2 travelers/i)).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search all menu items/i })).toBeInTheDocument()
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /data sources/i })).toHaveAttribute('href', '/data-sources')
    expect(screen.getByRole('link', { name: /low carb/i })).toHaveAttribute('href', '/browse?maxCarbs=30&sort=carbsAsc')
    expect(screen.getByRole('link', { name: /saved favorites/i })).toHaveAttribute('href', '/plan')
  })

  it('exposes jump navigation and clarified destination counts', () => {
    vi.mocked(useParks).mockReturnValue({
      data: [
        makePark('magic-kingdom', 'Magic Kingdom Park'),
        makePark('grand-floridian', "Disney's Grand Floridian Resort"),
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useParks>)
    vi.mocked(useMenuItemCounts).mockReturnValue({
      data: new Map([
        ['magic-kingdom', 10],
        ['grand-floridian', 5],
      ]),
    } as ReturnType<typeof useMenuItemCounts>)
    vi.mocked(useFavorites).mockReturnValue({
      favorites: new Set(),
      toggle: vi.fn(),
      isFavorite: vi.fn(),
    } as ReturnType<typeof useFavorites>)

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    const jumpNav = screen.getByRole('navigation', { name: /jump to destination groups/i })
    expect(within(jumpNav).getByRole('link', { name: /walt disney world/i })).toHaveAttribute('href', '#home-resort-wdw')
    expect(screen.getByText('15 menu items across 2 locations')).toBeInTheDocument()
    expect(screen.queryByText(/menu records/i)).not.toBeInTheDocument()
  })
})
