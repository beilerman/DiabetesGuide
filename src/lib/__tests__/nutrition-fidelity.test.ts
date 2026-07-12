import { describe, expect, it } from 'vitest'
import {
  agreementTolerance,
  areIndependentEvidence,
  assessCertification,
  hasCompleteServing,
  isActiveDosingGrade,
  shouldReplaceCertification,
} from '../nutrition-fidelity'
import type {
  CertificationCandidate,
  NutritionEvidence,
  ServingBasis,
} from '../nutrition-fidelity'

const NOW = new Date('2026-07-11T16:00:00Z')

function serving(overrides: Partial<ServingBasis> = {}): ServingBasis {
  return {
    quantity: 1,
    unit: 'item',
    description: '1 sandwich as sold',
    ...overrides,
  }
}

function evidence(overrides: Partial<NutritionEvidence> = {}): NutritionEvidence {
  return {
    id: 'evidence-1',
    sourceType: 'official_restaurant',
    upstreamSourceKey: 'restaurant-document-2026',
    carbs: 42,
    serving: serving(),
    exactItemMatch: true,
    exactServingMatch: true,
    ...overrides,
  }
}

function candidate(overrides: Partial<CertificationCandidate> = {}): CertificationCandidate {
  return {
    tier: 'A',
    status: 'approved',
    canonicalCarbs: 42,
    serving: serving(),
    evidence: [evidence()],
    reviewedAt: '2026-07-10T16:00:00Z',
    expiresAt: '2026-10-10T16:00:00Z',
    isMultiServing: false,
    isConfigurable: false,
    hasFixedConfiguration: true,
    ...overrides,
  }
}

describe('serving and agreement rules', () => {
  it('requires quantity, unit, and description for a complete serving', () => {
    expect(hasCompleteServing(serving())).toBe(true)
    expect(hasCompleteServing(serving({ quantity: 0 }))).toBe(false)
    expect(hasCompleteServing(serving({ unit: '  ' }))).toBe(false)
    expect(hasCompleteServing(serving({ description: null }))).toBe(false)
  })

  it('uses the greater of 2g or 10% of the higher carb value', () => {
    expect(agreementTolerance(10, 12)).toBe(2)
    expect(agreementTolerance(80, 90)).toBe(9)
  })

  it('requires different explicit upstream source keys for independence', () => {
    const first = evidence({ id: 'one', upstreamSourceKey: 'document-a' })
    const second = evidence({ id: 'two', upstreamSourceKey: 'document-b' })

    expect(areIndependentEvidence(first, second)).toBe(true)
    expect(areIndependentEvidence(first, { ...second, upstreamSourceKey: 'document-a' })).toBe(false)
    expect(areIndependentEvidence(first, { ...second, upstreamSourceKey: null })).toBe(false)
  })
})

describe('certification policy', () => {
  it('accepts exact official Tier A evidence with a complete serving', () => {
    expect(assessCertification(candidate(), NOW)).toEqual({
      eligible: true,
      dosingGrade: true,
      reasons: [],
    })
  })

  it('requires Tier A canonical carbs to equal the rounded official observation', () => {
    expect(assessCertification(candidate({
      canonicalCarbs: 42,
      evidence: [evidence({ carbs: 44 })],
    }), NOW)).toMatchObject({ eligible: false, dosingGrade: false })
  })

  it('requires two independent agreeing observations for Tier B', () => {
    const second = evidence({
      id: 'evidence-2',
      sourceType: 'third_party_database',
      upstreamSourceKey: 'independent-database-record',
      carbs: 44,
    })

    expect(assessCertification(candidate({ tier: 'B', evidence: [evidence(), second] }), NOW).dosingGrade)
      .toBe(true)

    const dependent = { ...second, upstreamSourceKey: 'restaurant-document-2026' }
    expect(assessCertification(candidate({ tier: 'B', evidence: [evidence(), dependent] }), NOW))
      .toMatchObject({ eligible: false, dosingGrade: false })

    const disagreeing = { ...second, carbs: 55 }
    expect(assessCertification(candidate({ tier: 'B', evidence: [evidence(), disagreeing] }), NOW))
      .toMatchObject({ eligible: false, dosingGrade: false })
  })

  it('never treats Tier C or D as dosing-grade', () => {
    expect(assessCertification(candidate({ tier: 'C' }), NOW).dosingGrade).toBe(false)
    expect(assessCertification(candidate({ tier: 'D' }), NOW).dosingGrade).toBe(false)
  })

  it('blocks ambiguous multi-serving and configurable items', () => {
    expect(assessCertification(candidate({ isMultiServing: true, hasFixedConfiguration: false }), NOW))
      .toMatchObject({ eligible: false, dosingGrade: false })
    expect(assessCertification(candidate({ isConfigurable: true, hasFixedConfiguration: false }), NOW))
      .toMatchObject({ eligible: false, dosingGrade: false })
  })

  it('does not certify plausible AI evidence', () => {
    const ai = evidence({ sourceType: 'ai_estimate' })
    expect(assessCertification(candidate({ evidence: [ai] }), NOW))
      .toMatchObject({ eligible: false, dosingGrade: false })
  })

  it('does not activate expired, quarantined, or rejected decisions', () => {
    expect(isActiveDosingGrade(candidate({ expiresAt: '2026-07-11T15:59:59Z' }), NOW)).toBe(false)
    expect(isActiveDosingGrade(candidate({ status: 'quarantined' }), NOW)).toBe(false)
    expect(isActiveDosingGrade(candidate({ status: 'rejected' }), NOW)).toBe(false)
  })

  it('never replaces a stronger or newer active certification with weaker evidence', () => {
    const current = candidate({ tier: 'A', reviewedAt: '2026-07-10T16:00:00Z' })
    const weaker = candidate({ tier: 'B', reviewedAt: '2026-07-11T15:00:00Z' })
    const older = candidate({ tier: 'A', reviewedAt: '2026-07-09T16:00:00Z' })
    const newer = candidate({ tier: 'A', reviewedAt: '2026-07-11T15:00:00Z' })

    expect(shouldReplaceCertification(current, weaker, NOW)).toBe(false)
    expect(shouldReplaceCertification(current, older, NOW)).toBe(false)
    expect(shouldReplaceCertification(current, newer, NOW)).toBe(true)
  })
})
