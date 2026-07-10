import { describe, it, expect } from 'vitest'
import { buildPools, triangulateCarbs } from '../estimate-core.js'
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
 * Five official cheeseburger rows (source official, conf 90, carbs 40, full
 * numeric panel). classifyFoodClass -> 'burger' (feeds the chain pool, median
 * carbs = 40) AND share 'burger' + 'cheeseburger' keywords with a target named
 * "Cheeseburger" (estimateNutrition copies from them, carbs ~= 40). Both
 * estimators land on 40 and AGREE.
 */
function officialBurgerPool(carbs = 40): Item[] {
  const names = [
    'Double Cheeseburger',
    'Bacon Cheeseburger',
    'Classic Cheeseburger',
    'Mushroom Cheeseburger',
    'BBQ Cheeseburger',
  ]
  return names.map((name, i) =>
    makeItem({
      id: `off-${i}`,
      name,
      category: 'entree',
      nd: { id: `nd-off-${i}`, carbs, calories: 600, fat: 30, protein: 30, source: 'official', confidence_score: 90 },
    }),
  )
}

describe('buildPools', () => {
  it('includes only items with a full numeric macro panel in the keyword pool', () => {
    const full = makeItem({
      id: 'full',
      name: 'Classic Cheeseburger',
      nd: { id: 'nd-full', calories: 600, carbs: 40, fat: 30, protein: 30 },
    })
    const missingFat = makeItem({
      id: 'partial',
      name: 'Bacon Cheeseburger',
      nd: { id: 'nd-partial', calories: 600, carbs: 40, fat: null, protein: 30 },
    })
    const noRow = makeItem({ id: 'norow', name: 'BBQ Cheeseburger', nd: null })

    const { pool } = buildPools([full, missingFat, noRow])
    expect(pool.map((p) => p.id)).toEqual(['full'])
  })

  it('includes only official / conf>=85 / carbs!=null rows in the official pool', () => {
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

    const { officialPool } = buildPools([official, lowConf, crowdsourced, nullCarbs])
    expect(officialPool.map((p) => p.id)).toEqual(['official-ok'])
  })
})

describe('triangulateCarbs', () => {
  it('POSITIVE: keyword + chain agreement -> corroborated estimate', () => {
    const target = makeItem({
      id: 'target',
      name: 'Cheeseburger',
      category: 'entree',
      nd: { id: 'nd-target', carbs: null, calories: null, fat: null, protein: null, source: 'crowdsourced', confidence_score: 30 },
    })

    const pools = buildPools([...officialBurgerPool(), target])
    const est = triangulateCarbs(target, pools)

    expect(est).not.toBeNull()
    expect(est!.carbs).toBe(40)
    expect(est!.confidence).toBeLessThanOrEqual(65)
    expect(est!.method).toContain('triangulated')
    expect(est!.agreeing).toEqual(['keyword', 'chain'])
  })

  it('NEGATIVE: only one method available (no official pool) -> null', () => {
    // Full-panel crowdsourced burgers feed the keyword pool, but NONE are
    // official so chainClassEstimate has no rows -> single-source -> null.
    const keywordPool: Item[] = ['Double Cheeseburger', 'Bacon Cheeseburger', 'Classic Cheeseburger'].map((name, i) =>
      makeItem({
        id: `kw-${i}`,
        name,
        category: 'entree',
        nd: { id: `nd-kw-${i}`, carbs: 40, calories: 600, fat: 30, protein: 30, source: 'crowdsourced', confidence_score: 30 },
      }),
    )
    const target = makeItem({
      id: 'target',
      name: 'Cheeseburger',
      category: 'entree',
      nd: { id: 'nd-target', carbs: null, source: 'crowdsourced', confidence_score: 30 },
    })

    const pools = buildPools([...keywordPool, target])
    expect(triangulateCarbs(target, pools)).toBeNull()
  })

  it('NEGATIVE: methods disagree (carbs far apart) -> null', () => {
    // Official plain burgers (chain median 40) with no 'cheeseburger' keyword
    // overlap, plus high-carb cheeseburger copies (keyword ~120) -> disagree.
    const officialPlain: Item[] = ['Bacon Burger', 'Mushroom Burger', 'Onion Burger', 'Pepper Burger', 'Chili Burger'].map(
      (name, i) =>
        makeItem({
          id: `off-${i}`,
          name,
          category: 'entree',
          nd: { id: `nd-off-${i}`, carbs: 40, calories: 600, fat: 30, protein: 30, source: 'official', confidence_score: 90 },
        }),
    )
    const keywordHigh: Item[] = ['Double Cheeseburger', 'Bacon Cheeseburger', 'Classic Cheeseburger'].map((name, i) =>
      makeItem({
        id: `kw-${i}`,
        name,
        category: 'entree',
        nd: { id: `nd-kw-${i}`, carbs: 120, calories: 900, fat: 40, protein: 40, source: 'crowdsourced', confidence_score: 30 },
      }),
    )
    const target = makeItem({
      id: 'target',
      name: 'Cheeseburger',
      category: 'entree',
      nd: { id: 'nd-target', carbs: null, source: 'crowdsourced', confidence_score: 30 },
    })

    const pools = buildPools([...officialPlain, ...keywordHigh, target])
    expect(triangulateCarbs(target, pools)).toBeNull()
  })

  it('leave-one-out: an official cheeseburger is not self-matched when excluded', () => {
    // Take one of the five official cheeseburgers AS the target. With its own id
    // excluded from both pools, the remaining four official rows are below the
    // chain minPool of 5 -> chain declines -> single-source -> null. This proves
    // the target row is excluded from both pools (no self-match).
    const burgers = officialBurgerPool()
    const target = burgers[0]!

    const pools = buildPools(burgers)
    expect(triangulateCarbs(target, pools, target.id)).toBeNull()
  })
})
