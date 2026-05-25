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
      activeInsulin: 0,
      maxBolus: 25,
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
      activeInsulin: 0,
      maxBolus: 25,
    })

    expect(validation.isValid).toBe(false)
    expect(validation.messages).toContain('Insulin-to-carb ratio must be between 3 and 30 grams per unit.')
    expect(validation.messages).toContain('Correction factor must be between 10 and 150 mg/dL per unit.')
  })

  it('blocks dose calculation while blood glucose is below the hypoglycemia threshold', () => {
    const validation = validateInsulinInputs({
      carbs: 60,
      bloodGlucose: 50,
      targetGlucose: 120,
      insulinToCarbRatio: 12,
      correctionFactor: 50,
      activity: 'none',
      activeInsulin: 0,
      maxBolus: 25,
    })

    expect(validation.isValid).toBe(false)
    expect(validation.status).toBe('hypoglycemia')
    expect(validation.messages).toContain('Blood glucose is below 70 mg/dL. Treat the low before considering meal or correction insulin.')
  })

  it('rejects values outside conservative calculator ranges', () => {
    const validation = validateInsulinInputs({
      carbs: 500,
      bloodGlucose: 999,
      targetGlucose: 40,
      insulinToCarbRatio: 1,
      correctionFactor: 1,
      activity: 'none',
      activeInsulin: -1,
      maxBolus: 75,
    })

    expect(validation.isValid).toBe(false)
    expect(validation.messages).toContain('Total carbs must be between 0 and 250g.')
    expect(validation.messages).toContain('Blood glucose must be between 40 and 600 mg/dL.')
    expect(validation.messages).toContain('Target glucose must be between 70 and 180 mg/dL.')
    expect(validation.messages).toContain('Insulin-to-carb ratio must be between 3 and 30 grams per unit.')
    expect(validation.messages).toContain('Correction factor must be between 10 and 150 mg/dL per unit.')
    expect(validation.messages).toContain('Insulin on board must be between 0 and 50 units.')
    expect(validation.messages).toContain('Max bolus must be between 1 and 50 units.')
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
      activeInsulin: 0,
      maxBolus: 25,
    })).toBeNull()
  })

  it('applies activity adjustment to carb bolus only, not correction', () => {
    const result = calculateInsulinDose({
      carbs: 60,
      bloodGlucose: 220,
      targetGlucose: 120,
      insulinToCarbRatio: 12,
      correctionFactor: 50,
      activity: 'mod',
      activeInsulin: 0,
      maxBolus: 25,
    })

    expect(result).toMatchObject({
      carbBolus: 5,
      activityAdjustedCarbBolus: 3.8,
      correction: 2,
      correctionAfterIob: 2,
      adjPct: 25,
      suggested: 5.8,
      status: 'ok',
    })
  })

  it('subtracts insulin on board from correction insulin only', () => {
    const result = calculateInsulinDose({
      carbs: 60,
      bloodGlucose: 220,
      targetGlucose: 120,
      insulinToCarbRatio: 12,
      correctionFactor: 50,
      activity: 'none',
      activeInsulin: 1.5,
      maxBolus: 25,
    })

    expect(result).toMatchObject({
      carbBolus: 5,
      activityAdjustedCarbBolus: 5,
      correction: 2,
      iobAdjustment: 1.5,
      correctionAfterIob: 0.5,
      suggested: 5.5,
      status: 'ok',
    })
  })

  it('warns but still shows a dose when the suggestion is unusually high', () => {
    const result = calculateInsulinDose({
      carbs: 180,
      bloodGlucose: 180,
      targetGlucose: 120,
      insulinToCarbRatio: 10,
      correctionFactor: 50,
      activity: 'none',
      activeInsulin: 0,
      maxBolus: 25,
    })

    expect(result).toMatchObject({
      suggested: 19.2,
      status: 'warning',
    })
    expect(result?.messages).toContain('Suggested dose is unusually high. Verify carbs, ratios, glucose, and active insulin before using.')
  })

  it('blocks recommendations above the user max bolus or absolute safety cap', () => {
    const aboveUserMax = calculateInsulinDose({
      carbs: 100,
      bloodGlucose: 180,
      targetGlucose: 120,
      insulinToCarbRatio: 10,
      correctionFactor: 50,
      activity: 'none',
      activeInsulin: 0,
      maxBolus: 5,
    })

    expect(aboveUserMax).toMatchObject({
      suggested: null,
      totalBeforeSafety: 11.2,
      status: 'blocked',
    })

    const aboveAbsoluteCap = calculateInsulinDose({
      carbs: 250,
      bloodGlucose: 180,
      targetGlucose: 120,
      insulinToCarbRatio: 3,
      correctionFactor: 50,
      activity: 'none',
      activeInsulin: 0,
      maxBolus: 50,
    })

    expect(aboveAbsoluteCap).toMatchObject({
      suggested: null,
      status: 'blocked',
    })
  })
})
