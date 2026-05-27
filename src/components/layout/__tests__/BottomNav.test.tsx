import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '../BottomNav'

describe('BottomNav', () => {
  it('uses the shared mobile labels and active state', () => {
    render(
      <MemoryRouter initialEntries={['/plan']}>
        <BottomNav totalItemCount={3} />
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: /bottom navigation/i })
    expect(nav).toHaveClass('md:hidden')
    expect(within(nav).getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: /^meal builder$/i })).toHaveAttribute('href', '/meal')
    expect(within(nav).getByRole('link', { name: /^favorites$/i })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /^menu$/i })).toHaveAttribute('href', '/more')
    expect(within(nav).queryByText(/^parks$/i)).not.toBeInTheDocument()
    expect(within(nav).queryByText(/^meal$/i)).not.toBeInTheDocument()
    expect(within(nav).queryByText(/^plan$/i)).not.toBeInTheDocument()
    expect(within(nav).queryByText(/^more$/i)).not.toBeInTheDocument()
  })
})
