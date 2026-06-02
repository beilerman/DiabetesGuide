import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from '../FilterBar'
import { DEFAULT_FILTERS } from '../../../lib/filters'
import type { Filters } from '../../../lib/types'

function renderFilterBar(filters: Filters, onChange = vi.fn()) {
  render(<FilterBar filters={filters} onChange={onChange} />)
  return onChange
}

describe('FilterBar', () => {
  it('surfaces active filters as removable chips with a clear all action', async () => {
    const user = userEvent.setup()
    const onChange = renderFilterBar({
      ...DEFAULT_FILTERS,
      maxCarbs: 30,
      gradeFilter: ['A', 'B'],
      hideFried: true,
      allergenFree: ['wheat'],
    })

    const activeFilters = screen.getByRole('region', { name: /active filters/i })
    expect(within(activeFilters).getByText(/max carbs: 30g/i)).toBeInTheDocument()
    expect(within(activeFilters).getByText(/grade: A/i)).toBeInTheDocument()
    expect(within(activeFilters).getByText(/grade: B/i)).toBeInTheDocument()
    expect(within(activeFilters).getByText(/no fried/i)).toBeInTheDocument()
    expect(within(activeFilters).getByText(/gluten-free/i)).toBeInTheDocument()

    await user.click(within(activeFilters).getByRole('button', { name: /remove max carbs: 30g filter/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxCarbs: null }))

    await user.click(within(activeFilters).getByRole('button', { name: /clear all filters/i }))

    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_FILTERS,
      sort: DEFAULT_FILTERS.sort,
    })
  })

  it('auto-expands the mobile advanced filters when active filters are present', () => {
    renderFilterBar({
      ...DEFAULT_FILTERS,
      maxCarbs: 30,
    })

    expect(screen.getByRole('button', { name: /fewer filters/i })).toHaveAttribute('aria-expanded', 'true')
  })
})
