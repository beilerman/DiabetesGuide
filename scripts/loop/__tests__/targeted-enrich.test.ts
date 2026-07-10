import { describe, it, expect } from 'vitest'
import { buildTargetedEstimates, applyTargetedEstimates } from '../targeted-enrich.js'
import type { TargetedEstimate } from '../targeted-enrich.js'
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
 * numeric panel). They classifyFoodClass -> 'burger' (so they feed the chain
 * pool, median carbs = 40) AND share the 'burger' + 'cheeseburger' keywords
 * with a target named "Cheeseburger" (so estimateNutrition copies from them,
 * carbs ~= 40). Both estimators therefore land on 40 and AGREE.
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

describe('buildTargetedEstimates', () => {
  it('POSITIVE: fills a carb hole for a burger when keyword + chain agree', () => {
    const target = makeItem({
      id: 'target',
      name: 'Cheeseburger',
      category: 'entree',
      // Genuine hole: nutrition row exists but carbs is null (reason 'carbs missing').
      nd: { id: 'nd-target', carbs: null, calories: null, fat: null, protein: null, source: 'crowdsourced', confidence_score: 30 },
    })

    const result = buildTargetedEstimates([...officialBurgerPool(), target], { limit: 10 })

    expect(result).toHaveLength(1)
    const est = result[0]!
    expect(est.itemId).toBe('target')
    expect(est.nutritionDataId).toBe('nd-target')
    expect(est.carbs).toBe(40)
    expect(est.confidence).toBeLessThanOrEqual(65)
    expect(est.method).toContain('triangulated')
    expect(est.agreeing).toEqual(['keyword', 'chain'])
    expect(est.reason).toBe('carbs missing')
  })

  it('POSITIVE: item with NO nutrition row is inserted (nutritionDataId null)', () => {
    const target = makeItem({
      id: 'target-norow',
      name: 'Cheeseburger',
      category: 'entree',
      nd: null, // no nutrition row at all -> reason 'no nutrition row'
    })

    const result = buildTargetedEstimates([...officialBurgerPool(), target], { limit: 10 })

    expect(result).toHaveLength(1)
    expect(result[0]!.nutritionDataId).toBeNull()
    expect(result[0]!.reason).toBe('no nutrition row')
  })

  it('NEGATIVE: an item that already has numeric carbs is never returned', () => {
    // carbs present but low confidence -> reason 'carbs not dosing-grade', NOT a hole.
    const existing = makeItem({
      id: 'has-carbs',
      name: 'Cheeseburger',
      category: 'entree',
      nd: { id: 'nd-has', carbs: 45, calories: null, source: 'crowdsourced', confidence_score: 40 },
    })

    const result = buildTargetedEstimates([...officialBurgerPool(), existing], { limit: 10 })

    expect(result.find((e) => e.itemId === 'has-carbs')).toBeUndefined()
    expect(result).toHaveLength(0)
  })

  it('NEGATIVE: only one method available (no official pool) -> item skipped', () => {
    // Keyword pool present (crowdsourced full-panel burgers) but NO official rows,
    // so chainClassEstimate returns null -> single-source -> no import.
    const keywordPool: Item[] = [
      'Double Cheeseburger',
      'Bacon Cheeseburger',
      'Classic Cheeseburger',
    ].map((name, i) =>
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

    const result = buildTargetedEstimates([...keywordPool, target], { limit: 10 })
    expect(result).toHaveLength(0)
  })

  it('NEGATIVE: methods disagree (carbs far apart) -> item skipped', () => {
    // Official pool = plain burgers (no 'cheeseburger' keyword overlap) with carbs 40
    // -> chain median 40, but low keyword similarity so they are NOT copied.
    const officialPlain: Item[] = [
      'Bacon Burger',
      'Mushroom Burger',
      'Onion Burger',
      'Pepper Burger',
      'Chili Burger',
    ].map((name, i) =>
      makeItem({
        id: `off-${i}`,
        name,
        category: 'entree',
        nd: { id: `nd-off-${i}`, carbs: 40, calories: 600, fat: 30, protein: 30, source: 'official', confidence_score: 90 },
      }),
    )
    // High-carb cheeseburger copies (crowdsourced) -> keyword estimate ~120.
    const keywordHigh: Item[] = [
      'Double Cheeseburger',
      'Bacon Cheeseburger',
      'Classic Cheeseburger',
    ].map((name, i) =>
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

    const result = buildTargetedEstimates([...officialPlain, ...keywordHigh, target], { limit: 10 })
    expect(result).toHaveLength(0)
  })

  it('respects the limit (produces at most `limit`)', () => {
    const targetA = makeItem({
      id: 'target-a',
      name: 'Cheeseburger',
      category: 'entree',
      nd: { id: 'nd-a', carbs: null, source: 'crowdsourced', confidence_score: 30 },
    })
    const targetB = makeItem({
      id: 'target-b',
      name: 'Cheeseburger',
      category: 'entree',
      nd: { id: 'nd-b', carbs: null, source: 'crowdsourced', confidence_score: 30 },
    })

    const all = [...officialBurgerPool(), targetA, targetB]
    expect(buildTargetedEstimates(all, { limit: 5 })).toHaveLength(2)
    expect(buildTargetedEstimates(all, { limit: 1 })).toHaveLength(1)
  })
})

describe('applyTargetedEstimates', () => {
  function makeEstimate(over: Partial<TargetedEstimate>): TargetedEstimate {
    return {
      itemId: 'item-1',
      nutritionDataId: 'nd-1',
      name: 'Cheeseburger',
      category: 'entree',
      carbs: 40,
      macros: { calories: 600, fat: 30, protein: 30, sugar: 8, fiber: 2, sodium: 900 },
      confidence: 50,
      method: 'triangulated(keyword+chain)',
      agreeing: ['keyword', 'chain'],
      priorityScore: 10,
      reason: 'carbs missing',
      ...over,
    }
  }

  // Minimal Supabase stub recording the calls each estimate makes.
  function makeStub(behavior: { error?: boolean } = {}) {
    const calls: Array<{ op: 'update' | 'insert'; payload: Record<string, unknown>; id?: string }> = []
    const stub = {
      from() {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(_col: string, id: string) {
                calls.push({ op: 'update', payload, id })
                return Promise.resolve({ error: behavior.error ? { message: 'boom' } : null })
              },
            }
          },
          insert(payload: Record<string, unknown>) {
            calls.push({ op: 'insert', payload })
            return Promise.resolve({ error: behavior.error ? { message: 'boom' } : null })
          },
        }
      },
    }
    return { stub, calls }
  }

  it('updates when nutritionDataId is set, inserts when null', async () => {
    const { stub, calls } = makeStub()
    const estimates = [
      makeEstimate({ nutritionDataId: 'nd-1', itemId: 'item-1' }),
      makeEstimate({ nutritionDataId: null, itemId: 'item-2' }),
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await applyTargetedEstimates(stub as any, estimates)

    expect(res).toEqual({ updated: 1, inserted: 1, failed: 0 })
    expect(calls[0]).toMatchObject({ op: 'update', id: 'nd-1' })
    expect(calls[0]!.payload).toMatchObject({ carbs: 40, source: 'crowdsourced', confidence_score: 50, calories: 600 })
    expect(calls[1]).toMatchObject({ op: 'insert' })
    expect(calls[1]!.payload).toMatchObject({ menu_item_id: 'item-2', carbs: 40 })
  })

  it('omits null macros from the written fields', async () => {
    const { stub, calls } = makeStub()
    await applyTargetedEstimates(stub as any, [
      makeEstimate({ macros: { calories: 500, fat: null, protein: null, sugar: null, fiber: null, sodium: null } }),
    ])
    expect(calls[0]!.payload).toMatchObject({ carbs: 40, calories: 500 })
    expect(calls[0]!.payload).not.toHaveProperty('fat')
    expect(calls[0]!.payload).not.toHaveProperty('sodium')
  })

  it('counts failures without throwing', async () => {
    const { stub } = makeStub({ error: true })
    const res = await applyTargetedEstimates(stub as any, [
      makeEstimate({ nutritionDataId: 'nd-1' }),
      makeEstimate({ nutritionDataId: null }),
    ])
    expect(res).toEqual({ updated: 0, inserted: 0, failed: 2 })
  })
})
