import { describe, expect, it } from 'vitest'
import { calculateFidelityReport } from '../fidelity.js'
import type { FidelityItem } from '../fidelity.js'

const NOW = new Date('2026-07-11T16:00:00Z')

function item(overrides: Partial<FidelityItem> = {}): FidelityItem {
  return {
    id: 'item-1',
    name: 'Official Sandwich',
    category: 'entree',
    parkLocation: 'Walt Disney World',
    carbs: 42,
    serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
    certification: {
      id: 'cert-1',
      tier: 'A',
      status: 'approved',
      canonicalCarbs: 42,
      serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
      reviewedAt: '2026-07-10T16:00:00Z',
      expiresAt: '2026-10-10T16:00:00Z',
      evidence: [{
        id: 'evidence-1',
        sourceType: 'official_restaurant',
        upstreamSourceKey: 'official-document',
        carbs: 42,
        serving: { quantity: 1, unit: 'item', description: '1 sandwich as sold' },
        exactItemMatch: true,
        exactServingMatch: true,
        retrievable: true,
      }],
    },
    isMultiServing: false,
    isConfigurable: false,
    hasFixedConfiguration: true,
    ...overrides,
  }
}

describe('calculateFidelityReport', () => {
  it('counts complete Tier A and independent Tier B rows as dosing-grade', () => {
    const tierB = item({
      id: 'item-2',
      certification: {
        ...item().certification!,
        id: 'cert-2',
        tier: 'B',
        evidence: [
          item().certification!.evidence[0]!,
          {
            ...item().certification!.evidence[0]!,
            id: 'evidence-2',
            sourceType: 'third_party_database',
            upstreamSourceKey: 'independent-record',
            carbs: 44,
          },
        ],
      },
    })

    const report = calculateFidelityReport([item(), tierB], NOW)

    expect(report.metrics.dosingGradeCount).toBe(2)
    expect(report.metrics.tiers).toMatchObject({ A: 1, B: 1 })
    expect(report.findings).toEqual([])
  })

  it('flags dependent Tier B, missing serving, and expired approval', () => {
    const dependent = item({
      id: 'dependent',
      certification: {
        ...item().certification!,
        tier: 'B',
        evidence: [
          item().certification!.evidence[0]!,
          { ...item().certification!.evidence[0]!, id: 'copy' },
        ],
      },
    })
    const missingServing = item({
      id: 'missing-serving',
      serving: { quantity: null, unit: null, description: null },
    })
    const expired = item({
      id: 'expired',
      certification: {
        ...item().certification!,
        expiresAt: '2026-07-11T15:00:00Z',
      },
    })

    const report = calculateFidelityReport([dependent, missingServing, expired], NOW)

    expect(report.metrics.dosingGradeCount).toBe(0)
    expect(report.findings.map(finding => finding.checkName)).toEqual(expect.arrayContaining([
      'invalid_active_certification',
      'canonical_serving_mismatch',
      'expired_certification',
    ]))
  })

  it('tracks unreachable evidence and upcoming expiry without rewriting values', () => {
    const sourceUnavailable = item({
      certification: {
        ...item().certification!,
        expiresAt: '2026-07-25T16:00:00Z',
        evidence: [{ ...item().certification!.evidence[0]!, retrievable: false }],
      },
    })

    const report = calculateFidelityReport([sourceUnavailable], NOW)

    expect(report.metrics.retrievableProvenanceCount).toBe(0)
    expect(report.metrics.upcomingExpiryCount).toBe(1)
    expect(report.findings.map(finding => finding.checkName)).toEqual(expect.arrayContaining([
      'evidence_unavailable',
      'certification_expiring',
    ]))
  })

  it('detects a carb change under the same certification as a regression', () => {
    const changed = item({ carbs: 45 })
    const report = calculateFidelityReport([changed], NOW, {
      'item-1': { certificationId: 'cert-1', carbs: 42 },
    })

    expect(report.metrics.certifiedValueRegressionCount).toBe(1)
    expect(report.findings).toContainEqual(expect.objectContaining({
      checkName: 'certified_value_regression',
      severity: 'HIGH',
    }))
  })

  it('builds a dosing-impact ordered manual review queue', () => {
    const lowPriority = item({
      id: 'low',
      category: 'side',
      parkLocation: 'Other',
      certification: null,
    })
    const highPriority = item({
      id: 'high',
      category: 'dessert',
      parkLocation: 'Disneyland Resort',
      certification: null,
    })

    const report = calculateFidelityReport([lowPriority, highPriority], NOW)

    expect(report.reviewQueue.map(entry => entry.menuItemId)).toEqual(['high', 'low'])
  })
})
