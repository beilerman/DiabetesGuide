import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Privacy from '../Privacy'
import Contact from '../Contact'
import MoreMenu from '../MoreMenu'
import DiabetesGuide from '../DiabetesGuide'

describe('Task 16 trust copy and accessibility', () => {
  it('documents checklist local storage on the privacy page', () => {
    render(<Privacy />)

    expect(screen.getByText(/checklist progress is stored locally/i).closest('li')).not.toBeNull()
  })

  it('wraps the contact email in a mailto link', () => {
    render(<Contact />)

    expect(screen.getByRole('link', { name: 'contact@diabetesguide.app' })).toHaveAttribute(
      'href',
      'mailto:contact@diabetesguide.app',
    )
  })

  it('uses decorative inline SVG icons with visible labels in the More menu', () => {
    render(
      <MemoryRouter>
        <MoreMenu />
      </MemoryRouter>,
    )

    for (const label of ['Carb Estimator', 'Packing List', 'Diabetes Guide', 'Park Day Tips', 'Settings', 'Data Sources', 'Privacy']) {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
      expect(within(link).getByRole('heading', { name: label })).toBeVisible()
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('labels the guide type selector as tabs with matching tab panels', () => {
    render(<DiabetesGuide />)

    const tablist = screen.getByRole('tablist', { name: /diabetes type/i })
    const type1Tab = within(tablist).getByRole('tab', { name: 'Type 1' })
    const type2Tab = within(tablist).getByRole('tab', { name: 'Type 2' })

    expect(type1Tab).toHaveAttribute('aria-selected', 'true')
    expect(type2Tab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: 'Type 1' })).toHaveAttribute('id', 'guide-panel-type1')
  })
})
