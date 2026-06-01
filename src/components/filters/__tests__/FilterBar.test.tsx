import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../FilterBar'
import { DEFAULT_FILTERS } from '../../../lib/filters'
import type { Filters } from '../../../lib/types'

function renderBar(overrides: Partial<Filters> = {}) {
  const onChange = vi.fn()
  render(<FilterBar filters={{ ...DEFAULT_FILTERS, ...overrides }} onChange={onChange} />)
  return { onChange }
}

describe('FilterBar — C9 search vs structured filters', () => {
  it('does not count free-text search toward the active-filter badge', () => {
    renderBar({ search: 'churro' })
    // No structured filter is active, so the "N filters active" row must not show.
    expect(screen.queryByText(/filter(s)? active/i)).not.toBeInTheDocument()
  })

  it('counts a structured filter (category) toward the badge', () => {
    renderBar({ category: 'dessert' })
    expect(screen.getByText(/filter active/i)).toBeInTheDocument()
  })

  it('offers a clear-search affordance separate from the filters', () => {
    const { onChange } = renderBar({ search: 'gelato' })
    fireEvent.click(screen.getByLabelText(/clear search/i))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: '' }))
  })
})

describe('FilterBar — C7 Max Carbs sentinel', () => {
  it('labels the no-cap position "Any (150g+)" and announces "no carb limit"', () => {
    renderBar({ maxCarbs: null })
    expect(screen.getByText(/Max Carbs: Any \(150g\+\)/i)).toBeInTheDocument()
    const slider = screen.getByLabelText('Maximum carbs filter')
    expect(slider).toHaveAttribute('aria-valuetext', 'Any — no carb limit')
  })

  it('shows the gram value and announces it when a cap is set', () => {
    renderBar({ maxCarbs: 45 })
    expect(screen.getByText(/Max Carbs: 45g/i)).toBeInTheDocument()
    const slider = screen.getByLabelText('Maximum carbs filter')
    expect(slider).toHaveAttribute('aria-valuetext', '45 grams')
  })
})
