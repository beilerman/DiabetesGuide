import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  buildEvidenceCandidate,
  type EvidenceSourceKind,
} from './evidence-intake.js'
import {
  isMaterialCarbDiscrepancy,
  parseResearchBatch,
  stableResearchJson,
  type ResearchBatch,
  type ResearchEvidenceOutcome,
  type ResearchFailureReason,
  type ResearchOutcome,
  type ResearchReviewReason,
  type ResearchSkipReason,
  type ResearchSourceKind,
} from './research-contract.js'
import type { ResearchQueue, ResearchQueueItem } from './research-queue.js'
import {
  resolveAndValidateSource,
  type ResolvedSource,
  type SourceOwnerType,
  type SourceOwnershipInput,
} from './research-source-policy.js'

export interface ResearchFoundFinding {
  status: 'found'
  menuItemId: string
  sourceKind: string
  sourceOwner: string
  ownerId: string
  sourceOwnerType: SourceOwnerType
  manufacturerRelationship: string | null
  sourceUrl: string
  sourceLocator: string | null
  sourceReportedItemName: string
  reportedCarbs: number
  serving: { quantity: number | null; unit: string | null; description: string | null }
  exactItemMatch: boolean
  exactServingMatch: boolean
  publishedAt: string | null
  upstreamSourceKey: string
  sourceExcerpt?: string
}

export interface ResearchSkippedFinding {
  status: 'skipped'
  menuItemId: string
  reason: ResearchSkipReason
  detail: string
}

export interface ResearchFailedFinding {
  status: 'failed'
  menuItemId: string
  reason: ResearchFailureReason
  detail: string
}

export type ResearchFinding = ResearchFoundFinding | ResearchSkippedFinding | ResearchFailedFinding

export interface ResearchFindings {
  schemaVersion: 1
  batchId: string
  outcomes: ResearchFinding[]
}

export interface ResearchBatchBuildResult {
  batch: ResearchBatch
  shouldOpenPullRequest: boolean
  blocksAutoMerge: boolean
  counts: Record<'accepted' | 'flagged' | 'skipped' | 'failed', number>
}

export interface ResearchFindingsDependencies {
  resolveSource?: (input: SourceOwnershipInput) => Promise<ResolvedSource>
  now?: () => string
}

export interface ResearchFindingsCliDependencies extends ResearchFindingsDependencies {
  writeStdout?: (value: string) => void
}

const FOUND_KEYS = new Set([
  'status',
  'menuItemId',
  'sourceKind',
  'sourceOwner',
  'ownerId',
  'sourceOwnerType',
  'manufacturerRelationship',
  'sourceUrl',
  'sourceLocator',
  'sourceReportedItemName',
  'reportedCarbs',
  'serving',
  'exactItemMatch',
  'exactServingMatch',
  'publishedAt',
  'upstreamSourceKey',
  'sourceExcerpt',
])
const RESULT_KEYS = new Set(['status', 'menuItemId', 'reason', 'detail'])
const SERVING_KEYS = new Set(['quantity', 'unit', 'description'])
const ALLOWED_SOURCE_KINDS = new Set<ResearchSourceKind>(['official_research', 'manufacturer_research'])
const SKIP_REASONS = new Set<ResearchSkipReason>([
  'no_first_party_source',
  'already_evidenced',
  'not_in_scope',
  'pending_research',
])
const FAILURE_REASONS = new Set<ResearchFailureReason>([
  'source_unavailable',
  'rate_limited',
  'invalid_response',
  'research_error',
])

function record(value: unknown, name: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, name: string): void {
  const unexpected = Object.keys(value).find(key => !allowed.has(key))
  if (unexpected) throw new Error(`${name} contains unexpected field: ${unexpected}`)
}

