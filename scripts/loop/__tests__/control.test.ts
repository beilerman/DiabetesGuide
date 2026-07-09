import { describe, it, expect } from 'vitest'
import {
  isGapItem,
  buildEnrichmentWorklist,
  computeMetrics,
  decideContinue,
  DEFAULT_LOOP_OPTIONS,
} from '../control.js'
import type { LoopMetrics, LoopOptions } from '../control.js'
import type { Item, NutData } from '../../audit/types.js'

function makeItem(overrides: Partial<Item> & { nd?: Partial<NutData> | null }): Item {
  const { nd: ndOverrides, ...itemOverrides } = overrides
  const nutritional_data: NutData[] =
    ndOverrides === null
      ? []
      : [
          {
            id: 'nd-id',
            calories: 500,
            carbs: 50,
            fat: 20,
            protein: 25,
            sugar: 10,
            fiber: 5,
            sodium: 800,
            cholesterol: 50,
            alcohol_grams: null,
            source: 'official',
            confidence_score: 70,
            ...ndOverrides,
          },
        ]
  return {
    id: 'test-id',
    name: 'Test Item',
    category: 'entree',
    is_vegetarian: false,
    is_fried: false,
    description: null,
    restaurant: { name: 'Test Restaurant', park: { name: 'Test Park' } },
    nutritional_data,
    ...itemOverrides,
  }
}

const CTX = { iteration: 1, findings: { high: 0, medium: 0, low: 0 }, autoFixesApplied: 0, enrichedThisIteration: 0 }

describe('isGapItem', () => {
  it('returns false for a dosing-grade full row', () => {
    expect(isGapItem(makeItem({ nd: { carbs: 50, confidence_score: 70, calories: 500 } }))).toBe(false)
  })

  it('returns true when carbs are null', () => {
    expect(isGapItem(makeItem({ nd: { carbs: null } }))).toBe(true)
  })

  it('returns true when carbs are present but low-confidence (not dosing-grade)', () => {
    expect(isGapItem(makeItem({ nd: { carbs: 40, confidence_score: 30 } }))).toBe(true)
  })

  it('returns true when there is no nutrition row', () => {
    expect(isGapItem(makeItem({ nd: null }))).toBe(true)
  })

  it('returns true when calories are null (even with dosing-grade carbs)', () => {
    expect(isGapItem(makeItem({ nd: { carbs: 50, confidence_score: 70, calories: null } }))).toBe(true)
  })
})

