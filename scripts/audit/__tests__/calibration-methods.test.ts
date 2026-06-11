import { describe, it, expect } from 'vitest'
import {
  classifyFoodClass,
  chainClassEstimate,
  buildCarbFractionTable,
  estimatesAgree,
  type OfficialRow,
} from '../calibration-methods.js'

describe('classifyFoodClass', () => {
  it('classifies common park foods', () => {
    expect(classifyFoodClass('Bacon Cheeseburger')).toBe('burger')
    expect(classifyFoodClass('Pepperoni Pizza')).toBe('pizza')
    expect(classifyFoodClass('Cinnamon Sugar Churros')).toBe('churro')
    expect(classifyFoodClass('Mickey Pretzel')).toBe('pretzel')
    expect(classifyFoodClass('Caramel Latte')).toBe('coffee-drink')
    expect(classifyFoodClass('Strawberry Milkshake')).toBe('shake-float')
  })

  it('respects exclusions learned from historical regex traps', () => {
    // ice cream sandwich is ice-cream, not sandwich/cookie
    expect(classifyFoodClass('Ice Cream Sandwich')).toBe('ice-cream')
    // tea-smoked duck is not a tea drink (and matches no class)
    expect(classifyFoodClass('Tea-Smoked Duck')).toBeNull()
    // funnel cake is its own class, not cake-cupcake
    expect(classifyFoodClass('Funnel Cake with Powdered Sugar')).toBe('funnel-cake')
    // crab cake is not cake
    expect(classifyFoodClass('Crab Cake Sliders')).not.toBe('cake-cupcake')
  })

  it('returns null rather than guessing for unclassifiable names', () => {
    expect(classifyFoodClass('Ronto Roaster Mystery Platter of Endor')).toBeNull()
  })

  it('handles diacritics', () => {
    expect(classifyFoodClass('Crème Brûlée Latte')).toBe('coffee-drink')
  })
})

function official(id: string, name: string, carbs: number, calories: number | null = 400): OfficialRow {
  return { id, name, category: 'snack', carbs, calories }
}

describe('chainClassEstimate', () => {
  const pool: OfficialRow[] = [
    official('p1', 'Original Pretzel', 50),
    official('p2', 'Salted Pretzel Twist', 54),
    official('p3', 'Cheese Pretzel', 58),
    official('p4', 'Bavarian Pretzel', 60),
    official('p5', 'Stadium Pretzel', 64),
    official('p6', 'Jumbo Pretzel Knot', 70),
  ]

  it('estimates the class median with leave-one-out', () => {
    const est = chainClassEstimate({ id: 'target', name: 'Park Pretzel Bites' }, pool)
    expect(est).not.toBeNull()
    expect(est!.cls).toBe('pretzel')
    expect(est!.poolSize).toBe(6)
    expect(est!.carbs).toBe(59) // median of 50,54,58,60,64,70
  })

  it('excludes the target row and identically-named siblings from the pool', () => {
    const est = chainClassEstimate({ id: 'p6', name: 'Jumbo Pretzel Knot' }, pool)
    expect(est!.poolSize).toBe(5) // p6 excluded by id (and name)
  })

  it('declines when the class pool is too thin', () => {
    const thin = pool.slice(0, 3)
    expect(chainClassEstimate({ id: 't', name: 'Another Pretzel' }, thin, 5)).toBeNull()
  })

  it('declines for unclassifiable items instead of guessing', () => {
    expect(chainClassEstimate({ id: 't', name: 'Galactic Mystery Platter Thing' }, pool)).toBeNull()
  })
})

describe('buildCarbFractionTable', () => {
  it('measures how tightly calories pin carbs per class', () => {
    // Churros: tight carb fraction (~0.5 of calories)
    const rows: OfficialRow[] = Array.from({ length: 12 }, (_, i) =>
      official(`c${i}`, `Churro ${i}`, 50 + i, 420 + i * 4),
    )
    const table = buildCarbFractionTable(rows, 10)
    expect(table).toHaveLength(1)
    expect(table[0].cls).toBe('churro')
    expect(table[0].n).toBe(12)
    expect(table[0].medianFrac).toBeGreaterThan(0.4)
    expect(table[0].medianFrac).toBeLessThan(0.6)
    expect(table[0].impliedCarbSpreadAtMedianCal).toBeLessThan(15)
  })

  it('skips tiny-calorie rows and classes below the minimum n', () => {
    const rows: OfficialRow[] = [
      official('z1', 'Black Coffee', 0, 5), // < 50 cal — excluded
      ...Array.from({ length: 5 }, (_, i) => official(`b${i}`, `Burger ${i}`, 45, 800)),
    ]
    expect(buildCarbFractionTable(rows, 10)).toHaveLength(0)
  })
})

describe('estimatesAgree', () => {
  it('agrees within the 8g floor for small items', () => {
    expect(estimatesAgree(10, 17)).toBe(true)
    expect(estimatesAgree(10, 19)).toBe(false)
  })

  it('agrees within 15% for large items', () => {
    expect(estimatesAgree(100, 114)).toBe(true) // 14 <= max(8, 16.05)
    expect(estimatesAgree(100, 120)).toBe(false) // 20 > 16.5
  })
})
