import { describe, it, expect } from 'vitest'
import { assignTriangulation, isImportable, TRIANGULATION_TIERS, type MethodEstimate } from '../triangulate.js'

function est(method: MethodEstimate['method'], carbs: number, full?: MethodEstimate['full']): MethodEstimate {
  return { method, carbs, full }
}

describe('assignTriangulation', () => {
  it('returns null when no two methods agree', () => {
    expect(assignTriangulation([est('keyword', 20), est('chain', 60)], 'entree')).toBeNull()
  })

  it('returns null with fewer than two estimates', () => {
    expect(assignTriangulation([est('keyword', 40)], 'entree')).toBeNull()
  })

  it('combines an agreeing pair as the mean with the measured tier confidence', () => {
    const r = assignTriangulation([est('chain', 50), est('decomposition', 54)], 'entree')
    expect(r).not.toBeNull()
    expect(r!.carbs).toBe(52)
    expect(r!.tier).toBe('chain+decomposition')
    expect(r!.confidence).toBe(TRIANGULATION_TIERS['chain+decomposition'].other) // 60
  })

  it('grants the beverage tier only to beverages', () => {
    const bev = assignTriangulation([est('chain', 30), est('decomposition', 32)], 'beverage')
    const ent = assignTriangulation([est('chain', 30), est('decomposition', 32)], 'entree')
    expect(bev!.confidence).toBe(72)
    expect(ent!.confidence).toBe(60)
  })

  it('prefers the highest-measured-quality agreeing pair', () => {
    // keyword+chain agree tightly, chain+decomposition also agree —
    // chain+decomposition wins (measured better).
    const r = assignTriangulation(
      [est('keyword', 50), est('chain', 51), est('decomposition', 53)],
      'dessert',
    )
    expect(r!.tier).toBe('chain+decomposition')
  })

  it('falls back to keyword+chain when decomposition disagrees', () => {
    const r = assignTriangulation(
      [est('keyword', 50), est('chain', 52), est('decomposition', 110)],
      'snack',
    )
    expect(r!.tier).toBe('keyword+chain')
    expect(r!.confidence).toBe(TRIANGULATION_TIERS['keyword+chain'].other) // 50
  })

  it('takes macros from the decomposition estimate and clamps sugar/fiber to carbs', () => {
    const r = assignTriangulation(
      [est('chain', 20), est('decomposition', 24, { calories: 200, fat: 5, protein: 3, sugar: 30, fiber: 28, sodium: 100 })],
      'dessert',
    )
    expect(r!.carbs).toBe(22)
    expect(r!.macros!.sugar).toBe(22) // clamped to combined carbs
    expect(r!.macros!.fiber).toBe(22)
    expect(r!.macros!.calories).toBe(200)
  })

  it('grants dosing-grade only where the measured gate passed (signed off 2026-06-11)', () => {
    // Beverage agreements with a decomposition leg measured >=90% within ±10g
    // and 0% severe undercounts → dosing-grade.
    expect(TRIANGULATION_TIERS['chain+decomposition'].beverage).toBeGreaterThanOrEqual(70)
    expect(TRIANGULATION_TIERS['keyword+decomposition'].beverage).toBeGreaterThanOrEqual(70)
    // keyword+chain beverages measured 4.6% severe undercounts → fails the gate.
    expect(TRIANGULATION_TIERS['keyword+chain'].beverage).toBeLessThan(70)
    // No entree/dessert/snack/side tier cleared the gate — all sub-dosing.
    for (const tier of Object.values(TRIANGULATION_TIERS)) {
      expect(tier.other).toBeLessThan(70)
    }
  })
})

describe('isImportable', () => {
  it('rejects out-of-range carbs and macros', () => {
    expect(isImportable({ carbs: 600, confidence: 60, tier: 't', agreeing: [], macros: null })).toBe(false)
    expect(isImportable({ carbs: 40, confidence: 60, tier: 't', agreeing: [], macros: { calories: 9000, fat: 1, protein: 1, sugar: 1, fiber: 1, sodium: 1 } })).toBe(false)
    expect(isImportable({ carbs: 40, confidence: 60, tier: 't', agreeing: [], macros: { calories: 400, fat: 10, protein: 10, sugar: 10, fiber: 2, sodium: 400 } })).toBe(true)
  })
})

describe('MULTI_SERVING_PATTERN', () => {
  it('matches multi-serving formats that must not import', async () => {
    const { MULTI_SERVING_PATTERN } = await import('../triangulate.js')
    for (const name of ['All Classic Dozen', 'Whole Cheese Pizza', 'BBQ Sharing Platter', 'Family Bucket', "Signature Amorette's Cake"]) {
      expect(MULTI_SERVING_PATTERN.test(name), name).toBe(true)
    }
  })

  it('does not match ordinary single-serving items', async () => {
    const { MULTI_SERVING_PATTERN } = await import('../triangulate.js')
    for (const name of ['Chicken Gyro Combo', 'French Toast', "Princess Peach's Cake Slice", 'Pepperoni Pizza Slice']) {
      expect(MULTI_SERVING_PATTERN.test(name), name).toBe(false)
    }
  })
})
