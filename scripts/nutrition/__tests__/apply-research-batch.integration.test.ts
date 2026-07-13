import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { buildEvidenceCandidate } from '../evidence-intake.js'
import {
  applyResearchBatch,
  createResearchApplyStore,
} from '../apply-research-batch.js'
import { parseResearchBatch } from '../research-contract.js'

const enabled = process.env.RUN_NUTRITION_RESEARCH_INTEGRATION === '1'
const integration = describe.skipIf(!enabled)

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the opt-in integration test`)
  return value
}

function assertDisposableUrl(url: string): void {
  const hostname = new URL(url).hostname
  const local = hostname === '127.0.0.1' || hostname === 'localhost'
  if (!local && process.env.TEST_SUPABASE_ALLOW_REMOTE_DISPOSABLE !== '1') {
    throw new Error('Refusing remote integration writes without TEST_SUPABASE_ALLOW_REMOTE_DISPOSABLE=1')
  }
}

integration('protected research apply against disposable Supabase', () => {
  it('is idempotent, immutable, RLS-safe, and leaves active state unchanged', async () => {
    const url = required('TEST_SUPABASE_URL')
    const serviceRoleKey = required('TEST_SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = required('TEST_SUPABASE_ANON_KEY')
    assertDisposableUrl(url)

    const service = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'research-integration-service' },
    })
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'research-integration-anon' },
    })
    const menuItemId = '10000000-0000-4000-8000-000000000003'
    const nutritionId = '10000000-0000-4000-8000-000000000004'
    const certificationId = '10000000-0000-4000-8000-000000000005'

    const { data: seededNutrition, error: seedError } = await service
      .from('nutritional_data')
      .select('id, carbs, active_certification_id')
      .eq('id', nutritionId)
      .single()
    if (seedError) throw new Error(`Disposable project must load research-integration-seed.sql: ${seedError.message}`)
    expect(seededNutrition).toMatchObject({ id: nutritionId, carbs: 40, active_certification_id: null })

    const candidate = buildEvidenceCandidate({
      menuItemId,
      itemName: 'Integration Pretzel',
      reportedItemName: 'Official Integration Pretzel',
      sourceKind: 'official_research',
      sourceName: 'Disney',
      sourceUrl: 'https://disneyworld.disney.go.com/integration-menu',
      sourceLocator: 'row 1',
      upstreamSourceKey: `integration-source-${menuItemId}`,
      carbs: 42,
      serving: { quantity: 1, unit: 'pretzel', description: '1 pretzel' },
      exactItemMatch: true,
      exactServingMatch: true,
      retrievedAt: '2026-07-12T12:05:00.000Z',
      contentHash: 'a'.repeat(64),
    })
    const batch = parseResearchBatch({
      schemaVersion: 1,
      batchId: `wdw-integration-${menuItemId}`,
      scope: 'wdw',
      catalogSnapshotAt: '2026-07-12T12:00:00.000Z',
      generatedAt: '2026-07-12T12:10:00.000Z',
      outcomes: [{
        status: 'accepted',
        menuItemId,
        itemName: 'Integration Pretzel',
        catalogSnapshotHash: '1'.repeat(64),
        currentCarbs: 40,
        sourceKind: 'official_research',
        sourceOwner: 'Disney',
        ownerId: 'disney',
        sourceOwnerType: 'destination',
        manufacturerRelationship: null,
        sourceUrl: 'https://disneyworld.disney.go.com/integration-menu',
        sourceLocator: 'row 1',
        sourceReportedItemName: 'Official Integration Pretzel',
        reportedCarbs: 42,
        serving: { quantity: 1, unit: 'pretzel', description: '1 pretzel' },
        exactItemMatch: true,
        exactServingMatch: true,
        retrievedAt: '2026-07-12T12:05:00.000Z',
        publishedAt: null,
        contentHash: 'a'.repeat(64),
        upstreamSourceKey: `integration-source-${menuItemId}`,
        evidenceKey: candidate.evidenceRow.evidence_key,
        sourceExcerpt: 'Total Carbohydrate 42 g',
        reviewReasons: [],
      }],
    })

    const store = createResearchApplyStore(service)
    const before = await store.snapshotProtectedState([menuItemId])
    const first = await applyResearchBatch(batch, store)
    const second = await applyResearchBatch(batch, store)
    const after = await store.snapshotProtectedState([menuItemId])

    expect(first).toMatchObject({ expected: 1, inserted: 1, existing: 0, verified: 1 })
    expect(second).toMatchObject({ expected: 1, inserted: 0, existing: 1, verified: 1 })
    expect(after).toEqual(before)
    expect(after.nutritionalData).toEqual([{ id: nutritionId, carbs: 40, activeCertificationId: null }])
    expect(after.certificationIds).toEqual([certificationId])

    const { error: mutationError } = await service
      .from('nutrition_sources')
      .update({ notes: 'forbidden mutation' })
      .eq('evidence_key', candidate.evidenceRow.evidence_key)
    expect(mutationError?.message).toMatch(/immutable|permission denied/i)

    const anonymousRow = {
      ...candidate.evidenceRow,
      evidence_key: 'f'.repeat(64),
      upstream_source_key: `anonymous-${menuItemId}`,
    }
    const { error: anonymousWriteError } = await anon.from('nutrition_sources').insert(anonymousRow)
    expect(anonymousWriteError).not.toBeNull()
  }, 60_000)
})
