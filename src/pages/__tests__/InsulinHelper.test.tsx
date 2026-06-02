import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import InsulinHelper from '../InsulinHelper'
import { ESTIMATOR_ACK_KEY } from '../../lib/estimator-ack'

beforeEach(() => {
  localStorage.clear()
})

describe('InsulinHelper acknowledgement', () => {
  it('requires a first-use acknowledgement before using the estimator', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <InsulinHelper />
      </MemoryRouter>,
    )

    expect(screen.getByRole('dialog', { name: /before using this estimator/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /i understand/i }))

    expect(localStorage.getItem(ESTIMATOR_ACK_KEY)).toBe('true')
    expect(screen.queryByRole('dialog', { name: /before using this estimator/i })).not.toBeInTheDocument()
  })

  it('shows why the dose is hidden with a methodology link', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <InsulinHelper />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /i understand/i }))

    expect(screen.getByText(/why is the dose hidden/i)).toBeInTheDocument()
    expect(screen.getAllByText(/missing required input/i)[0]).toHaveTextContent(/blood glucose/i)
    expect(screen.getByRole('link', { name: /safety methodology/i })).toHaveAttribute('href', '/data-sources#estimator-safety')
  })

  it('labels numeric inputs with constraints and inline validation hints', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <InsulinHelper />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /i understand/i }))

    const inputsRegion = screen.getByRole('region', { name: /estimator inputs/i })
    const bgInput = within(inputsRegion).getByLabelText(/blood glucose/i)
    expect(bgInput).toHaveAttribute('inputmode', 'decimal')
    expect(bgInput).toHaveAttribute('min', '40')
    expect(bgInput).toHaveAttribute('max', '600')
    expect(within(bgInput.closest('div') as HTMLElement).getByText(/blood glucose is required/i)).toBeInTheDocument()

    await user.type(bgInput, '25')

    expect(within(bgInput.closest('div') as HTMLElement).getByText(/blood glucose must be between 40 and 600 mg\/dL/i)).toBeInTheDocument()
  })

  it('announces when the dose is suppressed and when it becomes visible', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <InsulinHelper />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /i understand/i }))

    expect(screen.getByTestId('estimator-live-status')).toHaveTextContent(/dose hidden/i)

    const inputsRegion = screen.getByRole('region', { name: /estimator inputs/i })
    await user.type(within(inputsRegion).getByLabelText(/blood glucose/i), '150')
    await user.type(within(inputsRegion).getByLabelText(/target glucose/i), '110')
    await user.type(within(inputsRegion).getByLabelText(/total carbs/i), '45')
    await user.type(within(inputsRegion).getByLabelText(/insulin-to-carb ratio/i), '15')
    await user.type(within(inputsRegion).getByLabelText(/correction factor/i), '50')

    expect(screen.getByTestId('estimator-live-status')).toHaveTextContent(/dose estimate visible/i)
    expect(screen.getByText(/^Suggested Total Dose$/i)).toBeInTheDocument()
  })
})
