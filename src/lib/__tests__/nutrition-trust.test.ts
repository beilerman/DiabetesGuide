import { describe, expect, it } from 'vitest'
import {
  buildNutritionReportMailto,
  getNutritionQualityWarnings,
  getNutritionTrust,
  isNutritionDosingGrade,
} from '../nutrition-trust'
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

  it('keeps visible warnings for unusually high values', () => {
    expect(getNutritionTrust(nutrition({ source: 'crowdsourced', confidence_score: 30, calories: 1100, protein: 140 })).qualityWarnings)
      .toEqual(expect.arrayContaining(['Protein looks unusually high for a single menu item.']))
  })

  it('does not accept confidence alone when certification trust is required', () => {
    const result = getNutritionTrust(
      nutrition({ source: 'official', confidence_score: 90 }),
      { certificationRequired: true, now: new Date('2026-07-11T16:00:00Z') },
    )

    expect(result).toMatchObject({
      level: 'low',
      label: 'Uncertified carb estimate',
      caution: 'Do not dose from this value without verifying it.',
    })
  })

  it('accepts an active Tier A certification with exact serving evidence', () => {
    const certified = nutrition({
      carbs: 42,
      serving_quantity: 1,
      serving_unit: 'item',
      serving_description: '1 sandwich as sold',
      active_certification_id: 'cert-1',
      active_certification: {
        id: 'cert-1',
        menu_item_id: 'item-1',
        tier: 'A',
        status: 'approved',
        canonical_carbs: 42,
        serving_quantity: 1,
        serving_unit: 'item',
        serving_description: '1 sandwich as sold',
        reviewed_at: '2026-07-10T16:00:00Z',
        expires_at: '2026-10-10T16:00:00Z',
        nutrition_certification_evidence: [{
          nutrition_source: {
            id: 'evidence-1',
            source_type: 'official_restaurant',
            upstream_source_key: 'official-document',
            reported_carbs: 42,
            normalized_carbs: null,
            serving_quantity: 1,
            serving_unit: 'item',
            serving_description: '1 sandwich as sold',
            exact_item_match: true,
            exact_serving_match: true,
          },
        }],
      },
    })

    expect(isNutritionDosingGrade(certified, {
      certificationRequired: true,
      now: new Date('2026-07-11T16:00:00Z'),
    })).toBe(true)
    expect(getNutritionTrust(certified, {
      certificationRequired: true,
      now: new Date('2026-07-11T16:00:00Z'),
    })).toMatchObject({
      level: 'verified',
      label: 'Certified nutrition · Tier A',
    })
  })

  it('rejects expired certification', () => {
    const expired = nutrition({
      active_certification_id: 'cert-expired',
      active_certification: {
        id: 'cert-expired',
        menu_item_id: 'item-1',
        tier: 'A',
        status: 'approved',
        canonical_carbs: 0,
        serving_quantity: 1,
        serving_unit: 'item',
        serving_description: '1 item',
        reviewed_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-07-01T00:00:00Z',
        nutrition_certification_evidence: [],
      },
    })

    expect(isNutritionDosingGrade(expired, {
      certificationRequired: true,
      now: new Date('2026-07-11T16:00:00Z'),
    })).toBe(false)
  })
})

describe('getNutritionQualityWarnings', () => {
  it('flags low-confidence zero-carb estimates with substantial calories', () => {
    expect(getNutritionQualityWarnings(nutrition({
      source: 'crowdsourced',
      confidence_score: 30,
      calories: 700,
      carbs: 0,
      fat: 45,
      protein: 40,
    }))).toContain('Zero-carb estimate is low-confidence for a substantial item.')
  })

  it('does not flag verified zero-carb water-style items', () => {
    expect(getNutritionQualityWarnings(nutrition({
      source: 'official',
      confidence_score: 90,
      calories: 0,
      carbs: 0,
    }))).toEqual([])
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
