import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackingList from '../PackingList'

beforeEach(() => {
  localStorage.clear()
})

describe('PackingList', () => {
  it('persists progress per selected profile and exposes reset/print controls', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PackingList />)

    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument()
    expect(screen.getByText(/Essentials 0\/12/i)).toBeInTheDocument()

    await user.click(screen.getByLabelText(/blood glucose meter/i))

    expect(screen.getByText(/Essentials 1\/12/i)).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem('dg_checklist') ?? '{}')
    expect(saved.t1).toBeDefined()
    expect(Object.values(saved.t1)).toContain(true)

    await user.click(screen.getByLabelText(/^child$/i))

    expect(screen.getByText(/Essentials 0\/12/i)).toBeInTheDocument()
    await user.click(screen.getByLabelText(/blood glucose meter/i))
    expect(screen.getByText(/Essentials 1\/12/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /print \/ export pdf/i }))
    expect(printSpy).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /reset checklist/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByText(/Essentials 0\/12/i)).toBeInTheDocument()
  }, 10_000)
})
