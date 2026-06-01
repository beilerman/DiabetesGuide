import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GradeBadge } from '../GradeBadge'

describe('GradeBadge', () => {
  it('renders grade letter A with correct aria label', () => {
    render(<GradeBadge grade="A" />)
    const badge = screen.getByRole('img')
    expect(badge).toHaveAttribute('aria-label', 'Grade A: Diabetes-friendly')
    expect(badge).toHaveAttribute('title', expect.stringContaining('net carbs'))
    expect(badge).toHaveTextContent('A')
  })

  it('renders grade letter F', () => {
    render(<GradeBadge grade="F" />)
    expect(screen.getByRole('img')).toHaveTextContent('F')
  })

  it('renders "?" for null grade', () => {
    render(<GradeBadge grade={null} />)
    const badge = screen.getByRole('img')
    expect(badge).toHaveTextContent('?')
    expect(badge).toHaveAttribute('aria-label', 'No grade available')
  })

  it('respects size prop', () => {
    const { container } = render(<GradeBadge grade="B" size="lg" />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.width).toBe('44px')
  })

  it('flags an estimated grade in the aria label and shows a marker', () => {
    const { container } = render(<GradeBadge grade="C" estimated />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('estimated'),
    )
    // The "~" marker is decorative (aria-hidden) but present in the DOM.
    expect(container.textContent).toContain('~')
  })

  it('does not show the estimated marker by default', () => {
    const { container } = render(<GradeBadge grade="C" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toContain('estimated')
    expect(container.textContent).not.toContain('~')
  })
})
