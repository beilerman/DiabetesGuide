import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '../Layout'

function renderLayout(path = '/search') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            path="/search"
            element={(
              <>
                <input id="site-search" aria-label="Search all menu items" />
                <section id="search-results" tabIndex={-1} aria-label="Search results" />
              </>
            )}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Layout skip links', () => {
  it('orders search and results skip links before the main content link on search pages', () => {
    renderLayout()

    const links = screen.getAllByRole('link', { name: /^skip to/i })
    expect(links.map(link => link.textContent)).toEqual([
      'Skip to search',
      'Skip to results',
      'Skip to main content',
    ])
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '#site-search',
      '#search-results',
      '#main-content',
    ])
  })
})
