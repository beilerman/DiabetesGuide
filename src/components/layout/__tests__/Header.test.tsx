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

  it('renders shared desktop navigation labels with an active page state', () => {
    render(
      <MemoryRouter initialEntries={['/meal']}>
        <Header />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /diabetesguide home/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /^home$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^meal builder$/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /^favorites$/i })).toHaveAttribute('href', '/plan')
    expect(screen.getByRole('link', { name: /^menu$/i })).toHaveAttribute('href', '/more')
    expect(screen.queryByRole('link', { name: /^packing list$/i })).not.toBeInTheDocument()
  })
})
