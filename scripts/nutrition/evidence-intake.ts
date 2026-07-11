import { createHash } from 'node:crypto'
import type { CertificationTier, EvidenceSourceType, ServingBasis } from '../../src/lib/nutrition-fidelity.js'
import { hasCompleteServing } from '../../src/lib/nutrition-fidelity.js'

export type EvidenceSourceKind =
  | 'official_research'
  | 'manufacturer_research'
  | 'government_database'
  | 'third_party_database'
  | 'ai'
  | 'keyword'
  | 'decomposition'
  | 'recipe'

export type EvidenceMode = 'dry-run' | 'apply-evidence' | 'publish-reviewed'

export interface EvidenceIntakeInput {
  menuItemId: string
  itemName: string
  sourceKind: EvidenceSourceKind
  sourceName: string
  sourceUrl: string | null
  sourceLocator?: string | null
  upstreamSourceKey?: string | null
  carbs: number
  normalizedCarbs?: number | null
  serving: ServingBasis
  exactItemMatch: boolean
  exactServingMatch: boolean
  retrievedAt: string
  publishedAt?: string | null
  contentHash?: string | null
  sizeName?: string | null
  preparationNotes?: string | null
  normalizationFormula?: string | null
  normalizationInputs?: Record<string, unknown> | null
  note?: string | null
  legacyConfidence?: number | null
}

export interface NutritionEvidenceRow {
  menu_item_id: string
  reported_item_name: string
  source_name: string
  source_type: EvidenceSourceType
  source_url: string
  source_locator: string | null
  reported_carbs: number
  serving_quantity: number | null
  serving_unit: string | null
  serving_description: string | null
  size_name: string | null
  preparation_notes: string | null
  published_at: string | null
  retrieved_at: string
  content_hash: string | null
  evidence_key: string
  normalized_carbs: number | null
  normalization_formula: string | null
  normalization_inputs: Record<string, unknown> | null
  upstream_source_key: string
  confidence: number
  notes: string
}

export interface EvidenceCandidate {
  menuItemId: string
  itemName: string
  proposedTier: CertificationTier
  status: 'review_required'
  canAutoCertify: false
  reviewReasons: string[]
  evidenceRow: NutritionEvidenceRow
}

const SOURCE_TYPE: Record<EvidenceSourceKind, EvidenceSourceType> = {
  official_research: 'official_restaurant',
  manufacturer_research: 'manufacturer',
  government_database: 'government_database',
  third_party_database: 'third_party_database',
  ai: 'ai_estimate',
  keyword: 'other',
  decomposition: 'recipe_calculation',
  recipe: 'recipe_calculation',
}

function normalizeUrl(value: string | null): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return value.trim()
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function proposedTier(input: EvidenceIntakeInput, reviewReasons: string[]): CertificationTier {
  if (input.sourceKind === 'decomposition' || input.sourceKind === 'recipe') return 'C'
  if (input.sourceKind !== 'official_research' && input.sourceKind !== 'manufacturer_research') return 'D'

  const exact = input.exactItemMatch && input.exactServingMatch
  if (exact && hasCompleteServing(input.serving) && normalizeUrl(input.sourceUrl)) return 'A'
  if (!hasCompleteServing(input.serving)) reviewReasons.push('serving basis is incomplete')
  if (!input.exactItemMatch) reviewReasons.push('source item is not an exact match')
  if (!input.exactServingMatch) reviewReasons.push('source serving is not an exact match')
  if (!normalizeUrl(input.sourceUrl)) reviewReasons.push('source URL is missing')
  return 'D'
}

function confidenceFor(tier: CertificationTier, requested: number | null | undefined): number {
  if (requested != null && Number.isFinite(requested)) {
    return Math.max(0, Math.min(100, Math.round(requested)))
  }
  if (tier === 'A') return 90
  if (tier === 'C') return 60
  return 30
}

export function buildEvidenceCandidate(input: EvidenceIntakeInput): EvidenceCandidate {
  const reviewReasons: string[] = []
  const tier = proposedTier(input, reviewReasons)
  const normalizedSourceUrl = normalizeUrl(input.sourceUrl)
  const upstreamSourceKey = input.upstreamSourceKey?.trim()
    || `source:${hash(normalizedSourceUrl ?? input.sourceName)}`

  const identity = {
    menuItemId: input.menuItemId,
    sourceUrl: normalizedSourceUrl,
    sourceName: input.sourceName.trim(),
    sourceLocator: input.sourceLocator ?? null,
    carbs: input.carbs,
    normalizedCarbs: input.normalizedCarbs ?? null,
    serving: input.serving,
    sizeName: input.sizeName ?? null,
    preparationNotes: input.preparationNotes ?? null,
    publishedAt: input.publishedAt ?? null,
    contentHash: input.contentHash ?? null,
    normalizationFormula: input.normalizationFormula ?? null,
    normalizationInputs: input.normalizationInputs ?? null,
  }

  return {
    menuItemId: input.menuItemId,
    itemName: input.itemName,
    proposedTier: tier,
    status: 'review_required',
    canAutoCertify: false,
    reviewReasons,
    evidenceRow: {
      menu_item_id: input.menuItemId,
      reported_item_name: input.itemName,
      source_name: input.sourceName.trim(),
      source_type: SOURCE_TYPE[input.sourceKind],
      source_url: input.sourceUrl?.trim() ?? '',
      source_locator: input.sourceLocator ?? null,
      reported_carbs: input.carbs,
      serving_quantity: input.serving.quantity,
      serving_unit: input.serving.unit,
      serving_description: input.serving.description,
      size_name: input.sizeName ?? null,
      preparation_notes: input.preparationNotes ?? null,
      published_at: input.publishedAt ?? null,
      retrieved_at: input.retrievedAt,
      content_hash: input.contentHash ?? null,
      evidence_key: hash(identity),
      normalized_carbs: input.normalizedCarbs ?? null,
      normalization_formula: input.normalizationFormula ?? null,
      normalization_inputs: input.normalizationInputs ?? null,
      upstream_source_key: upstreamSourceKey,
      confidence: confidenceFor(tier, input.legacyConfidence),
      notes: input.note?.trim() ?? '',
    },
  }
}

export function buildReviewArtifact(candidates: EvidenceCandidate[], batchId: string) {
  return {
    schemaVersion: 1,
    batchId,
    candidates: [...candidates].sort((first, second) =>
      first.menuItemId.localeCompare(second.menuItemId)
      || first.evidenceRow.evidence_key.localeCompare(second.evidenceRow.evidence_key),
    ),
  }
}

export function parseEvidenceMode(args: string[]): EvidenceMode {
  const applyEvidence = args.includes('--apply-evidence')
  const publishReviewed = args.includes('--publish-reviewed')
  if (applyEvidence && publishReviewed) {
    throw new Error('Select only one write mode: --apply-evidence or --publish-reviewed')
  }
  if (applyEvidence) return 'apply-evidence'
  if (publishReviewed) return 'publish-reviewed'
  return 'dry-run'
}
