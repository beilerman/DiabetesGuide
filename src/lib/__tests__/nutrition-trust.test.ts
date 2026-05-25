import { describe, expect, it } from 'vitest'
import { buildNutritionReportMailto, getNutritionTrust } from '../nutrition-trust'
import type { MenuItemWithNutrition, NutritionalData } from '../types'

function nutrition(overrides: Partial<NutritionalData>): NutritionalData {
  return {
    id: 'nutrition-1',
    menu_item_id: 'item-1',
    calories: 100,
    carbs: 0,
    fat: 0,
    sugar: 0,
    protein: 0,
    fiber: 0,
    sodium: 0,
    cholesterol: 0,
    alcohol_grams: null,
    source: 'official',
    source_detail: null,
    confidence_score: 90,
    created_at: '2026-02-15T12:00:00Z',
    ...overrides,
  }
}

describe('getNutritionTrust', () => {
  it('marks official high-confidence nutrition as verified', () => {
    expect(getNutritionTrust(nutrition({ source: 'official', confidence_score: 90 }))).toMatchObject({
      level: 'verified',
      label: 'Official nutrition',
      caution: null,
      confidenceLabel: '90% confidence',
      lastUpdatedLabel: 'Last updated Feb 15, 2026',
    })
  })

  it('marks non-official high-confidence nutrition as estimated', () => {
    expect(getNutritionTrust(nutrition({ source: 'api_lookup', confidence_score: 75 }))).toMatchObject({
      level: 'estimated',
      label: 'Estimated nutrition',
      caution: 'Verify carbs before dosing.',
      sourceLabel: 'API lookup',
    })
  })

  it('marks low-confidence nutrition as low trust even when macros are present', () => {
    expect(getNutritionTrust(nutrition({ source: 'crowdsourced', confidence_score: 30 }))).toMatchObject({
      level: 'low',
      label: 'Low-confidence estimate',
      caution: 'Do not dose from this value without verifying it.',
      sourceLabel: 'Crowdsourced',
    })
  })

  it('marks missing nutrition as unavailable', () => {
    expect(getNutritionTrust(undefined)).toMatchObject({
      level: 'unavailable',
      label: 'Nutrition unavailable',
      caution: 'This item should not be treated as zero-carb or zero-calorie.',
    })
  })
})

describe('buildNutritionReportMailto', () => {
  it('builds a prefilled report link with item and location context', () => {
    const item = {
      id: 'item-1',
      name: 'Turkey Leg',
      restaurant: {
        name: 'Frontier Cart',
        park: { name: 'Magic Kingdom' },
      },
    } as MenuItemWithNutrition

    const href = buildNutritionReportMailto(item, 'https://example.test/item/item-1')

    expect(href).toContain('mailto:contact@diabetesguide.app')
    expect(decodeURIComponent(href)).toContain('Nutrition report: Turkey Leg')
    expect(decodeURIComponent(href)).toContain('Restaurant: Frontier Cart')
    expect(decodeURIComponent(href)).toContain('Park: Magic Kingdom')
    expect(decodeURIComponent(href)).toContain('Page: https://example.test/item/item-1')
  })
})
