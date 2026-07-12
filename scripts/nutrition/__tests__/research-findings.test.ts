import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildResearchBatch,
  runResearchFindingsCli,
  type ResearchFindings,
} from '../research-findings.js'
import { stableResearchJson } from '../research-contract.js'
import type { ResearchQueue, ResearchQueueItem } from '../research-queue.js'
import type { ResolvedSource } from '../research-source-policy.js'

function queueItem(id: string, overrides: Partial<ResearchQueueItem> = {}): ResearchQueueItem {
  return {
    menuItemId: id,
    itemName: `Catalog ${id}`,
    description: null,
    category: 'entree',
    restaurantName: 'Magic Kingdom Cart',
    parkName: 'Magic Kingdom',
    parkLocation: 'Walt Disney World Resort',
    servingQuantity: null,
    servingUnit: null,
    servingDescription: null,
    nutritionDataId: `nutrition-${id}`,
    currentCarbs: 50,
    confidence: 40,
    activeCertificationId: null,
    priority: 2_001_000,
    catalogSnapshotHash: 'a'.repeat(64),
    ...overrides,
  }
}

function queue(items: ResearchQueueItem[]): ResearchQueue {
  return {
    schemaVersion: 1,
    batchId: 'wdw-20260712T120000Z-a1b2c3d4',
    scope: 'wdw',
    catalogSnapshotAt: '2026-07-12T12:00:00.000Z',
    items,
  }
}

function found(menuItemId: string, overrides: Record<string, unknown> = {}) {
  return {
    status: 'found',
    menuItemId,
    sourceKind: 'official_research',
    sourceOwner: 'Disney',
    ownerId: 'disney',
    sourceOwnerType: 'destination',
    manufacturerRelationship: null,
    sourceUrl: 'https://disneyworld.disney.go.com/menu',
    sourceLocator: 'nutrition row 2',
    sourceReportedItemName: `Official ${menuItemId}`,
    reportedCarbs: 55,
    serving: { quantity: 1, unit: 'item', description: '1 item as sold' },
    exactItemMatch: true,
    exactServingMatch: true,
    publishedAt: null,
    upstreamSourceKey: `disney-menu-${menuItemId}`,
    sourceExcerpt: 'Total Carbohydrate 55 g',
    ...overrides,
  }
}

const resolved: ResolvedSource = {
  valid: true,
  reviewRequired: false,
  finalUrl: 'https://disneyworld.disney.go.com/menu',
  retrievedAt: '2026-07-12T12:05:00.000Z',
  contentHash: 'f'.repeat(64),
  etag: 'menu-v1',
  lastModified: null,
  status: 200,
}

function dependencies(result: ResolvedSource = resolved) {
  return {
    resolveSource: async () => result,
    now: () => '2026-07-12T12:10:00.000Z',
  }
}

