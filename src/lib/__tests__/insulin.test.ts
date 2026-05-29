import { describe, it, expect } from 'vitest'
import { calculateBolus } from '../insulin'

describe('calculateBolus', () => {
  it('basic carb bolus only', () => {
    // 60g carbs / ICR 10 = 6 units, no correction (BG == target)
    const r = calculateBolus({ carbs: 60, bg: 120, target: 120, icr: 10, cf: 50 })
    expect(r).not.toBeNull()
    expect(r!.carbBolus).toBe(6)
    expect(r!.correction).toBe(0)
    expect(r!.total).toBe(6)
  })

  it('positive correction when BG above target', () => {
    // BG 200, target 120, CF 50 → +1.6 units correction
    const r = calculateBolus({ carbs: 30, bg: 200, target: 120, icr: 10, cf: 50 })!
    expect(r.carbBolus).toBe(3)
    expect(r.correction).toBe(1.6)
    expect(r.total).toBe(4.6)
  })

  it('negative correction when BG below target reduces total', () => {
    // BG 80, target 120, CF 50 → -0.8 units correction
    const r = calculateBolus({ carbs: 30, bg: 80, target: 120, icr: 10, cf: 50 })!
    expect(r.carbBolus).toBe(3)
    expect(r.correction).toBe(-0.8)
    expect(r.total).toBe(2.2)
  })

  it('clinical fix: activity reduction applies to carb bolus only, not correction', () => {
    // Hyperglycemic + high activity. Without the fix, the original code
    // multiplied (carb + correction) by (1 - 0.5), under-treating the high BG.
    // With the fix, only the 6u carb bolus is halved; the 1.6u correction stays.
    const r = calculateBolus({
      carbs: 60,
      bg: 200,
      target: 120,
      icr: 10,
      cf: 50,
      activity: 'high',
    })!
    expect(r.carbBolusRaw).toBe(6)        // before activity
    expect(r.carbBolus).toBe(3)           // after -50%
    expect(r.correction).toBe(1.6)         // unchanged
    expect(r.total).toBe(4.6)              // 3 + 1.6
    // With the OLD (broken) math this would have been (6 + 1.6) * 0.5 = 3.8.
    expect(r.total).not.toBe(3.8)
  })

  it('returns null for invalid ICR', () => {
    expect(calculateBolus({ carbs: 30, icr: 0 })).toBeNull()
    expect(calculateBolus({ carbs: 30, icr: -5 })).toBeNull()
  })

  it('returns null for invalid carbs', () => {
    expect(calculateBolus({ carbs: -10, icr: 10 })).toBeNull()
    expect(calculateBolus({ carbs: NaN, icr: 10 })).toBeNull()
  })

  it('total is floored at 0', () => {
    // Big negative correction, small carb bolus
    const r = calculateBolus({ carbs: 5, bg: 60, target: 120, icr: 10, cf: 25 })!
    expect(r.total).toBe(0)
  })

  it('moderate activity is -25%', () => {
    const r = calculateBolus({ carbs: 40, icr: 10, activity: 'mod' })!
    expect(r.activityPct).toBe(25)
    expect(r.carbBolus).toBe(3)        // 4 * 0.75 = 3
  })
})
