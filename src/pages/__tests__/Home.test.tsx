import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '../Home'
import type { Park } from '../../lib/types'

vi.mock('../../lib/queries', () => ({
  useParks: vi.fn(),
  useMenuItemCounts: vi.fn(),
  useTotalRestaurantCount: vi.fn(),
}))

vi.mock('../../hooks/useFavorites', () => ({
  useFavorites: vi.fn(),
}))

import { useMenuItemCounts, useParks, useTotalRestaurantCount } from '../../lib/queries'
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
    vi.mocked(useTotalRestaurantCount).mockReturnValue({
      data: 680,
    } as ReturnType<typeof useTotalRestaurantCount>)
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
    vi.mocked(useTotalRestaurantCount).mockReturnValue({
      data: 2,
    } as ReturnType<typeof useTotalRestaurantCount>)
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
    expect(screen.getByText('Catalog preview: 15 menu items · 2 restaurants · 2 destinations')).toBeInTheDocument()
    expect(screen.getByText('15 menu items across 2 destinations')).toBeInTheDocument()
    expect(screen.queryByText(/menu records/i)).not.toBeInTheDocument()
  })

  it('moves focus with destination jumps and shows a back-to-top action after scrolling', () => {
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
    vi.mocked(useTotalRestaurantCount).mockReturnValue({
      data: 2,
    } as ReturnType<typeof useTotalRestaurantCount>)
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

    const heading = screen.getByRole('heading', { name: /walt disney world/i })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(heading).toHaveClass('scroll-mt-24')

    const jumpNav = screen.getByRole('navigation', { name: /jump to destination groups/i })
    fireEvent.click(within(jumpNav).getByRole('link', { name: /walt disney world/i }))
    expect(heading).toHaveFocus()

    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument()
    Object.defineProperty(window, 'scrollY', { value: 700, configurable: true })
    fireEvent.scroll(window)

    expect(screen.getByRole('button', { name: /back to top/i })).toBeInTheDocument()
  })
})
