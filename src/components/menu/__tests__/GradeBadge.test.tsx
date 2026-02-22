import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GradeBadge } from '../GradeBadge'

describe('GradeBadge', () => {
  it('renders grade letter A with correct aria label', () => {
    render(<GradeBadge grade="A" />)
    const badge = screen.getByRole('img')
    expect(badge).toHaveAttribute('aria-label', 'Grade A: Diabetes-friendly')
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

  it('renders theme ring when themeColor provided', () => {
    const { container } = render(<GradeBadge grade="C" themeColor="#4338ca" />)
    const ring = container.querySelector('[class*="opacity-30"]') as HTMLElement
    expect(ring).toBeTruthy()
    expect(ring.style.border).toContain('rgb(67, 56, 202)')
  })

  it('does not render theme ring when themeColor omitted', () => {
    const { container } = render(<GradeBadge grade="C" />)
    const ring = container.querySelector('[class*="opacity-30"]')
    expect(ring).toBeNull()
  })
})
