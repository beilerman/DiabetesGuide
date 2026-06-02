import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Header } from '../Header'

beforeEach(() => {
  localStorage.clear()
  document.body.classList.remove('high-contrast')
})

describe('Header', () => {
  it('announces high contrast pressed state', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )

    const toggle = screen.getByRole('button', { name: /enable high contrast/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)

    expect(screen.getByRole('button', { name: /disable high contrast/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/contrast:\s*on/i)).toBeVisible()
    expect(JSON.parse(localStorage.getItem('dg_preferences') ?? '{}')).toMatchObject({ highContrast: true })
  })

  it('renders desktop utility controls without duplicating primary navigation', () => {
    render(
      <MemoryRouter initialEntries={['/meal']}>
        <Header />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /diabetesguide home/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^meal builder$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^favorites$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^menu$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^packing list$/i })).not.toBeInTheDocument()
  })
})
