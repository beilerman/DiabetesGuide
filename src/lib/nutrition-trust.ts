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
    }
  }

  const sourceLabel = SOURCE_LABELS[nutrition.source]
  const confidenceLabel = `${nutrition.confidence_score}% confidence`
  const updatedDate = formatDate(nutrition.created_at)
  const lastUpdatedLabel = updatedDate ? `Last updated ${updatedDate}` : null

  if (nutrition.confidence_score < 70) {
    return {
      level: 'low',
      label: 'Low-confidence estimate',
      sourceLabel,
      confidenceLabel,
      lastUpdatedLabel,
      caution: 'Do not dose from this value without verifying it.',
    }
  }

  if (nutrition.source === 'official') {
    return {
      level: 'verified',
      label: 'Official nutrition',
      sourceLabel,
      confidenceLabel,
      lastUpdatedLabel,
      caution: null,
    }
  }

  return {
    level: 'estimated',
    label: 'Estimated nutrition',
    sourceLabel,
    confidenceLabel,
    lastUpdatedLabel,
    caution: 'Verify carbs before dosing.',
  }
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
