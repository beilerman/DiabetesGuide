import { createHash } from 'node:crypto'
import type { CertificationTier, ServingBasis } from '../../src/lib/nutrition-fidelity.js'
import { hasCompleteServing } from '../../src/lib/nutrition-fidelity.js'

export interface LegacySourceReference {
  id: string
  sourceName: string
  sourceUrl: string
}

export interface LegacyNutritionRecord {
  menuItemId: string
  itemName: string
  source: string | null
  sourceDetail: string | null
  carbs: number | null
  confidence: number | null
  serving: ServingBasis
  exactItemMatch: boolean
  exactServingMatch: boolean
  legacySources: LegacySourceReference[]
}

export interface BackfillEntry {
  menuItemId: string
  itemName: string
  proposedTier: CertificationTier
  status: 'review_required' | 'quarantined'
  autoCertify: false
  canonicalChange: null
  backfillKey: string
  reasons: string[]
}

export interface BackfillPlan {
  schemaVersion: 1
  summary: {
    total: number
    reviewRequired: number
    quarantined: number
    tiers: Record<CertificationTier, number>
    canonicalChangeCount: 0
  }
  entries: BackfillEntry[]
  canonicalChanges: []
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function sourceToken(detail: string | null): string | null {
  return detail?.match(/\bsource:\s*(\S+)/i)?.[1] ?? null
}

function validHttpUrl(value: string | null): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hasValidCitation(record: LegacyNutritionRecord): boolean {
  const token = sourceToken(record.sourceDetail)
  if (validHttpUrl(token)) return true
  return record.legacySources.some(source => validHttpUrl(source.sourceUrl))
}

function isMalformedCitation(record: LegacyNutritionRecord): boolean {
  const token = sourceToken(record.sourceDetail)
  return token != null && !validHttpUrl(token)
}

function classifyTier(record: LegacyNutritionRecord): CertificationTier {
  const detail = record.sourceDetail ?? ''
  if (/triangulat|recipe[- ]?computed|decomposition/i.test(detail)) return 'C'
  if (/\bAI\b|keyword/i.test(detail)) return 'D'
  if (record.source === 'api_lookup' || /USDA|FoodData Central/i.test(detail)) return 'D'
  if (record.source === 'official'
    && record.exactItemMatch
    && record.exactServingMatch
    && hasCompleteServing(record.serving)
    && hasValidCitation(record)) return 'A'
  return 'D'
}

export function classifyLegacyNutrition(record: LegacyNutritionRecord): BackfillEntry {
  const reasons: string[] = []
  const malformed = isMalformedCitation(record)
  const proposedTier = classifyTier(record)

  if (malformed) reasons.push('source citation is malformed')
  if (!hasCompleteServing(record.serving)) reasons.push('serving basis is incomplete')
  if (record.source === 'api_lookup' || /USDA|FoodData Central/i.test(record.sourceDetail ?? '')) {
    reasons.push('generic database match is not item-specific evidence')
  }
  if (record.carbs == null) reasons.push('carbohydrate value is missing')
  if (!record.exactItemMatch) reasons.push('exact item match is not documented')
  if (!record.exactServingMatch) reasons.push('exact serving match is not documented')
  if (!hasValidCitation(record)) reasons.push('no valid source URL is available')

  return {
    menuItemId: record.menuItemId,
    itemName: record.itemName,
    proposedTier,
    status: malformed ? 'quarantined' : 'review_required',
    autoCertify: false,
    canonicalChange: null,
    backfillKey: hash({
      menuItemId: record.menuItemId,
      source: record.source,
      sourceDetail: record.sourceDetail,
      carbs: record.carbs,
      confidence: record.confidence,
      serving: record.serving,
      exactItemMatch: record.exactItemMatch,
      exactServingMatch: record.exactServingMatch,
      legacySourceIds: record.legacySources.map(source => source.id).sort(),
    }),
    reasons: [...new Set(reasons)],
  }
}

export function buildBackfillPlan(records: LegacyNutritionRecord[]): BackfillPlan {
  const entries = records
    .map(classifyLegacyNutrition)
    .sort((first, second) => first.menuItemId.localeCompare(second.menuItemId))
  const tiers: Record<CertificationTier, number> = { A: 0, B: 0, C: 0, D: 0 }
  for (const entry of entries) tiers[entry.proposedTier]++

  return {
    schemaVersion: 1,
    summary: {
      total: entries.length,
      reviewRequired: entries.filter(entry => entry.status === 'review_required').length,
      quarantined: entries.filter(entry => entry.status === 'quarantined').length,
      tiers,
      canonicalChangeCount: 0,
    },
    entries,
    canonicalChanges: [],
  }
}
