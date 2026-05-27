import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import About from '../About'

describe('About build metadata', () => {
  it('exposes build and catalog freshness metadata', () => {
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /version & data freshness/i })).toBeInTheDocument()
    expect(screen.getByText(/git sha/i)).toBeInTheDocument()
    expect(screen.getByText(/build date/i)).toBeInTheDocument()
    expect(screen.getByText(/catalog snapshot/i)).toBeInTheDocument()
  })
})
