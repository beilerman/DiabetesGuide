import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  buildEvidenceCandidate,
  type NutritionEvidenceRow,
} from './evidence-intake.js'
import {
  parseResearchBatch,
  stableResearchJson,
  type ResearchEvidenceOutcome,
} from './research-contract.js'

export interface ProtectedStateSnapshot {
  nutritionalData: Array<{
    id: string
    carbs: number | null
    activeCertificationId: string | null
  }>
  certificationIds: string[]
}

export interface ResearchApplyStore {
  snapshotProtectedState(menuItemIds: string[]): Promise<ProtectedStateSnapshot>
  findEvidenceKeys(keys: string[]): Promise<Set<string>>
  insertEvidence(rows: NutritionEvidenceRow[]): Promise<void>
}

export interface ResearchApplyResult {
  batchId: string
  expected: number
  inserted: number
  existing: number
  verified: number
}

export interface ResearchApplyConfig {
  url: string
  serviceRoleKey: string
}

export function resolveResearchApplyConfig(env: NodeJS.ProcessEnv = process.env): ResearchApplyConfig {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!url) throw new Error('Protected apply requires SUPABASE_URL')
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Protected apply requires a Supabase service role key')
  return { url, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
}

export function assertProtectedApplyContext(
  env: NodeJS.ProcessEnv,
  protectedBranch: string,
  allowIsolatedTestProject: boolean,
): void {
  if (allowIsolatedTestProject) return
  if (env.GITHUB_REF_NAME !== protectedBranch) {
    throw new Error(`Evidence apply must run on protected branch ${protectedBranch}`)
  }
}

function acceptedOutcomes(value: unknown): { batchId: string; outcomes: ResearchEvidenceOutcome[] } {
  const batch = parseResearchBatch(value)
  if (batch.outcomes.some(outcome => outcome.status === 'flagged')) {
    throw new Error('Research batch still requires human review and cannot be applied')
  }
  return {
    batchId: batch.batchId,
    outcomes: batch.outcomes.filter((outcome): outcome is ResearchEvidenceOutcome => outcome.status === 'accepted'),
  }
}

function evidenceRow(outcome: ResearchEvidenceOutcome): NutritionEvidenceRow {
  if (!outcome.retrievedAt || !outcome.contentHash || !outcome.evidenceKey) {
    throw new Error(`Accepted outcome ${outcome.menuItemId} is missing evidence provenance`)
  }
  const candidate = buildEvidenceCandidate({
    menuItemId: outcome.menuItemId,
    itemName: outcome.itemName,
    reportedItemName: outcome.sourceReportedItemName,
    sourceKind: outcome.sourceKind,
    sourceName: outcome.sourceOwner,
    sourceUrl: outcome.sourceUrl,
    sourceLocator: outcome.sourceLocator,
    upstreamSourceKey: outcome.upstreamSourceKey,
    carbs: outcome.reportedCarbs,
    serving: outcome.serving,
    exactItemMatch: outcome.exactItemMatch,
    exactServingMatch: outcome.exactServingMatch,
    retrievedAt: outcome.retrievedAt,
    publishedAt: outcome.publishedAt,
    contentHash: outcome.contentHash,
  })
  if (candidate.evidenceRow.evidence_key !== outcome.evidenceKey) {
    throw new Error(`Reviewed evidence key cannot be reconstructed for ${outcome.menuItemId}`)
  }
  return candidate.evidenceRow
}

