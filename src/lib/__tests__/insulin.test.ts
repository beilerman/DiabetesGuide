import { describe, expect, it } from 'vitest'
import { calculateInsulinDose, validateInsulinInputs } from '../insulin'

describe('validateInsulinInputs', () => {
  it('requires all clinically relevant values before showing a dose', () => {
    const validation = validateInsulinInputs({
      carbs: '',
      bloodGlucose: '',
      targetGlucose: 120,
      insulinToCarbRatio: '',
      correctionFactor: '',
      activity: 'none',
    })

    expect(validation.isValid).toBe(false)
    expect(validation.messages).toContain('Enter total carbs.')
    expect(validation.messages).toContain('Enter current blood glucose.')
    expect(validation.messages).toContain('Enter your insulin-to-carb ratio.')
    expect(validation.messages).toContain('Enter your correction factor.')
  })

  it('rejects zero or negative ratio and correction factor values', () => {
    const validation = validateInsulinInputs({
      carbs: 30,
      bloodGlucose: 180,
      targetGlucose: 120,
      insulinToCarbRatio: 0,
      correctionFactor: -1,
      activity: 'none',
    })

    expect(validation.isValid).toBe(false)
    expect(validation.messages).toContain('Insulin-to-carb ratio must be greater than 0.')
    expect(validation.messages).toContain('Correction factor must be greater than 0.')
  })
})

describe('calculateInsulinDose', () => {
  it('returns null until inputs are valid', () => {
    expect(calculateInsulinDose({
      carbs: 30,
      bloodGlucose: '',
      targetGlucose: 120,
      insulinToCarbRatio: 10,
      correctionFactor: 50,
      activity: 'none',
    })).toBeNull()
  })

  it('calculates carb bolus, correction, and activity adjustment', () => {
    const result = calculateInsulinDose({
      carbs: 60,
      bloodGlucose: 220,
      targetGlucose: 120,
      insulinToCarbRatio: 12,
      correctionFactor: 50,
      activity: 'mod',
    })

    expect(result).toEqual({
      carbBolus: 5,
      correction: 2,
      adjPct: 25,
      suggested: 5.3,
    })
  })
})