function requiredText(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`)
  if (value.length > max) throw new Error(`${name} exceeds ${max} characters`)
  return value
}

function nullableText(value: unknown, name: string): string | null {
  return value === null ? null : requiredText(value, name)
}

function parseServing(value: unknown, name: string): ResearchFoundFinding['serving'] {
  const serving = record(value, name)
  exactKeys(serving, SERVING_KEYS, name)
  const quantity = serving.quantity
  if (quantity !== null && (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0)) {
    throw new Error(`${name}.quantity must be null or a non-negative number`)
  }
  return {
    quantity: quantity as number | null,
    unit: serving.unit === null ? null : requiredText(serving.unit, `${name}.unit`),
    description: serving.description === null ? null : requiredText(serving.description, `${name}.description`),
  }
}

function parseFinding(value: unknown, index: number): ResearchFinding {
  const name = `findings.outcomes[${index}]`
  const finding = record(value, name)
  const status = finding.status
  if (status === 'found') {
    exactKeys(finding, FOUND_KEYS, name)
    if (typeof finding.sourceKind !== 'string' || !ALLOWED_SOURCE_KINDS.has(finding.sourceKind as ResearchSourceKind)) {
      throw new Error(`${name}.sourceKind must be official_research or manufacturer_research`)
    }
    if (finding.sourceOwnerType !== 'destination' && finding.sourceOwnerType !== 'chain' && finding.sourceOwnerType !== 'manufacturer') {
      throw new Error(`${name}.sourceOwnerType is invalid`)
    }
    if (typeof finding.reportedCarbs !== 'number' || !Number.isFinite(finding.reportedCarbs) || finding.reportedCarbs < 0) {
      throw new Error(`${name}.reportedCarbs must be a finite non-negative number`)
    }
    if (typeof finding.exactItemMatch !== 'boolean' || typeof finding.exactServingMatch !== 'boolean') {
      throw new Error(`${name} exact-match fields must be boolean`)
    }
    if (finding.publishedAt !== null && !Number.isFinite(Date.parse(requiredText(finding.publishedAt, `${name}.publishedAt`)))) {
      throw new Error(`${name}.publishedAt must be an ISO date`)
    }
    return {
      status: 'found',
      menuItemId: requiredText(finding.menuItemId, `${name}.menuItemId`),
      sourceKind: finding.sourceKind,
      sourceOwner: requiredText(finding.sourceOwner, `${name}.sourceOwner`),
      ownerId: requiredText(finding.ownerId, `${name}.ownerId`),
      sourceOwnerType: finding.sourceOwnerType,
      manufacturerRelationship: nullableText(finding.manufacturerRelationship, `${name}.manufacturerRelationship`),
      sourceUrl: requiredText(finding.sourceUrl, `${name}.sourceUrl`, 2_048),
      sourceLocator: nullableText(finding.sourceLocator, `${name}.sourceLocator`),
      sourceReportedItemName: requiredText(finding.sourceReportedItemName, `${name}.sourceReportedItemName`),
      reportedCarbs: finding.reportedCarbs,
      serving: parseServing(finding.serving, `${name}.serving`),
      exactItemMatch: finding.exactItemMatch,
      exactServingMatch: finding.exactServingMatch,
      publishedAt: finding.publishedAt as string | null,
      upstreamSourceKey: requiredText(finding.upstreamSourceKey, `${name}.upstreamSourceKey`),
      ...(finding.sourceExcerpt === undefined
        ? {}
        : { sourceExcerpt: requiredText(finding.sourceExcerpt, `${name}.sourceExcerpt`, 500) }),
    }
  }
  exactKeys(finding, RESULT_KEYS, name)
  const common = {
    menuItemId: requiredText(finding.menuItemId, `${name}.menuItemId`),
    detail: requiredText(finding.detail, `${name}.detail`, 500),
  }
  if (status === 'skipped') {
    if (typeof finding.reason !== 'string' || !SKIP_REASONS.has(finding.reason as ResearchSkipReason)) {
      throw new Error(`${name}.reason is not a valid skip reason`)
    }
    return { status, ...common, reason: finding.reason as ResearchSkipReason }
  }
  if (status === 'failed') {
    if (typeof finding.reason !== 'string' || !FAILURE_REASONS.has(finding.reason as ResearchFailureReason)) {
      throw new Error(`${name}.reason is not a valid failure reason`)
    }
    return { status, ...common, reason: finding.reason as ResearchFailureReason }
  }
  throw new Error(`${name}.status is invalid`)
}

function parseFindings(value: unknown): ResearchFindings {
  const findings = record(value, 'findings')
  exactKeys(findings, new Set(['schemaVersion', 'batchId', 'outcomes']), 'findings')
  if (findings.schemaVersion !== 1) throw new Error('findings.schemaVersion must be 1')
  if (!Array.isArray(findings.outcomes)) throw new Error('findings.outcomes must be an array')
  return {
    schemaVersion: 1,
    batchId: requiredText(findings.batchId, 'findings.batchId'),
    outcomes: findings.outcomes.map(parseFinding),
  }
}

function validateQueue(queue: ResearchQueue): void {
  if (queue.schemaVersion !== 1) throw new Error('queue.schemaVersion must be 1')
  if (queue.scope !== 'wdw' && queue.scope !== 'all-disney') throw new Error('queue.scope is invalid')
  if (!Number.isFinite(Date.parse(queue.catalogSnapshotAt))) throw new Error('queue.catalogSnapshotAt is invalid')
  const ids = new Set<string>()
  for (const item of queue.items) {
    if (ids.has(item.menuItemId)) throw new Error(`Queue contains duplicate menu item: ${item.menuItemId}`)
    if (!/^[a-f0-9]{64}$/i.test(item.catalogSnapshotHash)) throw new Error(`Queue item ${item.menuItemId} has an invalid catalog snapshot hash`)
    ids.add(item.menuItemId)
  }
}

function completeServing(finding: ResearchFoundFinding): boolean {
  return finding.serving.quantity != null
    && finding.serving.quantity > 0
    && finding.serving.unit != null
    && finding.serving.description != null
}

function reviewReasons(item: ResearchQueueItem, finding: ResearchFoundFinding): ResearchReviewReason[] {
  const reasons: ResearchReviewReason[] = []
  if (!completeServing(finding)) reasons.push('incomplete_serving')
  if (!finding.exactItemMatch) reasons.push('inexact_item_match')
  if (!finding.exactServingMatch) reasons.push('inexact_serving_match')
  if (isMaterialCarbDiscrepancy(item.currentCarbs, finding.reportedCarbs)) {
    reasons.push('material_carb_discrepancy')
  }
  return reasons
}

function sourceReviewReason(reason: string | undefined): ResearchReviewReason {
  return reason === 'owner_unverified' ? 'owner_unverified' : 'invalid_source'
}

function simpleOutcome(
  item: ResearchQueueItem,
  finding: ResearchSkippedFinding | ResearchFailedFinding,
): ResearchOutcome {
  return {
    status: finding.status,
    menuItemId: item.menuItemId,
    itemName: item.itemName,
    catalogSnapshotHash: item.catalogSnapshotHash,
    reason: finding.reason as never,
    detail: finding.detail,
  } as ResearchOutcome
}

function unresolvedFlag(
  item: ResearchQueueItem,
  finding: ResearchFoundFinding,
  resolved: ResolvedSource,
): ResearchEvidenceOutcome {
  return {
    status: 'flagged',
    menuItemId: item.menuItemId,
    itemName: item.itemName,
    catalogSnapshotHash: item.catalogSnapshotHash,
    currentCarbs: item.currentCarbs,
    sourceKind: finding.sourceKind as ResearchSourceKind,
    sourceOwner: finding.sourceOwner,
    sourceUrl: resolved.finalUrl,
    sourceLocator: finding.sourceLocator,
    sourceReportedItemName: finding.sourceReportedItemName,
    reportedCarbs: finding.reportedCarbs,
    serving: finding.serving,
    exactItemMatch: finding.exactItemMatch,
    exactServingMatch: finding.exactServingMatch,
    retrievedAt: null,
    publishedAt: finding.publishedAt,
    contentHash: null,
    upstreamSourceKey: finding.upstreamSourceKey,
    evidenceKey: null,
    ...(finding.sourceExcerpt == null ? {} : { sourceExcerpt: finding.sourceExcerpt }),
    reviewReasons: [sourceReviewReason(resolved.reason)],
  }
}

function evidenceOutcome(
  item: ResearchQueueItem,
  finding: ResearchFoundFinding,
  resolved: ResolvedSource,
  sourceReason?: ResearchReviewReason,
): ResearchEvidenceOutcome {
  if (!resolved.retrievedAt || !resolved.contentHash) return unresolvedFlag(item, finding, resolved)
  const reasons = reviewReasons(item, finding)
  if (sourceReason) reasons.push(sourceReason)
  const candidate = buildEvidenceCandidate({
    menuItemId: item.menuItemId,
    itemName: item.itemName,
    reportedItemName: finding.sourceReportedItemName,
    sourceKind: finding.sourceKind as EvidenceSourceKind,
    sourceName: finding.sourceOwner,
    sourceUrl: resolved.finalUrl,
    sourceLocator: finding.sourceLocator,
    upstreamSourceKey: finding.upstreamSourceKey,
    carbs: finding.reportedCarbs,
    serving: finding.serving,
    exactItemMatch: finding.exactItemMatch,
    exactServingMatch: finding.exactServingMatch,
    retrievedAt: resolved.retrievedAt,
    publishedAt: finding.publishedAt,
    contentHash: resolved.contentHash,
    note: sourceReason ? `Source validation requires review: ${sourceReason}` : null,
  })
  return {
    status: reasons.length === 0 ? 'accepted' : 'flagged',
    menuItemId: item.menuItemId,
    itemName: item.itemName,
    catalogSnapshotHash: item.catalogSnapshotHash,
    currentCarbs: item.currentCarbs,
    sourceKind: finding.sourceKind as ResearchSourceKind,
    sourceOwner: finding.sourceOwner,
    sourceUrl: resolved.finalUrl,
    sourceLocator: finding.sourceLocator,
    sourceReportedItemName: candidate.evidenceRow.reported_item_name,
    reportedCarbs: candidate.evidenceRow.reported_carbs,
    serving: finding.serving,
    exactItemMatch: finding.exactItemMatch,
    exactServingMatch: finding.exactServingMatch,
    retrievedAt: candidate.evidenceRow.retrieved_at,
    publishedAt: candidate.evidenceRow.published_at,
    contentHash: candidate.evidenceRow.content_hash,
    upstreamSourceKey: candidate.evidenceRow.upstream_source_key,
    evidenceKey: candidate.evidenceRow.evidence_key,
    ...(finding.sourceExcerpt == null ? {} : { sourceExcerpt: finding.sourceExcerpt }),
    reviewReasons: [...new Set(reasons)].sort(),
  }
}

function addConflictFlags(outcomes: ResearchOutcome[]): ResearchOutcome[] {
  const evidence = outcomes.filter((outcome): outcome is ResearchEvidenceOutcome =>
    outcome.status === 'accepted' || outcome.status === 'flagged')
  const groups = new Map<string, ResearchEvidenceOutcome[]>()
  for (const outcome of evidence) {
    const serving = `${outcome.serving.quantity}|${outcome.serving.unit}|${outcome.serving.description}`
    const key = `${outcome.upstreamSourceKey}|${outcome.sourceReportedItemName}|${serving}`
    groups.set(key, [...(groups.get(key) ?? []), outcome])
  }
  const conflicting = new Set<ResearchEvidenceOutcome>()
  for (const group of groups.values()) {
    if (new Set(group.map(outcome => outcome.reportedCarbs)).size > 1) group.forEach(outcome => conflicting.add(outcome))
  }
  return outcomes.map(outcome => {
    if (!conflicting.has(outcome as ResearchEvidenceOutcome)) return outcome
    const candidate = outcome as ResearchEvidenceOutcome
    return {
      ...candidate,
      status: 'flagged',
      reviewReasons: [...new Set([...candidate.reviewReasons, 'conflicting_observation' as const])].sort(),
    }
  })
}

export async function buildResearchBatch(
  queue: ResearchQueue,
  findingsValue: ResearchFindings | unknown,
  dependencies: ResearchFindingsDependencies = {},
): Promise<ResearchBatchBuildResult> {
  validateQueue(queue)
  const findings = parseFindings(findingsValue)
  if (findings.batchId !== queue.batchId) throw new Error('Findings batchId does not match queue batchId')
  const queueById = new Map(queue.items.map(item => [item.menuItemId, item]))
  const seen = new Set<string>()
  for (const finding of findings.outcomes) {
    if (!queueById.has(finding.menuItemId)) throw new Error(`Finding references unknown menu item: ${finding.menuItemId}`)
    if (seen.has(finding.menuItemId)) throw new Error(`Findings contain duplicate menu item: ${finding.menuItemId}`)
    seen.add(finding.menuItemId)
  }
  if (seen.size !== queue.items.length) throw new Error('Findings must contain exactly one outcome for every queue item')

  const resolveSource = dependencies.resolveSource ?? (input => resolveAndValidateSource(input))
  const outcomes: ResearchOutcome[] = []
  for (const finding of findings.outcomes) {
    const item = queueById.get(finding.menuItemId)!
    if (finding.status !== 'found') {
      outcomes.push(simpleOutcome(item, finding))
      continue
    }
    const resolved = await resolveSource({
      sourceUrl: finding.sourceUrl,
      ownerId: finding.ownerId,
      sourceOwnerType: finding.sourceOwnerType,
      venueName: item.restaurantName,
      manufacturerRelationship: finding.manufacturerRelationship,
    })
    if (!resolved.valid && resolved.reason === 'source_unavailable') {
      outcomes.push({
        status: 'failed',
        menuItemId: item.menuItemId,
        itemName: item.itemName,
        catalogSnapshotHash: item.catalogSnapshotHash,
        reason: 'source_unavailable',
        detail: 'The first-party source was unavailable after bounded retries.',
      })
      continue
    }
    outcomes.push(evidenceOutcome(
      item,
      finding,
      resolved,
      resolved.valid ? undefined : sourceReviewReason(resolved.reason),
    ))
  }

  const batch = parseResearchBatch({
    schemaVersion: 1,
    batchId: queue.batchId,
    scope: queue.scope,
    catalogSnapshotAt: queue.catalogSnapshotAt,
    generatedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
    outcomes: addConflictFlags(outcomes),
  })
  const counts = {
    accepted: batch.outcomes.filter(outcome => outcome.status === 'accepted').length,
    flagged: batch.outcomes.filter(outcome => outcome.status === 'flagged').length,
    skipped: batch.outcomes.filter(outcome => outcome.status === 'skipped').length,
    failed: batch.outcomes.filter(outcome => outcome.status === 'failed').length,
  }
  return {
    batch,
    counts,
    shouldOpenPullRequest: counts.accepted + counts.flagged > 0,
    blocksAutoMerge: counts.flagged > 0,
  }
}

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name)
  if (!value) throw new Error(`Missing required option ${name}`)
  return value
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, path)
}

function markdownSummary(result: ResearchBatchBuildResult): string {
  const { batch, counts } = result
  const lines = [
    `# Nutrition research batch ${batch.batchId}`,
    '',
    `- Accepted: ${counts.accepted}`,
    `- Flagged: ${counts.flagged}`,
    `- Skipped: ${counts.skipped}`,
    `- Failed: ${counts.failed}`,
    '',
  ]
  for (const outcome of batch.outcomes) {
    if (outcome.status === 'accepted' || outcome.status === 'flagged') {
      lines.push(`- **${outcome.itemName}** — ${outcome.reportedCarbs} g carbs — [source](${outcome.sourceUrl})${outcome.reviewReasons.length ? ` — ${outcome.reviewReasons.join(', ')}` : ''}`)
    } else {
      lines.push(`- **${outcome.itemName}** — ${outcome.status}:${outcome.reason}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export async function runResearchFindingsCli(
  args: string[],
  dependencies: ResearchFindingsCliDependencies = {},
): Promise<ResearchBatchBuildResult & { runtimeOut: string; commitOut: string | null; summaryOut: string | null }> {
  const queuePath = requiredOption(args, '--queue')
  const findingsPath = requiredOption(args, '--findings')
  const runtimeOut = requiredOption(args, '--runtime-out')
  const commitOut = requiredOption(args, '--commit-out')
  const summaryOut = requiredOption(args, '--summary-out')
  const result = await buildResearchBatch(
    readJson(queuePath) as ResearchQueue,
    readJson(findingsPath),
    dependencies,
  )
  atomicWrite(runtimeOut, stableResearchJson(result.batch))
  if (result.shouldOpenPullRequest) {
    atomicWrite(commitOut, stableResearchJson(result.batch))
    atomicWrite(summaryOut, markdownSummary(result))
  }
  const output = {
    ...result,
    runtimeOut,
    commitOut: result.shouldOpenPullRequest ? commitOut : null,
    summaryOut: result.shouldOpenPullRequest ? summaryOut : null,
  }
  ;(dependencies.writeStdout ?? (value => process.stdout.write(value)))(`${JSON.stringify({
    batchId: result.batch.batchId,
    ...result.counts,
    shouldOpenPullRequest: result.shouldOpenPullRequest,
    blocksAutoMerge: result.blocksAutoMerge,
    runtimeOut: output.runtimeOut,
    commitOut: output.commitOut,
    summaryOut: output.summaryOut,
  })}\n`)
  return output
}
