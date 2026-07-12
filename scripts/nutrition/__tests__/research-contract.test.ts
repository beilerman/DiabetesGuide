import { describe, expect, it } from 'vitest'

import {
  isMaterialCarbDiscrepancy,
  parseResearchBatch,
  stableResearchJson,
  type ResearchBatch,
} from '../research-contract.js'

function validBatch(): ResearchBatch {
  return {
    schemaVersion: 1,
    batchId: 'wdw-20260712T120000Z-a1b2c3d4',
    scope: 'wdw',
    catalogSnapshotAt: '2026-07-12T12:00:00.000Z',
    generatedAt: '2026-07-12T12:10:00.000Z',
    outcomes: [
      {
        status: 'accepted',
        menuItemId: 'item-1',
        itemName: 'Official Pretzel',
        catalogSnapshotHash: '1'.repeat(64),
        currentCarbs: 40,
        sourceKind: 'official_research',
        sourceOwner: 'Disney',
        ownerId: 'disney',
        sourceOwnerType: 'destination',
        manufacturerRelationship: null,
        sourceUrl: 'https://disneyworld.disney.go.com/menu.pdf',
        sourceLocator: 'page 2',
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
      },
      {
        status: 'skipped',
        menuItemId: 'item-2',
        itemName: 'Mystery Snack',
        catalogSnapshotHash: '2'.repeat(64),
        reason: 'no_first_party_source',
        detail: 'No qualifying official nutrition document found.',
      },
      {
        status: 'failed',
        menuItemId: 'item-3',
        itemName: 'Unavailable Treat',
        catalogSnapshotHash: '3'.repeat(64),
        reason: 'source_unavailable',
        detail: 'Official site remained unavailable after bounded retries.',
      },
      {
        status: 'flagged',
        menuItemId: 'item-4',
        itemName: 'Large Dessert',
        catalogSnapshotHash: '4'.repeat(64),
        currentCarbs: 20,
        sourceKind: 'manufacturer_research',
        sourceOwner: 'Example Manufacturer',
        ownerId: 'example_manufacturer',
        sourceOwnerType: 'manufacturer',
        manufacturerRelationship: 'Packaged item made by Example Manufacturer',
        sourceUrl: 'https://example.com/nutrition.pdf',
        sourceLocator: 'row 4',
        sourceReportedItemName: 'Large Dessert',
        reportedCarbs: 35,
        serving: { quantity: 1, unit: 'package', description: '1 package' },
        exactItemMatch: true,
        exactServingMatch: true,
        retrievedAt: '2026-07-12T12:06:00.000Z',
        publishedAt: null,
        contentHash: 'c'.repeat(64),
        upstreamSourceKey: 'manufacturer-sheet-2026',
        evidenceKey: 'd'.repeat(64),
        sourceExcerpt: 'Total Carbohydrate 35 g',
        reviewReasons: ['material_carb_discrepancy'],
      },
    ],
  }
}

describe('isMaterialCarbDiscrepancy', () => {
  it.each([
    [50, 60, false],
    [50, 60.01, true],
    [100, 110, false],
    [100, 121, true],
    [0, 0, false],
    [0, 1, true],
    [null, 100, false],
  ])('%s -> %s = %s', (current, found, expected) => {
    expect(isMaterialCarbDiscrepancy(current, found)).toBe(expected)
  })
})

describe('parseResearchBatch', () => {
  it('accepts all four explicit outcome kinds', () => {
    expect(parseResearchBatch(validBatch()).outcomes.map(item => item.status)).toEqual([
      'accepted',
      'skipped',
      'failed',
      'flagged',
    ])
  })

  it('rejects estimated and third-party evidence', () => {
    for (const sourceKind of ['ai', 'keyword', 'decomposition', 'recipe', 'third_party_database']) {
      const batch = validBatch() as unknown as Record<string, unknown>
      const outcomes = (batch.outcomes as Array<Record<string, unknown>>)
      outcomes[0] = { ...outcomes[0], sourceKind }
      expect(() => parseResearchBatch(batch)).toThrow(/sourceKind/i)
    }
  })

  it('rejects incomplete serving, inexact accepted matches, and invalid carbohydrate values', () => {
    const incomplete = structuredClone(validBatch()) as unknown as Record<string, unknown>
    const incompleteOutcomes = incomplete.outcomes as Array<Record<string, unknown>>
    incompleteOutcomes[0] = {
      ...incompleteOutcomes[0],
      serving: { quantity: null, unit: null, description: null },
    }
    expect(() => parseResearchBatch(incomplete)).toThrow(/serving/i)

    const inexact = structuredClone(validBatch()) as unknown as Record<string, unknown>
    ;(inexact.outcomes as Array<Record<string, unknown>>)[0].exactItemMatch = false
    expect(() => parseResearchBatch(inexact)).toThrow(/exactItemMatch/i)

    const invalidCarbs = structuredClone(validBatch()) as unknown as Record<string, unknown>
    ;(invalidCarbs.outcomes as Array<Record<string, unknown>>)[0].reportedCarbs = -1
    expect(() => parseResearchBatch(invalidCarbs)).toThrow(/reportedCarbs/i)
  })

  it('rejects missing source provenance and malformed hashes', () => {
    for (const field of ['sourceUrl', 'contentHash', 'retrievedAt', 'catalogSnapshotAt']) {
      const batch = structuredClone(validBatch()) as unknown as Record<string, unknown>
      if (field === 'catalogSnapshotAt') batch[field] = ''
      else (batch.outcomes as Array<Record<string, unknown>>)[0][field] = ''
      expect(() => parseResearchBatch(batch)).toThrow(new RegExp(field, 'i'))
    }
  })

  it('rejects unknown fields, secrets, and oversized excerpts', () => {
    const unknown = structuredClone(validBatch()) as unknown as Record<string, unknown>
    unknown.unexpected = true
    expect(() => parseResearchBatch(unknown)).toThrow(/unexpected/i)

    const secret = structuredClone(validBatch()) as unknown as Record<string, unknown>
    ;(secret.outcomes as Array<Record<string, unknown>>)[0].apiKey = 'super-secret'
    expect(() => parseResearchBatch(secret)).toThrow(/secret|apiKey/i)

    const longExcerpt = structuredClone(validBatch()) as unknown as Record<string, unknown>
    ;(longExcerpt.outcomes as Array<Record<string, unknown>>)[0].sourceExcerpt = 'x'.repeat(501)
    expect(() => parseResearchBatch(longExcerpt)).toThrow(/sourceExcerpt/i)
  })

  it('rejects duplicate menu-item/evidence-key pairs', () => {
    const batch = validBatch()
    batch.outcomes.push(structuredClone(batch.outcomes[0]))
    expect(() => parseResearchBatch(batch)).toThrow(/duplicate/i)
  })
})

describe('stableResearchJson', () => {
  it('sorts object keys recursively and ends with a newline', () => {
    expect(stableResearchJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 2\n}\n',
    )
  })

  it('sorts outcomes by menu item, status, and evidence key or reason', () => {
    const batch = validBatch()
    batch.outcomes.reverse()
    const parsed = parseResearchBatch(batch)
    expect(parsed.outcomes.map(item => `${item.menuItemId}:${item.status}`)).toEqual([
      'item-1:accepted',
      'item-2:skipped',
      'item-3:failed',
      'item-4:flagged',
    ])
  })
})
