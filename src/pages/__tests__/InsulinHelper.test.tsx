import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
