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
  })
})
