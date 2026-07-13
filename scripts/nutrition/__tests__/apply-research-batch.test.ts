import { describe, expect, it } from 'vitest'

import { buildEvidenceCandidate, type NutritionEvidenceRow } from '../evidence-intake.js'
import { parseResearchBatch, type ResearchBatch } from '../research-contract.js'
import {
  applyResearchBatch,
  assertProtectedApplyContext,
  resolveResearchApplyConfig,
  type ProtectedStateSnapshot,
  type ResearchApplyStore,
} from '../apply-research-batch.js'

function acceptedBatch(): ResearchBatch {
  const candidate = buildEvidenceCandidate({
    menuItemId: 'item-1',
    itemName: 'Catalog Pretzel',
    reportedItemName: 'Official Pretzel',
    sourceKind: 'official_research',
    sourceName: 'Disney',
    sourceUrl: 'https://disneyworld.disney.go.com/menu',
    sourceLocator: 'row 2',
    upstreamSourceKey: 'disney-menu-2026',
    carbs: 42,
    serving: { quantity: 1, unit: 'pretzel', description: '1 pretzel' },
    exactItemMatch: true,
    exactServingMatch: true,
    retrievedAt: '2026-07-12T12:05:00.000Z',
    publishedAt: null,
    contentHash: 'a'.repeat(64),
  })
  return parseResearchBatch({
    schemaVersion: 1,
    batchId: 'wdw-20260712T120000Z-a1b2c3d4',
    scope: 'wdw',
    catalogSnapshotAt: '2026-07-12T12:00:00.000Z',
    generatedAt: '2026-07-12T12:10:00.000Z',
    outcomes: [{
      status: 'accepted',
      menuItemId: 'item-1',
      itemName: 'Catalog Pretzel',
      catalogSnapshotHash: '1'.repeat(64),
      currentCarbs: 40,
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
      evidenceKey: candidate.evidenceRow.evidence_key,
      sourceExcerpt: 'Total Carbohydrate 42 g',
      reviewReasons: [],
    }],
  })
}

class FakeStore implements ResearchApplyStore {
  readonly rows = new Map<string, NutritionEvidenceRow>()
  readonly inserted: NutritionEvidenceRow[][] = []
  protectedState: ProtectedStateSnapshot = {
    nutritionalData: [{ id: 'nutrition-1', carbs: 40, activeCertificationId: null }],
    certificationIds: [],
  }
  partialInsert = false
  mutateProtectedState = false

  async snapshotProtectedState(): Promise<ProtectedStateSnapshot> {
    if (this.mutateProtectedState && this.inserted.length > 0) {
      return {
        nutritionalData: [{ id: 'nutrition-1', carbs: 99, activeCertificationId: null }],
        certificationIds: [],
      }
    }
    return structuredClone(this.protectedState)
  }

  async findEvidenceKeys(keys: string[]): Promise<Set<string>> {
    return new Set(keys.filter(key => this.rows.has(key)))
  }

  async insertEvidence(rows: NutritionEvidenceRow[]): Promise<void> {
    this.inserted.push(structuredClone(rows))
    const accepted = this.partialInsert ? rows.slice(0, Math.max(0, rows.length - 1)) : rows
    for (const row of accepted) this.rows.set(row.evidence_key, structuredClone(row))
  }
}

