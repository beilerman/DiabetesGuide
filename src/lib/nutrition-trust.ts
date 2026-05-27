import type { MenuItemWithNutrition, NutritionalData } from './types'
import { getMenuItemDisplayName } from './display'

export type NutritionTrustLevel = 'verified' | 'estimated' | 'low' | 'unavailable'

export interface NutritionTrustSummary {
  level: NutritionTrustLevel
  label: string
  sourceLabel: string
  confidenceLabel: string | null
  lastUpdatedLabel: string | null
  caution: string | null
  qualityWarnings: string[]
}

const SOURCE_LABELS: Record<NutritionalData['source'], string> = {
  official: 'Official',
  api_lookup: 'API lookup',
  crowdsourced: 'Crowdsourced',
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function getNutritionTrust(nutrition: NutritionalData | null | undefined): NutritionTrustSummary {
  if (!nutrition) {
    return {
      level: 'unavailable',
      label: 'Nutrition unavailable',
      sourceLabel: 'No source',
      confidenceLabel: null,
      lastUpdatedLabel: null,
      caution: 'This item should not be treated as zero-carb or zero-calorie.',
      qualityWarnings: [],
    }
  }

  const sourceLabel = SOURCE_LABELS[nutrition.source]
  const confidenceLabel = `${nutrition.confidence_score}% confidence`
  const updatedDate = formatDate(nutrition.created_at)
  const lastUpdatedLabel = updatedDate ? `Last updated ${updatedDate}` : null
  const qualityWarnings = getNutritionQualityWarnings(nutrition)

  if (nutrition.confidence_score < 70) {
    return {
      level: 'low',
      label: 'Low-confidence estimate',
      sourceLabel,
      confidenceLabel,
      lastUpdatedLabel,
      caution: 'Do not dose from this value without verifying it.',
      qualityWarnings,
    }
  }

  if (nutrition.source === 'official') {
    return {
      level: 'verified',
      label: 'Official nutrition',
      sourceLabel,
      confidenceLabel,
      lastUpdatedLabel,
      caution: qualityWarnings.length > 0 ? 'Some values look unusual for a single serving. Verify serving size before using them.' : null,
      qualityWarnings,
    }
  }

  return {
    level: 'estimated',
    label: 'Estimated nutrition',
    sourceLabel,
    confidenceLabel,
    lastUpdatedLabel,
    caution: qualityWarnings.length > 0
      ? 'Some estimated values look unusual. Verify carbs and serving size before dosing.'
      : 'Verify carbs before dosing.',
    qualityWarnings,
  }
}

export function getNutritionQualityWarnings(nutrition: NutritionalData): string[] {
  const warnings: string[] = []

  if ((nutrition.protein ?? 0) >= 120) {
    warnings.push('Protein looks unusually high for a single menu item.')
  }

  if ((nutrition.calories ?? 0) >= 2000) {
    warnings.push('Calories look unusually high for a single menu item.')
  }

  if ((nutrition.sodium ?? 0) >= 3000) {
    warnings.push('Sodium looks unusually high for a single menu item.')
  }

  if (
    nutrition.confidence_score < 70 &&
    nutrition.carbs === 0 &&
    (nutrition.calories ?? 0) >= 300
  ) {
    warnings.push('Zero-carb estimate is low-confidence for a substantial item.')
  }

  return warnings
}

export function buildNutritionReportMailto(item: MenuItemWithNutrition, pageUrl?: string): string {
  const displayName = getMenuItemDisplayName(item)
  const subject = `Nutrition report: ${displayName}`
  const lines = [
    `Item: ${displayName}`,
    `Restaurant: ${item.restaurant?.name ?? 'Unknown'}`,
    `Park: ${item.restaurant?.park?.name ?? 'Unknown'}`,
    pageUrl ? `Page: ${pageUrl}` : null,
    '',
    'What looks wrong?',
    '',
  ].filter((line): line is string => line != null)

  return `mailto:contact@diabetesguide.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
}
