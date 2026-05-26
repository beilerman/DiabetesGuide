import { beforeEach, describe, expect, it } from 'vitest'
import {
  ESTIMATOR_ACK_KEY,
  hasEstimatorAcknowledgement,
  saveEstimatorAcknowledgement,
} from '../estimator-ack'

beforeEach(() => {
  localStorage.clear()
})

describe('estimator acknowledgement storage', () => {
  it('requires acknowledgement until the user stores the safety acknowledgement', () => {
    expect(hasEstimatorAcknowledgement()).toBe(false)

    saveEstimatorAcknowledgement()

    expect(localStorage.getItem(ESTIMATOR_ACK_KEY)).toBe('true')
    expect(hasEstimatorAcknowledgement()).toBe(true)
  })
})
