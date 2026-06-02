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

  it('renders the same primary tabs as a desktop sidebar with aria-current', () => {
    render(
      <MemoryRouter initialEntries={['/meal']}>
        <BottomNav totalItemCount={2} />
      </MemoryRouter>,
    )

    const desktopNav = screen.getByRole('navigation', { name: /sidebar navigation/i })
    expect(desktopNav).toHaveClass('hidden', 'md:flex')
    expect(within(desktopNav).getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
    expect(within(desktopNav).getByRole('link', { name: /^search$/i })).toHaveAttribute('href', '/search')
    expect(within(desktopNav).getByRole('link', { name: /^browse$/i })).toHaveAttribute('href', '/browse')
    expect(within(desktopNav).getByRole('link', { name: /^meal builder$/i })).toHaveAttribute('aria-current', 'page')
    expect(within(desktopNav).getByText('2')).toHaveAttribute('aria-hidden', 'true')
  })
})
