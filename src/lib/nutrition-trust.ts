import type { MenuItemWithNutrition, NutritionalData } from './types'
import { getMenuItemDisplayName } from './display'
import { assessCertification } from './nutrition-fidelity'
import type { CertificationCandidate, NutritionEvidence } from './nutrition-fidelity'

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

export const NUTRITION_CERTIFICATION_TRUST_ENABLED =
  import.meta.env.VITE_NUTRITION_CERTIFICATION_TRUST === 'true'

export interface NutritionTrustOptions {
  certificationRequired?: boolean
  now?: Date
}

function certificationCandidate(nutrition: NutritionalData): CertificationCandidate | null {
  const certification = nutrition.active_certification
  if (!certification || certification.id !== nutrition.active_certification_id) return null

  const evidence = certification.nutrition_certification_evidence.flatMap((link): NutritionEvidence[] => {
    const source = link.nutrition_source
    if (!source) return []
    return [{
      id: source.id,
      sourceType: source.source_type,
      upstreamSourceKey: source.upstream_source_key,
      carbs: source.normalized_carbs ?? source.reported_carbs,
      serving: {
        quantity: source.serving_quantity,
        unit: source.serving_unit,
        description: source.serving_description,
      },
      exactItemMatch: source.exact_item_match,
      exactServingMatch: source.exact_serving_match,
    }]
  })

  return {
    tier: certification.tier,
    status: certification.status,
    canonicalCarbs: certification.canonical_carbs,
    serving: {
      quantity: certification.serving_quantity,
      unit: certification.serving_unit,
      description: certification.serving_description,
    },
    evidence,
    reviewedAt: certification.reviewed_at,
    expiresAt: certification.expires_at,
    isMultiServing: false,
    isConfigurable: false,
    hasFixedConfiguration: true,
  }
}

export function getActiveCertificationTier(
  nutrition: NutritionalData | null | undefined,
): CertificationCandidate['tier'] | null {
  if (!nutrition) return null
  return certificationCandidate(nutrition)?.tier ?? null
}

export function isNutritionDosingGrade(
  nutrition: NutritionalData | null | undefined,
  options: NutritionTrustOptions = {},
): boolean {
  if (!nutrition || nutrition.carbs == null) return false
  const certificationRequired = options.certificationRequired ?? NUTRITION_CERTIFICATION_TRUST_ENABLED
  if (!certificationRequired) return nutrition.confidence_score >= 70

  const candidate = certificationCandidate(nutrition)
  if (!candidate) return false
  const canonicalMatches = nutrition.carbs === candidate.canonicalCarbs
    && nutrition.serving_quantity === candidate.serving.quantity
    && nutrition.serving_unit === candidate.serving.unit
    && nutrition.serving_description === candidate.serving.description
  return canonicalMatches && assessCertification(candidate, options.now ?? new Date()).dosingGrade
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

export function getNutritionTrust(
  nutrition: NutritionalData | null | undefined,
  options: NutritionTrustOptions = {},
): NutritionTrustSummary {
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
  const certificationRequired = options.certificationRequired ?? NUTRITION_CERTIFICATION_TRUST_ENABLED

  if (certificationRequired) {
    const candidate = certificationCandidate(nutrition)
    if (candidate && isNutritionDosingGrade(nutrition, options)) {
      return {
        level: 'verified',
        label: `Certified nutrition · Tier ${candidate.tier}`,
        sourceLabel,
        confidenceLabel,
        lastUpdatedLabel,
        caution: qualityWarnings.length > 0
          ? 'Some values look unusual for the certified serving. Verify the restaurant preparation.'
          : null,
        qualityWarnings,
      }
    }

    return {
      level: 'low',
      label: 'Uncertified carb estimate',
      sourceLabel,
      confidenceLabel,
      lastUpdatedLabel,
      caution: 'Do not dose from this value without verifying it.',
      qualityWarnings,
    }
  }

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

/**
 * Plain-language estimate tier for glanceable surfaces (cards, search rows,
 * meal list). Replaces the pseudo-precise "X% confidence" reading — that score
 * is an internal provenance code (official import vs USDA vs AI vs keyword),
 * not a calibrated probability a layperson can act on. The raw number stays on
 * the item-detail Data Source panel and the methodology page for transparency.
 */
export function getEstimateTierShort(confidenceScore: number): string {
  if (confidenceScore < 50) return 'Rough estimate'
  if (confidenceScore < 70) return 'Estimated'
  return 'Verified'
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
