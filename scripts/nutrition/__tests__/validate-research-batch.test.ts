import { describe, expect, it } from 'vitest'

import { parseResearchBatch, stableResearchJson, type ResearchBatch } from '../research-contract.js'
import { catalogSnapshotHash, type ResearchCatalogItem } from '../research-queue.js'
import {
  validateResearchBatch,
  type ResearchBatchValidationDependencies,
} from '../validate-research-batch.js'
import { runValidateResearchBatchCliMain } from '../validate-research-batch-cli.js'

function catalogItem(overrides: Partial<ResearchCatalogItem> = {}): ResearchCatalogItem {
  return {
    menuItemId: 'item-1',
    itemName: 'Official Pretzel',
    description: 'Warm pretzel',
    category: 'snack',
    restaurantName: 'Magic Kingdom Cart',
    parkName: 'Magic Kingdom',
    parkLocation: 'Walt Disney World Resort',
    servingQuantity: null,
    servingUnit: null,
    servingDescription: null,
    nutritionDataId: 'nutrition-1',
    currentCarbs: 40,
    confidence: 40,
    activeCertificationId: null,
    ...overrides,
  }
}

function validBatch(item = catalogItem()): ResearchBatch {
  return parseResearchBatch({
    schemaVersion: 1,
    batchId: 'wdw-20260712T120000Z-a1b2c3d4',
    scope: 'wdw',
    catalogSnapshotAt: '2026-07-12T12:00:00.000Z',
    generatedAt: '2026-07-12T12:10:00.000Z',
    outcomes: [{
      status: 'accepted',
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      catalogSnapshotHash: catalogSnapshotHash(item),
      currentCarbs: item.currentCarbs,
      sourceKind: 'official_research',
      sourceOwner: 'Disney',
      ownerId: 'disney',
      sourceOwnerType: 'destination',
      manufacturerRelationship: null,
      sourceUrl: 'https://disneyworld.disney.go.com/menu',
      sourceLocator: 'row 2',
      sourceReportedItemName: 'Official Pretzel',
      reportedCarbs: 42,
      serving: { quantity: 1, unit: 'pretzel', description: '1 pretzel' },
      exactItemMatch: true,
      exactServingMatch: true,
      retrievedAt: '2026-07-12T12:05:00.000Z',
      publishedAt: null,
      contentHash: 'a'.repeat(64),
      upstreamSourceKey: 'disney-menu-2026',
      evidenceKey: 'b'.repeat(64),
      sourceExcerpt: 'Total Carbohydrate 42 g',
      reviewReasons: [],
    }],
  })
}

function dependencies(item = catalogItem()): ResearchBatchValidationDependencies {
  return {
    loadCatalog: async () => [item],
    resolveSource: async () => ({
      valid: true,
      reviewRequired: false,
      finalUrl: 'https://disneyworld.disney.go.com/menu',
      retrievedAt: '2026-07-12T12:20:00.000Z',
      contentHash: 'a'.repeat(64),
      etag: null,
      lastModified: null,
      status: 200,
    }),
  }
}

describe('validateResearchBatch static mode', () => {
  it('runs through the executable CLI wrapper', async () => {
    const output: string[] = []
    const result = await runValidateResearchBatchCliMain([
      '--static',
      '--batch=scripts/nutrition/__tests__/fixtures/valid-research-batch.json',
    ], { writeStdout: value => output.push(value) })
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(output[0])).toMatchObject({ valid: true, exitCode: 0 })
  })

  it('accepts a deterministically serialized evidence-only artifact', async () => {
    const batch = validBatch()
    await expect(validateResearchBatch(batch, {
      mode: 'static',
      originalJson: stableResearchJson(batch),
      changedFiles: [
        `audit/nutrition-research/batches/${batch.batchId}.json`,
        `audit/nutrition-research/batches/${batch.batchId}.md`,
      ],
    })).resolves.toMatchObject({ valid: true, blocksAutoMerge: false, errors: [] })
  })

  it('treats flagged evidence as valid but review-blocked', async () => {
    const batch = validBatch()
    const flagged = parseResearchBatch({
      ...batch,
      outcomes: [{
        ...batch.outcomes[0],
        status: 'flagged',
        reviewReasons: ['material_carb_discrepancy'],
      }],
    })
    await expect(validateResearchBatch(flagged, { mode: 'static' })).resolves.toMatchObject({
      valid: true,
      blocksAutoMerge: true,
      errors: [],
    })
  })

  it('rejects non-deterministic bytes and changes outside the batch pair', async () => {
    const batch = validBatch()
    const result = await validateResearchBatch(batch, {
      mode: 'static',
      originalJson: JSON.stringify(batch),
      changedFiles: [
        `audit/nutrition-research/batches/${batch.batchId}.json`,
        'src/App.tsx',
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining(['artifact_not_deterministic', 'non_evidence_file_changed']))
  })

  it('rejects malformed and duplicate evidence keys through the shared contract', async () => {
    const batch = validBatch() as unknown as Record<string, unknown>
    const outcomes = batch.outcomes as Array<Record<string, unknown>>
    outcomes.push({ ...outcomes[0] })
    const result = await validateResearchBatch(batch, { mode: 'static' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('invalid_artifact')
  })
})

describe('validateResearchBatch live mode', () => {
  it('passes an unchanged catalog and source without any write-capable dependency', async () => {
    const deps = dependencies()
    expect(deps).not.toHaveProperty('write')
    await expect(validateResearchBatch(validBatch(), { mode: 'live' }, deps)).resolves.toMatchObject({
      valid: true,
      blocksAutoMerge: false,
    })
  })

  it.each([
    ['itemName', 'Changed Pretzel'],
    ['restaurantName', 'Changed Restaurant'],
    ['parkName', 'EPCOT'],
    ['parkLocation', 'Disneyland Resort'],
    ['currentCarbs', 43],
    ['confidence', 70],
    ['activeCertificationId', 'cert-1'],
  ] as const)('detects catalog drift in %s', async (field, value) => {
    const changed = catalogItem({ [field]: value })
    const result = await validateResearchBatch(validBatch(), { mode: 'live' }, dependencies(changed))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('catalog_drift')
  })

  it('detects removed catalog rows', async () => {
    const result = await validateResearchBatch(validBatch(), { mode: 'live' }, {
      ...dependencies(),
      loadCatalog: async () => [],
    })
    expect(result.errors).toContain('catalog_drift')
  })

  it('detects source content and redirect drift', async () => {
    for (const resolved of [
      { finalUrl: 'https://disneyworld.disney.go.com/changed', contentHash: 'a'.repeat(64) },
      { finalUrl: 'https://disneyworld.disney.go.com/menu', contentHash: 'c'.repeat(64) },
    ]) {
      const result = await validateResearchBatch(validBatch(), { mode: 'live' }, {
        ...dependencies(),
        resolveSource: async () => ({
          valid: true,
          reviewRequired: false,
          retrievedAt: '2026-07-12T12:20:00.000Z',
          ...resolved,
        }),
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('source_drift')
    }
  })

  it('detects ownership failures on refetch', async () => {
    const result = await validateResearchBatch(validBatch(), { mode: 'live' }, {
      ...dependencies(),
      resolveSource: async () => ({
        valid: false,
        reviewRequired: true,
        reason: 'domain_not_owned',
        finalUrl: 'https://example.org/menu',
      }),
    })
    expect(result.errors).toContain('source_drift')
  })
})
