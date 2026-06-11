import { describe, it, expect } from 'vitest'
import { scoreCalibrationPairs, type CalibrationPair } from '../calibrate.js'

function pair(predicted: number | null, actual: number, conf: number | null = 50): CalibrationPair {
  return { item: 'x', predictedCarbs: predicted, actualCarbs: actual, assignedConfidence: conf }
}

describe('scoreCalibrationPairs', () => {
  it('computes MAE, within-bands, and coverage', () => {
    const m = scoreCalibrationPairs([
      pair(50, 50),   // 0g error
      pair(40, 50),   // 10g error
      pair(20, 50),   // 30g error, severe undercount
      pair(null, 50), // no estimate
    ])
    expect(m.n).toBe(4)
    expect(m.estimated).toBe(3)
    expect(m.coveragePct).toBe(75)
    expect(m.carbMAE).toBeCloseTo((0 + 10 + 30) / 3, 1)
    expect(m.pctWithin10g).toBeCloseTo(66.7, 1)
    expect(m.severeUndercountPct).toBeCloseTo(33.3, 1)
  })

  it('severe undercount only counts the dangerous direction (prediction too LOW)', () => {
    const m = scoreCalibrationPairs([
      pair(80, 50), // 30g OVER — wrong but not an undercount
      pair(20, 50), // 30g UNDER — dangerous
    ])
    expect(m.severeUndercountPct).toBe(50)
  })

  it('handles zero-carb actuals in the within-20% band without dividing by zero', () => {
    const m = scoreCalibrationPairs([pair(0, 0), pair(5, 0)])
    expect(m.pctWithin20pct).toBe(50) // exact zero match counts, 5g vs 0g does not
  })

  it('returns null metrics when nothing was estimated', () => {
    const m = scoreCalibrationPairs([pair(null, 30)])
    expect(m.estimated).toBe(0)
    expect(m.carbMAE).toBeNull()
  })

  it('expresses dose impact at ICR 10', () => {
    const m = scoreCalibrationPairs([pair(30, 50)]) // 20g error = 2 units at 10g/u
    expect(m.doseErrorUnitsAtICR10).toBe(2)
  })
})