export async function applyResearchBatch(
  value: unknown,
  store: ResearchApplyStore,
): Promise<ResearchApplyResult> {
  const { batchId, outcomes } = acceptedOutcomes(value)
  const rows = outcomes.map(evidenceRow)
  const keys = rows.map(row => row.evidence_key)
  const menuItemIds = [...new Set(rows.map(row => row.menu_item_id))].sort()
  const before = await store.snapshotProtectedState(menuItemIds)
  const existingKeys = await store.findEvidenceKeys(keys)
  const missingRows = rows.filter(row => !existingKeys.has(row.evidence_key))
  if (missingRows.length > 0) await store.insertEvidence(missingRows)
  const verifiedKeys = await store.findEvidenceKeys(keys)
  if (verifiedKeys.size !== keys.length || keys.some(key => !verifiedKeys.has(key))) {
    throw new Error(`Partial apply: verified ${verifiedKeys.size} of ${keys.length} reviewed evidence keys`)
  }
  const after = await store.snapshotProtectedState(menuItemIds)
  if (stableResearchJson(before) !== stableResearchJson(after)) {
    throw new Error('Protected state changed while applying evidence')
  }
  const result = {
    batchId,
    expected: rows.length,
    inserted: missingRows.length,
    existing: existingKeys.size,
    verified: verifiedKeys.size,
  }
  if (result.inserted + result.existing !== result.expected) {
    throw new Error('Evidence apply counts do not balance')
  }
  return result
}

function errorMessage(error: unknown): string {
  if (error == null) return 'unknown Supabase error'
  if (typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

export function createResearchApplyStore(client: SupabaseClient): ResearchApplyStore {
  return {
    async snapshotProtectedState(menuItemIds) {
      if (menuItemIds.length === 0) return { nutritionalData: [], certificationIds: [] }
      const [nutritionResult, certificationResult] = await Promise.all([
        client
          .from('nutritional_data')
          .select('id, carbs, active_certification_id')
          .in('menu_item_id', menuItemIds)
          .order('id'),
        client
          .from('nutrition_certifications')
          .select('id')
          .in('menu_item_id', menuItemIds)
          .order('id'),
      ])
      if (nutritionResult.error) throw new Error(`Failed to snapshot nutritional data: ${errorMessage(nutritionResult.error)}`)
      if (certificationResult.error) throw new Error(`Failed to snapshot certifications: ${errorMessage(certificationResult.error)}`)
      return {
        nutritionalData: (nutritionResult.data ?? []).map(row => ({
          id: String(row.id),
          carbs: typeof row.carbs === 'number' ? row.carbs : null,
          activeCertificationId: typeof row.active_certification_id === 'string'
            ? row.active_certification_id
            : null,
        })),
        certificationIds: (certificationResult.data ?? []).map(row => String(row.id)).sort(),
      }
    },

    async findEvidenceKeys(keys) {
      if (keys.length === 0) return new Set()
      const { data, error } = await client
        .from('nutrition_sources')
        .select('evidence_key')
        .in('evidence_key', keys)
        .order('evidence_key')
      if (error) throw new Error(`Failed to verify evidence keys: ${errorMessage(error)}`)
      return new Set((data ?? []).map(row => String(row.evidence_key)))
    },

    async insertEvidence(rows) {
      if (rows.length === 0) return
      const { error } = await client
        .from('nutrition_sources')
        .insert(rows)
      if (error) throw new Error(`Failed to insert reviewed evidence: ${errorMessage(error)}`)
    },
  }
}

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

export async function runApplyResearchBatchCli(
  args: string[],
  dependencies: {
    env?: NodeJS.ProcessEnv
    store?: ResearchApplyStore
    writeStdout?: (value: string) => void
  } = {},
): Promise<ResearchApplyResult> {
  const env = dependencies.env ?? process.env
  const batchPath = option(args, '--batch')
  if (!batchPath) throw new Error('Missing required option --batch')
  const protectedBranch = option(args, '--protected-branch') ?? 'main'
  assertProtectedApplyContext(env, protectedBranch, args.includes('--allow-isolated-test-project'))
  let store = dependencies.store
  if (!store) {
    const config = resolveResearchApplyConfig(env)
    const client = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    store = createResearchApplyStore(client)
  }
  const result = await applyResearchBatch(JSON.parse(readFileSync(batchPath, 'utf8')), store)
  ;(dependencies.writeStdout ?? (value => process.stdout.write(value)))(`${JSON.stringify(result)}\n`)
  return result
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runApplyResearchBatchCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