describe('computeMetrics', () => {
  it('reports 100% dosing-grade and 0 gaps for an all-dosing-grade set', () => {
    const items = [
      makeItem({ id: 'a', nd: { carbs: 50, confidence_score: 70, calories: 500 } }),
      makeItem({ id: 'b', nd: { carbs: 30, confidence_score: 90, calories: 300 } }),
    ]
    const m = computeMetrics(items, CTX)
    expect(m.totalItems).toBe(2)
    expect(m.dosingGradeCarbsPct).toBe(100)
    expect(m.hasCarbsPct).toBe(100)
    expect(m.caloriesPresentPct).toBe(100)
    expect(m.nullCaloriePct).toBe(0)
    expect(m.gapItemCount).toBe(0)
  })

  it('computes correct percentages for a mixed set', () => {
    const items = [
      makeItem({ id: 'a', nd: { carbs: 50, confidence_score: 70, calories: 500 } }), // dosing grade, has cal
      makeItem({ id: 'b', nd: { carbs: 40, confidence_score: 30, calories: 400 } }), // not dosing grade
      makeItem({ id: 'c', nd: { carbs: null, confidence_score: 70, calories: 200 } }), // carbs null
      makeItem({ id: 'd', nd: null }), // no row → gap + nullCalorie
    ]
    const m = computeMetrics(items, CTX)
    expect(m.totalItems).toBe(4)
    expect(m.dosingGradeCarbsPct).toBe(25) // only 'a'
    expect(m.hasCarbsPct).toBe(50) // a, b
    expect(m.caloriesPresentPct).toBe(75) // a, b, c
    expect(m.nullCaloriePct).toBe(25) // d
    expect(m.gapItemCount).toBe(3) // b, c, d
  })

  it('counts a null-nutrition item as a gap and a null-calorie', () => {
    const m = computeMetrics([makeItem({ nd: null })], CTX)
    expect(m.gapItemCount).toBe(1)
    expect(m.nullCaloriePct).toBe(100)
    expect(m.caloriesPresentPct).toBe(0)
    expect(m.dosingGradeCarbsPct).toBe(0)
  })

  it('counts the priority slice (WDW entree in, local side out)', () => {
    const items = [
      makeItem({
        id: 'wdw',
        category: 'entree',
        restaurant: { name: 'Cosmic Ray', park: { name: 'Walt Disney World' } },
        nd: { carbs: 50, confidence_score: 70, calories: 500 },
      }),
      makeItem({
        id: 'local',
        category: 'side',
        restaurant: { name: 'Corner Cafe', park: { name: 'Some Local Park' } },
        nd: { carbs: 20, confidence_score: 70, calories: 100 },
      }),
    ]
    const m = computeMetrics(items, CTX)
    expect(m.prioritySliceTotal).toBe(1)
    expect(m.prioritySliceDosing).toBe(1)
    expect(m.prioritySliceDosingPct).toBe(100)
  })

  it('passes through iteration and finding/action counts', () => {
    const m = computeMetrics([makeItem({})], {
      iteration: 4,
      findings: { high: 3, medium: 2, low: 1 },
      autoFixesApplied: 7,
      enrichedThisIteration: 9,
    })
    expect(m.iteration).toBe(4)
    expect(m.highFindings).toBe(3)
    expect(m.mediumFindings).toBe(2)
    expect(m.lowFindings).toBe(1)
    expect(m.autoFixesApplied).toBe(7)
    expect(m.enrichedThisIteration).toBe(9)
  })

  it('guards against a zero-item set', () => {
    const m = computeMetrics([], CTX)
    expect(m.totalItems).toBe(0)
    expect(m.dosingGradeCarbsPct).toBe(0)
    expect(m.prioritySliceDosingPct).toBe(0)
  })
})

describe('buildEnrichmentWorklist', () => {
  it('orders gap items by dosing priority (high-carb WDW entree outranks low-carb local side)', () => {
    const wdwEntree = makeItem({
      id: 'wdw',
      category: 'entree',
      restaurant: { name: 'Cosmic Ray', park: { name: 'Walt Disney World' } },
      nd: { carbs: 90, confidence_score: 30 },
    })
    const localSide = makeItem({
      id: 'local',
      category: 'side',
      restaurant: { name: 'Corner Cafe', park: { name: 'Some Local Park' } },
      nd: { carbs: 10, confidence_score: 30 },
    })
    const worklist = buildEnrichmentWorklist([localSide, wdwEntree])
    expect(worklist).toHaveLength(2)
    expect(worklist[0]!.item.id).toBe('wdw')
    expect(worklist[1]!.item.id).toBe('local')
    expect(worklist[0]!.score).toBeGreaterThan(worklist[1]!.score)
  })

  it('describes the most severe gap in reason', () => {
    const noRow = makeItem({ id: 'norow', nd: null })
    const carbsNull = makeItem({ id: 'carbsnull', nd: { carbs: null } })
    const notDosing = makeItem({ id: 'notdosing', nd: { carbs: 40, confidence_score: 30 } })
    const calMissing = makeItem({ id: 'calmissing', nd: { carbs: 50, confidence_score: 70, calories: null } })
    const worklist = buildEnrichmentWorklist([noRow, carbsNull, notDosing, calMissing])
    const byId = Object.fromEntries(worklist.map((e) => [e.item.id, e.reason]))
    expect(byId['norow']).toBe('no nutrition row')
    expect(byId['carbsnull']).toBe('carbs missing')
    expect(byId['notdosing']).toBe('carbs not dosing-grade')
    expect(byId['calmissing']).toBe('calories missing')
  })

  it('includes only gap items', () => {
    const good = makeItem({ id: 'good', nd: { carbs: 50, confidence_score: 70, calories: 500 } })
    const gap = makeItem({ id: 'gap', nd: { carbs: null } })
    const worklist = buildEnrichmentWorklist([good, gap])
    expect(worklist).toHaveLength(1)
    expect(worklist[0]!.item.id).toBe('gap')
  })
})

