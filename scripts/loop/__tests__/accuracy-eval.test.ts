import { describe, it, expect } from 'vitest'
import { buildCalibrationPairs, evaluateAccuracy } from '../accuracy-eval.js'
import type { Item, NutData } from '../../audit/types.js'

function makeItem(overrides: Partial<Item> & { nd?: Partial<NutData> | null }): Item {
  const { nd: ndOverride, ...itemOverrides } = overrides
  const base: NutData = {
    id: 'nd-id',
    calories: 600,
    carbs: 40,
    fat: 30,
    protein: 30,
    sugar: 8,
    fiber: 2,
    sodium: 900,
    cholesterol: 60,
    alcohol_grams: null,
    source: 'official',
    confidence_score: 90,
    ...(ndOverride ?? {}),
  }
  return {
    id: 'test-id',
    name: 'Test Item',
    category: 'entree',
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: 'Test Restaurant', park: { name: 'Walt Disney World' } },
    nutritional_data: ndOverride === null ? [] : [base],
    ...itemOverrides,
  }
}

/**
 * Six official cheeseburger ground-truth rows (source official, conf 90, full
 * numeric panel). classifyFoodClass -> 'burger' feeds the chain pool (>= minPool
 * of 5 survives leave-one-out) AND they share 'burger'+'cheeseburger' keywords
 * so estimateNutrition copies from them. Both estimators land on the same carbs
 * and AGREE, so each row gets a corroborated leave-one-out prediction.
 */
const BURGER_NAMES = [
  'Double Cheeseburger',
  'Bacon Cheeseburger',
  'Classic Cheeseburger',
  'Mushroom Cheeseburger',
  'BBQ Cheeseburger',
  'Deluxe Cheeseburger',
]

function officialBurgers(carbsByIndex: (i: number) => number = () => 40): Item[] {
  return BURGER_NAMES.map((name, i) =>
    makeItem({
      id: `off-${i}`,
      name,
      category: 'entree',
      nd: {
        id: `nd-off-${i}`,
        carbs: carbsByIndex(i),
        calories: 600,
        fat: 30,
        protein: 30,
        source: 'official',
        confidence_score: 90,
      },
    }),
  )
}

describe('buildCalibrationPairs', () => {
  it('emits exactly one pair per official ground-truth row', () => {
    const pairs = buildCalibrationPairs(officialBurgers())
    expect(pairs).toHaveLength(6)
    expect(pairs.map((p) => p.item).sort()).toEqual([...BURGER_NAMES].sort())
    for (const p of pairs) {
      expect(p.actualCarbs).toBe(40)
      expect(p.category).toBe('entree')
    }
  })

  it('excludes non-official / low-confidence / null-carb rows from the pairs', () => {
    const official = makeItem({
      id: 'official-ok',
      name: 'Double Cheeseburger',
      nd: { id: 'nd-1', carbs: 40, source: 'official', confidence_score: 90 },
    })
    const lowConf = makeItem({
      id: 'low-conf',
      name: 'Mushroom Cheeseburger',
      nd: { id: 'nd-2', carbs: 40, source: 'official', confidence_score: 70 },
    })
    const crowdsourced = makeItem({
      id: 'crowd',
      name: 'Bacon Cheeseburger',
      nd: { id: 'nd-3', carbs: 40, source: 'crowdsourced', confidence_score: 90 },
    })
    const nullCarbs = makeItem({
      id: 'null-carbs',
      name: 'Classic Cheeseburger',
      nd: { id: 'nd-4', carbs: null, source: 'official', confidence_score: 90 },
    })

    const pairs = buildCalibrationPairs([official, lowConf, crowdsourced, nullCarbs])
    expect(pairs.map((p) => p.item)).toEqual(['Double Cheeseburger'])
  })

  it('predicts (non-null) and pairs against the official value for corroborated rows', () => {
    const pairs = buildCalibrationPairs(officialBurgers())
    const predicted = pairs.filter((p) => p.predictedCarbs != null)
    // Every burger corroborates (keyword + chain agree) leave-one-out.
    expect(predicted.length).toBeGreaterThan(0)
    for (const p of predicted) {
      expect(p.actualCarbs).toBe(40)
      expect(p.predictedCarbs).toBe(40)
      // triangulation confidence is capped below the app's dosing-grade bar.
      expect(p.assignedConfidence).not.toBeNull()
      expect(p.assignedConfidence!).toBeLessThanOrEqual(65)
    }
  })

  it('leave-one-out is real: an outlier row is predicted from the OTHER rows, not itself', () => {
    // Five rows carry carbs 40; the "Deluxe Cheeseburger" (index 5) carries an
    // outlier 99. Predicting Deluxe leave-one-out must draw ONLY from the five
    // 40g rows -> prediction 40, NOT its own 99. A leak would surface as 99.
    const items = officialBurgers((i) => (i === 5 ? 99 : 40))
    const pairs = buildCalibrationPairs(items)

    const deluxe = pairs.find((p) => p.item === 'Deluxe Cheeseburger')!
    expect(deluxe).toBeDefined()
    expect(deluxe.actualCarbs).toBe(99)
    expect(deluxe.predictedCarbs).not.toBeNull()
    // The prediction comes from the other rows (40), proving self-exclusion.
    expect(deluxe.predictedCarbs).not.toBe(99)
    expect(deluxe.predictedCarbs).toBe(40)
  })
})

describe('evaluateAccuracy', () => {
  it('returns CalibrationMetrics with n === ground-truth count and sane values', () => {
    const items = officialBurgers()
    const m = evaluateAccuracy(items)

    expect(m.n).toBe(6)
    expect(m.estimated).toBe(6)
    expect(m.coveragePct).toBe(100)
    expect(m.carbMAE).not.toBeNull()
    expect(m.carbMAE!).toBeGreaterThanOrEqual(0)
    // Predictions land exactly on the ground truth here -> zero error.
    expect(m.carbMAE).toBe(0)
    expect(m.pctWithin10g).toBe(100)
    expect(m.severeUndercountPct).toBe(0)
  })

  it('handles an empty ground-truth set without throwing (no divide-by-zero)', () => {
    const noOfficial = makeItem({
      id: 'crowd-only',
      name: 'Cheeseburger',
      nd: { id: 'nd-x', carbs: 40, source: 'crowdsourced', confidence_score: 30 },
    })

    const pairs = buildCalibrationPairs([noOfficial])
    expect(pairs).toEqual([])

    const m = evaluateAccuracy([noOfficial])
    expect(m.n).toBe(0)
    expect(m.estimated).toBe(0)
    expect(m.coveragePct).toBe(0)
    expect(m.carbMAE).toBeNull()
    expect(m.doseErrorUnitsAtICR10).toBeNull()
  })
})
