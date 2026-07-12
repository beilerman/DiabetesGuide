import { describe, expect, it } from 'vitest'
import {
  buildEvidenceCandidate,
  buildReviewArtifact,
  parseEvidenceMode,
} from '../evidence-intake.js'
import type { EvidenceIntakeInput } from '../evidence-intake.js'

function input(overrides: Partial<EvidenceIntakeInput> = {}): EvidenceIntakeInput {
  return {
    menuItemId: 'item-1',
    itemName: 'Official Sandwich',
    sourceKind: 'official_research',
    sourceName: 'Restaurant nutrition guide',
    sourceUrl: 'https://restaurant.example/nutrition?campaign=summer',
    upstreamSourceKey: 'restaurant-guide-2026',
    carbs: 42,
    serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
    exactItemMatch: true,
    exactServingMatch: true,
    retrievedAt: '2026-07-11T16:00:00Z',
    ...overrides,
  }
}

describe('evidence intake', () => {
  it('creates a review candidate rather than an automatic certification', () => {
    expect(buildEvidenceCandidate(input())).toMatchObject({
      proposedTier: 'A',
      status: 'review_required',
      canAutoCertify: false,
      reviewReasons: [],
      evidenceRow: {
        exact_item_match: true,
        exact_serving_match: true,
      },
    })
  })

  it('retains original and normalized carbohydrate values', () => {
    const result = buildEvidenceCandidate(input({
      carbs: 30,
      normalizedCarbs: 45,
      normalizationFormula: '30 * 1.5',
      normalizationInputs: { portionMultiplier: 1.5 },
    }))

    expect(result.evidenceRow).toMatchObject({
      reported_carbs: 30,
      normalized_carbs: 45,
      normalization_formula: '30 * 1.5',
      normalization_inputs: { portionMultiplier: 1.5 },
    })
  })

  it('preserves the item name exactly as the source reported it', () => {
    const result = buildEvidenceCandidate(input({
      itemName: 'Catalog Sandwich',
      reportedItemName: 'Official Sandwich — Full Size',
    }))

    expect(result.itemName).toBe('Catalog Sandwich')
    expect(result.evidenceRow.reported_item_name).toBe('Official Sandwich — Full Size')
  })

  it('routes incomplete serving evidence to review with no Tier A proposal', () => {
    const result = buildEvidenceCandidate(input({
      serving: { quantity: null, unit: null, description: null },
      exactServingMatch: false,
    }))

    expect(result.proposedTier).toBe('D')
    expect(result.reviewReasons).toContain('serving basis is incomplete')
  })

  it('caps AI, keyword, and decomposition evidence below dosing-grade tiers', () => {
    expect(buildEvidenceCandidate(input({ sourceKind: 'ai' })).proposedTier).toBe('D')
    expect(buildEvidenceCandidate(input({ sourceKind: 'keyword' })).proposedTier).toBe('D')
    expect(buildEvidenceCandidate(input({ sourceKind: 'decomposition' })).proposedTier).toBe('C')
    expect(buildEvidenceCandidate(input({ sourceKind: 'recipe' })).proposedTier).toBe('C')
  })

  it('derives the same upstream key and evidence key for equivalent URLs', () => {
    const first = buildEvidenceCandidate(input({ upstreamSourceKey: null }))
    const second = buildEvidenceCandidate(input({
      upstreamSourceKey: null,
      sourceUrl: 'https://restaurant.example/nutrition',
    }))

    expect(first.evidenceRow.upstream_source_key).toBe(second.evidenceRow.upstream_source_key)
    expect(first.evidenceRow.evidence_key).toBe(second.evidenceRow.evidence_key)
  })

  it('builds deterministic review artifacts', () => {
    const one = buildEvidenceCandidate(input({ menuItemId: 'item-b' }))
    const two = buildEvidenceCandidate(input({ menuItemId: 'item-a' }))

    expect(buildReviewArtifact([one, two], 'batch-1')).toEqual(
      buildReviewArtifact([two, one], 'batch-1'),
    )
  })

  it('is dry-run by default and requires explicit evidence or reviewed apply flags', () => {
    expect(parseEvidenceMode([])).toBe('dry-run')
    expect(parseEvidenceMode(['--apply-evidence'])).toBe('apply-evidence')
    expect(parseEvidenceMode(['--publish-reviewed'])).toBe('publish-reviewed')
    expect(() => parseEvidenceMode(['--apply-evidence', '--publish-reviewed'])).toThrow(/one write mode/i)
  })
})
