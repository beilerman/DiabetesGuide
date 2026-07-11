import { describe, expect, it } from 'vitest'
import { validateReviewedDecision } from '../reviewed-certifications.js'
import type { ReviewedCertificationDecision } from '../reviewed-certifications.js'
import type { CertificationCandidate } from '../../../src/lib/nutrition-fidelity.js'

const NOW = new Date('2026-07-11T16:00:00Z')

function decision(overrides: Partial<ReviewedCertificationDecision> = {}): ReviewedCertificationDecision {
  return {
    menuItemId: 'item-1',
    tier: 'A',
    canonicalCarbs: 42,
    serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
    reviewerId: 'reviewer-internal-1',
    reason: 'Exact restaurant nutrition guide and serving.',
    reviewedAt: '2026-07-11T15:00:00Z',
    expiresAt: '2026-10-09T15:00:00Z',
    evidenceKeys: ['evidence-key-1'],
    expectedActiveCertificationId: null,
    ...overrides,
  }
}

function candidate(overrides: Partial<CertificationCandidate> = {}): CertificationCandidate {
  return {
    tier: 'A',
    status: 'approved',
    canonicalCarbs: 42,
    serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
    reviewedAt: '2026-07-11T15:00:00Z',
    expiresAt: '2026-10-09T15:00:00Z',
    evidence: [{
      id: 'source-1',
      sourceType: 'official_restaurant',
      upstreamSourceKey: 'official-guide',
      carbs: 42,
      serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
      exactItemMatch: true,
      exactServingMatch: true,
    }],
    isMultiServing: false,
    isConfigurable: false,
    hasFixedConfiguration: true,
    ...overrides,
  }
}

describe('reviewed certification publication', () => {
  it('accepts a complete Tier A decision', () => {
    expect(validateReviewedDecision(decision(), candidate(), null, NOW)).toEqual([])
  })

  it('rejects policy-invalid evidence even when a reviewer selected Tier A', () => {
    const invalid = candidate({
      evidence: [{ ...candidate().evidence[0]!, sourceType: 'ai_estimate' }],
    })
    expect(validateReviewedDecision(decision(), invalid, null, NOW)).toContain(
      'no exact restaurant or manufacturer evidence is linked',
    )
  })

  it('blocks a Tier B downgrade from an active Tier A certification', () => {
    const current = candidate({ reviewedAt: '2026-07-10T15:00:00Z' })
    const proposed = candidate({
      tier: 'B',
      evidence: [
        candidate().evidence[0]!,
        { ...candidate().evidence[0]!, id: 'source-2', upstreamSourceKey: 'second-guide' },
      ],
    })
    expect(validateReviewedDecision(decision({ tier: 'B' }), proposed, current, NOW)).toContain(
      'decision would downgrade the active certification',
    )
  })

  it('requires review expiry within 180 days', () => {
    const tooLong = decision({ expiresAt: '2027-07-11T15:00:00Z' })
    expect(validateReviewedDecision(tooLong, candidate({ expiresAt: tooLong.expiresAt }), null, NOW)).toContain(
      'certification expiry exceeds 180 days',
    )
  })
})
