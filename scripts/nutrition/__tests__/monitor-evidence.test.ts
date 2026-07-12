import { describe, expect, it } from 'vitest'
import {
  buildExpiryQueue,
  evidenceBlastRadius,
  evaluateEvidenceCheck,
} from '../monitor-evidence.js'
import type { EvidenceMonitorTarget, EvidenceObservation } from '../monitor-evidence.js'

function target(overrides: Partial<EvidenceMonitorTarget> = {}): EvidenceMonitorTarget {
  return {
    id: 'source-1',
    menuItemId: 'item-1',
    sourceUrl: 'https://restaurant.example/nutrition',
    contentHash: 'hash-one',
    upstreamSourceKey: 'official-guide',
    reportedItemName: 'Official Sandwich',
    servingDescription: '1 sandwich as sold',
    ...overrides,
  }
}

function observation(overrides: Partial<EvidenceObservation> = {}): EvidenceObservation {
  return {
    ok: true,
    httpStatus: 200,
    resolvedUrl: 'https://restaurant.example/nutrition',
    contentHash: 'hash-one',
    reportedItemName: 'Official Sandwich',
    servingDescription: '1 sandwich as sold',
    ...overrides,
  }
}

describe('evidence monitoring', () => {
  it('recognizes unchanged retrievals', () => {
    expect(evaluateEvidenceCheck(target(), observation())).toMatchObject({
      status: 'unchanged',
      reviewRequired: false,
      reasons: [],
    })
  })

  it('flags changed content, item identity, and serving basis', () => {
    const result = evaluateEvidenceCheck(target(), observation({
      contentHash: 'hash-two',
      reportedItemName: 'Renamed Sandwich',
      servingDescription: '2 sandwiches',
    }))

    expect(result.status).toBe('changed')
    expect(result.reviewRequired).toBe(true)
    expect(result.reasons).toEqual(expect.arrayContaining([
      'source content hash changed',
      'source item identity changed',
      'source serving basis changed',
    ]))
  })

  it('records unavailable and redirected sources without rewriting evidence', () => {
    expect(evaluateEvidenceCheck(target(), observation({ ok: false, httpStatus: 503 }))).toMatchObject({
      status: 'unavailable',
      reviewRequired: true,
    })
    expect(evaluateEvidenceCheck(target(), observation({
      resolvedUrl: 'https://restaurant.example/new-nutrition',
    }))).toMatchObject({
      status: 'redirected',
      reviewRequired: true,
    })
  })

  it('finds every menu item affected by a shared upstream source', () => {
    const targets = [
      target(),
      target({ id: 'source-2', menuItemId: 'item-2' }),
      target({ id: 'source-3', menuItemId: 'item-3', upstreamSourceKey: 'other-guide' }),
    ]

    expect(evidenceBlastRadius(targets, 'source-1')).toEqual(['item-1', 'item-2'])
  })

  it('queues monthly high-impact samples and upcoming quarterly expirations', () => {
    const queue = buildExpiryQueue([
      { certificationId: 'high', menuItemId: 'item-high', expiresAt: '2026-07-20T00:00:00Z', priority: 20 },
      { certificationId: 'sample', menuItemId: 'item-sample', expiresAt: '2026-10-01T00:00:00Z', priority: 15 },
      { certificationId: 'later', menuItemId: 'item-later', expiresAt: '2026-10-01T00:00:00Z', priority: 2 },
    ], new Date('2026-07-11T00:00:00Z'))

    expect(queue[0]).toMatchObject({ certificationId: 'high', reason: 'expires_within_30_days' })
    expect(queue).toContainEqual(expect.objectContaining({ certificationId: 'sample', reason: 'monthly_high_impact_sample' }))
  })
})