function makeMetrics(overrides: Partial<LoopMetrics>): LoopMetrics {
  return {
    iteration: 1,
    totalItems: 100,
    highFindings: 0,
    mediumFindings: 0,
    lowFindings: 0,
    autoFixesApplied: 0,
    enrichedThisIteration: 0,
    dosingGradeCarbsPct: 50,
    hasCarbsPct: 80,
    caloriesPresentPct: 80,
    nullCaloriePct: 20,
    prioritySliceTotal: 10,
    prioritySliceDosing: 5,
    prioritySliceDosingPct: 50,
    gapItemCount: 40,
    ...overrides,
  }
}

describe('decideContinue', () => {
  it('continues on empty history with reason "starting"', () => {
    const d = decideContinue([], DEFAULT_LOOP_OPTIONS)
    expect(d.continue).toBe(true)
    expect(d.reason).toBe('starting')
  })

  it('stops when max iterations reached', () => {
    const opts: LoopOptions = { ...DEFAULT_LOOP_OPTIONS, maxIterations: 3 }
    const d = decideContinue([makeMetrics({ iteration: 3, gapItemCount: 40, highFindings: 5 })], opts)
    expect(d.continue).toBe(false)
    expect(d.reason).toBe('reached max iterations (3)')
  })

  it('stops when zero gaps and zero HIGH findings remain', () => {
    const d = decideContinue(
      [makeMetrics({ iteration: 2, gapItemCount: 0, highFindings: 0 })],
      DEFAULT_LOOP_OPTIONS,
    )
    expect(d.continue).toBe(false)
    expect(d.reason).toBe('no gaps or HIGH findings remain')
  })

  it('stops when the last convergenceRounds iterations show < minImprovement and no HIGH drop', () => {
    const opts: LoopOptions = { ...DEFAULT_LOOP_OPTIONS, maxIterations: 6, minImprovementPct: 0.5, convergenceRounds: 2 }
    const history = [
      makeMetrics({ iteration: 1, dosingGradeCarbsPct: 10.0, highFindings: 5, gapItemCount: 40 }),
      makeMetrics({ iteration: 2, dosingGradeCarbsPct: 10.2, highFindings: 5, gapItemCount: 39 }),
      makeMetrics({ iteration: 3, dosingGradeCarbsPct: 10.3, highFindings: 5, gapItemCount: 38 }),
    ]
    const d = decideContinue(history, opts)
    expect(d.continue).toBe(false)
    expect(d.reason).toBe('converged: 2 rounds with < 0.5% carb-trust gain and no HIGH reduction')
  })

  it('continues when the run is still improving', () => {
    const opts: LoopOptions = { ...DEFAULT_LOOP_OPTIONS, maxIterations: 6, minImprovementPct: 0.5, convergenceRounds: 2 }
    const history = [
      makeMetrics({ iteration: 1, dosingGradeCarbsPct: 10.0, highFindings: 5, gapItemCount: 40 }),
      makeMetrics({ iteration: 2, dosingGradeCarbsPct: 11.0, highFindings: 5, gapItemCount: 39 }),
    ]
    const d = decideContinue(history, opts)
    expect(d.continue).toBe(true)
    expect(d.reason).toBe('continuing')
  })
})