describe('buildResearchBatch', () => {
  it('turns exact official findings into evidence candidates', async () => {
    const result = await buildResearchBatch(queue([queueItem('item-1')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [found('item-1')],
    } as ResearchFindings, dependencies())

    expect(result).toMatchObject({ shouldOpenPullRequest: true, blocksAutoMerge: false })
    expect(result.batch.outcomes[0]).toMatchObject({
      status: 'accepted',
      menuItemId: 'item-1',
      itemName: 'Catalog item-1',
      catalogSnapshotHash: 'a'.repeat(64),
      sourceReportedItemName: 'Official item-1',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      sourceUrl: resolved.finalUrl,
      contentHash: resolved.contentHash,
      reportedCarbs: 55,
      reviewReasons: [],
    })
    expect((result.batch.outcomes[0] as { evidenceKey: string }).evidenceKey).toMatch(/^[a-f0-9]{64}$/)
  })

  it('retains honest skips and bounded source failures', async () => {
    const result = await buildResearchBatch(queue([queueItem('skip'), queueItem('fail')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [
        { status: 'skipped', menuItemId: 'skip', reason: 'no_first_party_source', detail: 'No official nutrition found.' },
        { status: 'failed', menuItemId: 'fail', reason: 'source_unavailable', detail: 'Official site unavailable.' },
      ],
    }, dependencies())
    expect(result.batch.outcomes.map(outcome => outcome.status)).toEqual(['failed', 'skipped'])
    expect(result).toMatchObject({ shouldOpenPullRequest: false, blocksAutoMerge: false })
  })

  it.each([
    [{ serving: { quantity: null, unit: null, description: null } }, 'incomplete_serving'],
    [{ exactItemMatch: false }, 'inexact_item_match'],
    [{ exactServingMatch: false }, 'inexact_serving_match'],
    [{ reportedCarbs: 61 }, 'material_carb_discrepancy'],
  ])('flags review condition %s', async (overrides, reason) => {
    const result = await buildResearchBatch(queue([queueItem('item-1')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [found('item-1', overrides)],
    } as ResearchFindings, dependencies())
    expect(result.batch.outcomes[0]).toMatchObject({ status: 'flagged' })
    expect((result.batch.outcomes[0] as { reviewReasons: string[] }).reviewReasons).toContain(reason)
    expect(result.blocksAutoMerge).toBe(true)
  })

  it('routes a source outage to failure and ownership uncertainty to a flag', async () => {
    const outage = await buildResearchBatch(queue([queueItem('item-1')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [found('item-1')],
    } as ResearchFindings, dependencies({
      valid: false,
      reviewRequired: true,
      reason: 'source_unavailable',
      finalUrl: 'https://disneyworld.disney.go.com/menu',
    }))
    expect(outage.batch.outcomes[0]).toMatchObject({ status: 'failed', reason: 'source_unavailable' })

    const ownership = await buildResearchBatch(queue([queueItem('item-1')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [found('item-1')],
    } as ResearchFindings, dependencies({
      ...resolved,
      valid: false,
      reviewRequired: true,
      reason: 'owner_unverified',
    }))
    expect(ownership.batch.outcomes[0]).toMatchObject({
      status: 'flagged',
      reviewReasons: ['owner_unverified'],
    })
  })

  it('retains an unfetched unverified owner as a non-publishable flag', async () => {
    const ownership = await buildResearchBatch(queue([queueItem('item-1')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [found('item-1')],
    } as ResearchFindings, dependencies({
      valid: false,
      reviewRequired: true,
      reason: 'owner_unverified',
      finalUrl: 'https://unknown.example/menu',
    }))
    expect(ownership.batch.outcomes[0]).toMatchObject({
      status: 'flagged',
      reviewReasons: ['owner_unverified'],
      contentHash: null,
      evidenceKey: null,
    })
  })

  it('flags conflicting observations that share an upstream source key', async () => {
    const result = await buildResearchBatch(queue([
      queueItem('one', { currentCarbs: null }),
      queueItem('two', { currentCarbs: null }),
    ]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [
        found('one', { upstreamSourceKey: 'same-source', sourceReportedItemName: 'Same Product', reportedCarbs: 20 }),
        found('two', { upstreamSourceKey: 'same-source', sourceReportedItemName: 'Same Product', reportedCarbs: 30 }),
      ],
    } as ResearchFindings, dependencies())
    expect(result.batch.outcomes).toEqual([
      expect.objectContaining({ status: 'flagged', reviewReasons: ['conflicting_observation'] }),
      expect.objectContaining({ status: 'flagged', reviewReasons: ['conflicting_observation'] }),
    ])
  })

  it.each(['ai', 'keyword', 'decomposition', 'recipe', 'third_party_database'])('rejects %s findings', async sourceKind => {
    await expect(buildResearchBatch(queue([queueItem('item-1')]), {
      schemaVersion: 1,
      batchId: 'wdw-20260712T120000Z-a1b2c3d4',
      outcomes: [found('item-1', { sourceKind })],
    } as ResearchFindings, dependencies())).rejects.toThrow(/sourceKind/i)
  })

  it('rejects unknown, omitted, and duplicate queue outcomes', async () => {
    const base = queue([queueItem('one'), queueItem('two')])
    await expect(buildResearchBatch(base, {
      schemaVersion: 1,
      batchId: base.batchId,
      outcomes: [found('one')],
    } as ResearchFindings, dependencies())).rejects.toThrow(/exactly one/i)
    await expect(buildResearchBatch(base, {
      schemaVersion: 1,
      batchId: base.batchId,
      outcomes: [found('one'), found('two'), found('unknown')],
    } as ResearchFindings, dependencies())).rejects.toThrow(/unknown/i)
    await expect(buildResearchBatch(base, {
      schemaVersion: 1,
      batchId: base.batchId,
      outcomes: [found('one'), found('one')],
    } as ResearchFindings, dependencies())).rejects.toThrow(/duplicate/i)
  })

  it('is byte-deterministic for the same queue, findings, source, and clock', async () => {
    const sourceQueue = queue([queueItem('two'), queueItem('one')])
    const findings = {
      schemaVersion: 1 as const,
      batchId: sourceQueue.batchId,
      outcomes: [found('two'), found('one')],
    } as ResearchFindings
    const first = await buildResearchBatch(sourceQueue, findings, dependencies())
    const second = await buildResearchBatch(sourceQueue, {
      ...findings,
      outcomes: [...findings.outcomes].reverse(),
    }, dependencies())
    expect(stableResearchJson(first.batch)).toBe(stableResearchJson(second.batch))
  })
})

describe('runResearchFindingsCli', () => {
  it('always writes runtime output but writes commit files only for evidence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'research-findings-'))
    const queuePath = join(directory, 'queue.json')
    const findingsPath = join(directory, 'findings.json')
    const runtimePath = join(directory, 'runtime.json')
    const commitPath = join(directory, 'batch.json')
    const summaryPath = join(directory, 'batch.md')
    const sourceQueue = queue([queueItem('skip')])
    const findings = {
      schemaVersion: 1,
      batchId: sourceQueue.batchId,
      outcomes: [{
        status: 'skipped',
        menuItemId: 'skip',
        reason: 'no_first_party_source',
        detail: 'No official source.',
      }],
    }
    const { writeFileSync } = await import('node:fs')
    writeFileSync(queuePath, JSON.stringify(sourceQueue))
    writeFileSync(findingsPath, JSON.stringify(findings))

    const result = await runResearchFindingsCli([
      `--queue=${queuePath}`,
      `--findings=${findingsPath}`,
      `--runtime-out=${runtimePath}`,
      `--commit-out=${commitPath}`,
      `--summary-out=${summaryPath}`,
    ], { ...dependencies(), writeStdout: () => undefined })
    expect(result.shouldOpenPullRequest).toBe(false)
    expect(readFileSync(runtimePath, 'utf8')).toContain('no_first_party_source')
    expect(() => readFileSync(commitPath)).toThrow()
    expect(() => readFileSync(summaryPath)).toThrow()
  })
})
