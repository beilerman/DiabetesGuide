import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseResearchBatch,
  stableResearchJson,
  type ResearchBatch,
  type ResearchEvidenceOutcome,
} from './research-contract.js'
import { catalogSnapshotHash, type ResearchCatalogItem } from './research-queue.js'
import {
  createResearchSupabaseClient,
  fetchResearchCatalog,
} from './research-supabase.js'
import {
  resolveAndValidateSource,
  type ResolvedSource,
  type SourceOwnershipInput,
} from './research-source-policy.js'

export type ResearchValidationMode = 'static' | 'live'

export interface ResearchBatchValidationOptions {
  mode: ResearchValidationMode
  originalJson?: string
  changedFiles?: string[]
}

export interface ResearchBatchValidationDependencies {
  loadCatalog?: () => Promise<ResearchCatalogItem[]>
  resolveSource?: (input: SourceOwnershipInput) => Promise<ResolvedSource>
}

export interface ResearchBatchValidationResult {
  valid: boolean
  blocksAutoMerge: boolean
  errors: string[]
  batchId: string | null
}

function evidenceOutcomes(batch: ResearchBatch): ResearchEvidenceOutcome[] {
  return batch.outcomes.filter((outcome): outcome is ResearchEvidenceOutcome =>
    outcome.status === 'accepted' || outcome.status === 'flagged')
}

function fileScopeIsValid(batchId: string, changedFiles: string[]): boolean {
  const prefix = `audit/nutrition-research/batches/${batchId}`
  const allowed = new Set([`${prefix}.json`, `${prefix}.md`])
  return changedFiles.every(file => allowed.has(file.replaceAll('\\', '/')))
}

export async function validateResearchBatch(
  value: unknown,
  options: ResearchBatchValidationOptions,
  dependencies: ResearchBatchValidationDependencies = {},
): Promise<ResearchBatchValidationResult> {
  let batch: ResearchBatch
  try {
    batch = parseResearchBatch(value)
  } catch {
    return { valid: false, blocksAutoMerge: true, errors: ['invalid_artifact'], batchId: null }
  }

  const errors: string[] = []
  if (options.originalJson != null && options.originalJson !== stableResearchJson(batch)) {
    errors.push('artifact_not_deterministic')
  }
  if (options.changedFiles && !fileScopeIsValid(batch.batchId, options.changedFiles)) {
    errors.push('non_evidence_file_changed')
  }
  let blocksAutoMerge = batch.outcomes.some(outcome => outcome.status === 'flagged')

  if (options.mode === 'live') {
    const client = dependencies.loadCatalog ? null : createResearchSupabaseClient()
    const catalog = await (dependencies.loadCatalog ?? (() => fetchResearchCatalog(client!)))()
    const byId = new Map(catalog.map(item => [item.menuItemId, item]))
    for (const outcome of batch.outcomes) {
      const current = byId.get(outcome.menuItemId)
      if (!current || catalogSnapshotHash(current) !== outcome.catalogSnapshotHash) {
        errors.push('catalog_drift')
        blocksAutoMerge = true
      }
    }

    const resolveSource = dependencies.resolveSource ?? (input => resolveAndValidateSource(input))
    for (const outcome of evidenceOutcomes(batch)) {
      if (outcome.contentHash == null) continue
      const resolved = await resolveSource({
        sourceUrl: outcome.sourceUrl,
        ownerId: outcome.ownerId,
        sourceOwnerType: outcome.sourceOwnerType,
        venueName: byId.get(outcome.menuItemId)?.restaurantName ?? '',
        manufacturerRelationship: outcome.manufacturerRelationship,
      })
      if (
        !resolved.valid
        || resolved.finalUrl !== outcome.sourceUrl
        || resolved.contentHash !== outcome.contentHash
      ) {
        errors.push('source_drift')
        blocksAutoMerge = true
      }
    }
  }

  const uniqueErrors = [...new Set(errors)]
  return {
    valid: uniqueErrors.length === 0,
    blocksAutoMerge,
    errors: uniqueErrors,
    batchId: batch.batchId,
  }
}

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

function readChangedFiles(path: string | undefined): string[] | undefined {
  if (!path) return undefined
  const contents = readFileSync(path, 'utf8')
  try {
    const parsed: unknown = JSON.parse(contents)
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return parsed
  } catch {
    // Newline-delimited git output is also accepted.
  }
  return contents.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

export async function runValidateResearchBatchCli(
  args: string[],
  dependencies: ResearchBatchValidationDependencies & { writeStdout?: (value: string) => void } = {},
): Promise<ResearchBatchValidationResult & { exitCode: 0 | 1 | 2 }> {
  const staticMode = args.includes('--static')
  const liveMode = args.includes('--live')
  if (staticMode === liveMode) throw new Error('Select exactly one validation mode: --static or --live')
  const batchPath = option(args, '--batch')
  if (!batchPath) throw new Error('Missing required option --batch')
  const originalJson = readFileSync(batchPath, 'utf8')
  const result = await validateResearchBatch(JSON.parse(originalJson), {
    mode: liveMode ? 'live' : 'static',
    originalJson,
    changedFiles: readChangedFiles(option(args, '--changed-files')),
  }, dependencies)
  const exitCode: 0 | 1 | 2 = !result.valid ? 1 : result.blocksAutoMerge ? 2 : 0
  ;(dependencies.writeStdout ?? (value => process.stdout.write(value)))(`${JSON.stringify({ ...result, exitCode })}\n`)
  return { ...result, exitCode }
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runValidateResearchBatchCli(process.argv.slice(2)).then(
    result => { process.exitCode = result.exitCode },
    error => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