describe('applyResearchBatch', () => {
  it('inserts only accepted immutable evidence and verifies protected state', async () => {
    const store = new FakeStore()
    const result = await applyResearchBatch(acceptedBatch(), store)
    expect(result).toMatchObject({ expected: 1, inserted: 1, existing: 0, verified: 1 })
    expect(store.inserted[0][0]).toMatchObject({
      menu_item_id: 'item-1',
      reported_item_name: 'Official Pretzel',
      reported_carbs: 42,
      source_type: 'official_restaurant',
    })
    expect(store).not.toHaveProperty('updateNutrition')
    expect(store).not.toHaveProperty('publishCertification')
  })

  it('is idempotent on evidence key', async () => {
    const store = new FakeStore()
    await applyResearchBatch(acceptedBatch(), store)
    const second = await applyResearchBatch(acceptedBatch(), store)
    expect(second).toMatchObject({ expected: 1, inserted: 0, existing: 1, verified: 1 })
    expect(store.inserted).toHaveLength(1)
  })

  it('rejects all apply when any outcome remains review-blocked', async () => {
    const batch = acceptedBatch()
    const flagged = parseResearchBatch({
      ...batch,
      outcomes: [{
        ...batch.outcomes[0],
        status: 'flagged',
        reviewReasons: ['material_carb_discrepancy'],
      }],
    })
    const store = new FakeStore()
    await expect(applyResearchBatch(flagged, store)).rejects.toThrow(/review/i)
    expect(store.inserted).toHaveLength(0)
  })

  it('detects partial insertion and unexpected evidence-key verification', async () => {
    const store = new FakeStore()
    store.partialInsert = true
    const first = acceptedBatch()
    const secondCandidate = buildEvidenceCandidate({
      menuItemId: 'item-2',
      itemName: 'Second Item',
      reportedItemName: 'Second Item',
      sourceKind: 'official_research',
      sourceName: 'Disney',
      sourceUrl: 'https://disneyworld.disney.go.com/menu-2',
      carbs: 20,
      serving: { quantity: 1, unit: 'item', description: '1 item' },
      exactItemMatch: true,
      exactServingMatch: true,
      retrievedAt: '2026-07-12T12:05:00.000Z',
      contentHash: 'c'.repeat(64),
    })
    const twoRows = parseResearchBatch({
      ...first,
      outcomes: [
        first.outcomes[0],
        {
          ...(first.outcomes[0] as Record<string, unknown>),
          menuItemId: 'item-2',
          itemName: 'Second Item',
          catalogSnapshotHash: '2'.repeat(64),
          currentCarbs: null,
          sourceUrl: 'https://disneyworld.disney.go.com/menu-2',
          sourceLocator: null,
          sourceReportedItemName: 'Second Item',
          reportedCarbs: 20,
          serving: { quantity: 1, unit: 'item', description: '1 item' },
          contentHash: 'c'.repeat(64),
          upstreamSourceKey: secondCandidate.evidenceRow.upstream_source_key,
          evidenceKey: secondCandidate.evidenceRow.evidence_key,
          sourceExcerpt: undefined,
        },
      ],
    })
    await expect(applyResearchBatch(twoRows, store)).rejects.toThrow(/partial|verified/i)
  })

  it('detects any active carbohydrate or certification-state mutation', async () => {
    const store = new FakeStore()
    store.mutateProtectedState = true
    await expect(applyResearchBatch(acceptedBatch(), store)).rejects.toThrow(/protected state/i)
  })

  it('rejects an evidence key that cannot be reconstructed from reviewed fields', async () => {
    const batch = acceptedBatch() as unknown as Record<string, unknown>
    ;(batch.outcomes as Array<Record<string, unknown>>)[0].evidenceKey = 'f'.repeat(64)
    await expect(applyResearchBatch(batch, new FakeStore())).rejects.toThrow(/evidence key/i)
  })
})

describe('protected apply configuration', () => {
  it('requires a service role and never substitutes an anon key', () => {
    expect(resolveResearchApplyConfig({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      SUPABASE_ANON_KEY: 'anon',
    })).toEqual({ url: 'https://project.supabase.co', serviceRoleKey: 'service-role' })
    expect(() => resolveResearchApplyConfig({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    })).toThrow(/service role/i)
  })

  it('requires the protected branch unless isolated testing is explicit', () => {
    expect(() => assertProtectedApplyContext({ GITHUB_REF_NAME: 'feature' }, 'main', false)).toThrow(/protected branch/i)
    expect(() => assertProtectedApplyContext({ GITHUB_REF_NAME: 'feature' }, 'main', true)).not.toThrow()
    expect(() => assertProtectedApplyContext({ GITHUB_REF_NAME: 'main' }, 'main', false)).not.toThrow()
  })
})
