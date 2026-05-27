import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from '../Settings'
import { clearOfflineData } from '../../lib/offline-db'

vi.mock('../../lib/offline-db', () => ({
  clearOfflineData: vi.fn(() => Promise.resolve()),
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('Settings', () => {
  it('gives the high contrast switch an accessible name', () => {
    render(<Settings />)

    expect(screen.getByRole('switch', { name: /high contrast/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('asks for confirmation before clearing saved app data', async () => {
    const user = userEvent.setup()
    localStorage.setItem('dg_meal_cart', 'saved meal')

    render(<Settings />)

    await user.click(screen.getByRole('button', { name: /clear all app data/i }))

    expect(screen.getByRole('dialog', { name: /clear saved app data/i })).toBeInTheDocument()
    expect(clearOfflineData).not.toHaveBeenCalled()
    expect(localStorage.getItem('dg_meal_cart')).toBe('saved meal')
  })

  it('clears saved local app data only after confirmation', async () => {
    const user = userEvent.setup()
    localStorage.setItem('dg_meal_cart', 'saved meal')
    localStorage.setItem('dg_favorites', 'saved favorites')
    localStorage.setItem('dg_compare', 'saved compare')
    localStorage.setItem('dg_recent_searches', 'saved searches')

    render(<Settings />)

    await user.click(screen.getByRole('button', { name: /clear all app data/i }))
    await user.click(screen.getByRole('button', { name: /^clear data$/i }))

    await waitFor(() => expect(clearOfflineData).toHaveBeenCalledOnce())
    expect(localStorage.getItem('dg_meal_cart')).toBeNull()
    expect(localStorage.getItem('dg_favorites')).toBeNull()
    expect(localStorage.getItem('dg_compare')).toBeNull()
    expect(localStorage.getItem('dg_recent_searches')).toBeNull()
    expect(screen.queryByRole('dialog', { name: /clear saved app data/i })).not.toBeInTheDocument()
  })
})
