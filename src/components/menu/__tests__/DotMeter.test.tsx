import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DotMeter } from '../DotMeter'

const greenFn = () => 'green' as const
const amberFn = () => 'amber' as const

describe('DotMeter', () => {
  it('renders 5 dots', () => {
    const { container } = render(<DotMeter value={50} max={100} colorFn={greenFn} />)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots).toHaveLength(5)
  })

  it('fills correct number of dots for low value', () => {
    const { container } = render(<DotMeter value={10} max={100} colorFn={greenFn} />)
    const filled = container.querySelectorAll('.bg-green-500')
    expect(filled.length).toBe(1)
  })

  it('fills correct number of dots for high value', () => {
    const { container } = render(<DotMeter value={90} max={100} colorFn={amberFn} />)
    const filled = container.querySelectorAll('.bg-amber-500')
    expect(filled.length).toBe(5)
  })

  it('fills 0 dots for zero value', () => {
    const { container } = render(<DotMeter value={0} max={100} colorFn={greenFn} />)
    const filled = container.querySelectorAll('.bg-green-500')
    expect(filled.length).toBe(0)
  })

  it('has meter role with correct aria attributes', () => {
    render(<DotMeter value={50} max={100} colorFn={greenFn} label="Carbs" />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-label', 'Carbs: 3 of 5, moderate')
    expect(meter).toHaveAttribute('aria-valuenow', '3')
    expect(meter).toHaveAttribute('aria-valuemax', '5')
  })

  it('provides accessible label without explicit label prop', () => {
    render(<DotMeter value={20} max={100} colorFn={greenFn} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveAttribute('aria-label', '1 of 5, very low')
  })
})
