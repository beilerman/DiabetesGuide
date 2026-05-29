import type { NutritionalData } from './types'

/**
 * Surfacing nutrition data quality for users making dosing-adjacent decisions.
 *
 * Confidence in this database varies by an order of magnitude per item — from
 * Disney/chain published values (high) to AI-generated guesses (low). The UI
 * needs to make that variance visible so a person reading the carb count knows
 * how much to trust it.
 *
 * Three signals are combined into a small badge on the meal card:
 *   1. source     — published vs USDA-estimated vs AI-estimated
 *   2. freshness  — how long since the row was updated_at
 *   3. uncertainty — a ±g band on macros, derived from source + confidence
 */

export type SourceTier = 'official' | 'usda' | 'ai' | 'unknown'
export type FreshnessTier = 'fresh' | 'stale' | 'very-stale' | 'unknown'
export type ConfidenceTier = 'high' | 'medium' | 'low' | 'unknown'

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000
const TWENTY_FOUR_MONTHS_MS = 2 * 365 * 24 * 60 * 60 * 1000

export interface ConfidenceSummary {
  source: SourceTier
  sourceLabel: string
  freshness: FreshnessTier
  freshnessLabel: string | null
  confidence: ConfidenceTier
  confidenceScore: number | null
  /** ±g band on carbs and other macros, or null when no estimate is appropriate. */
  uncertaintyG: number | null
  /** True when the source/freshness combination is risky for dosing decisions. */
  warnForDosing: boolean
}

function classifySource(s: NutritionalData['source'] | string | null | undefined): {
  tier: SourceTier
  label: string
} {
  switch (s) {
    case 'official':
      return { tier: 'official', label: 'Published' }
    case 'api_lookup':
      return { tier: 'usda', label: 'USDA estimate' }
    case 'crowdsourced':
      return { tier: 'ai', label: 'AI estimate' }
    default:
      return { tier: 'unknown', label: 'Unknown source' }
  }
}

function classifyFreshness(updatedAt: string | null | undefined, now = Date.now()): {
  tier: FreshnessTier
  label: string | null
} {
  if (!updatedAt) return { tier: 'unknown', label: 'Never verified' }
  const ts = Date.parse(updatedAt)
  if (isNaN(ts)) return { tier: 'unknown', label: 'Never verified' }
  const age = now - ts
  if (age >= TWENTY_FOUR_MONTHS_MS) return { tier: 'very-stale', label: 'Last updated > 2 years ago' }
  if (age >= TWELVE_MONTHS_MS) return { tier: 'stale', label: 'Last updated > 12 months ago' }
  return { tier: 'fresh', label: null }
}

/**
 * Confidence-score policy cutoffs. The `scripts/lib/confidence-thresholds.ts`
 * mirror is the canonical source for the `scripts/` side; update both together.
 */
export const HIGH_CONFIDENCE = 80
export const MEDIUM_CONFIDENCE = 50

function classifyConfidence(score: number | null | undefined): ConfidenceTier {
  if (score == null) return 'unknown'
  if (score >= HIGH_CONFIDENCE) return 'high'
  if (score >= MEDIUM_CONFIDENCE) return 'medium'
  return 'low'
}

/**
 * Combined uncertainty band (±g) on macros given source and confidence.
 * Returns null when there is no meaningful estimate (empty nutrition shell).
 */
function uncertaintyForCarbs(source: SourceTier, confidence: ConfidenceTier): number | null {
  if (source === 'unknown' && confidence === 'unknown') return null
  // Floor by source — confidence can tighten or loosen within the source's range.
  if (source === 'official') {
    if (confidence === 'high') return 5
    if (confidence === 'medium') return 8
    return 10
  }
  if (source === 'usda') {
    if (confidence === 'high') return 8
    if (confidence === 'medium') return 12
    return 15
  }
  if (source === 'ai') {
    if (confidence === 'high') return 12
    if (confidence === 'medium') return 18
    return 25
  }
  return 20
}

export function summarizeConfidence(
  nd: Pick<NutritionalData, 'source' | 'confidence_score' | 'updated_at'> | null | undefined,
  now = Date.now(),
): ConfidenceSummary {
  if (!nd) {
    return {
      source: 'unknown',
      sourceLabel: 'No nutrition data',
      freshness: 'unknown',
      freshnessLabel: null,
      confidence: 'unknown',
      confidenceScore: null,
      uncertaintyG: null,
      warnForDosing: true,
    }
  }
  const src = classifySource(nd.source)
  const fr = classifyFreshness(nd.updated_at, now)
  const conf = classifyConfidence(nd.confidence_score)
  const uncertainty = uncertaintyForCarbs(src.tier, conf)
  const warnForDosing =
    src.tier === 'ai' ||
    src.tier === 'unknown' ||
    fr.tier === 'stale' ||
    fr.tier === 'very-stale' ||
    fr.tier === 'unknown' ||
    conf === 'low' ||
    conf === 'unknown'
  return {
    source: src.tier,
    sourceLabel: src.label,
    freshness: fr.tier,
    freshnessLabel: fr.label,
    confidence: conf,
    confidenceScore: nd.confidence_score ?? null,
    uncertaintyG: uncertainty,
    warnForDosing,
  }
}
