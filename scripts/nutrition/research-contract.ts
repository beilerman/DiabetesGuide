export const RESEARCH_SCHEMA_VERSION = 1 as const

export type ResearchScope = 'wdw' | 'all-disney'
export type ResearchStatus = 'accepted' | 'flagged' | 'skipped' | 'failed'
export type ResearchSourceKind = 'official_research' | 'manufacturer_research'

export type ResearchReviewReason =
  | 'material_carb_discrepancy'
  | 'owner_unverified'
  | 'ambiguous_item'
  | 'incomplete_serving'
  | 'inexact_item_match'
  | 'inexact_serving_match'
  | 'conflicting_observation'
  | 'source_drift'
  | 'catalog_drift'
  | 'invalid_source'

export type ResearchSkipReason =
  | 'no_first_party_source'
  | 'already_evidenced'
  | 'not_in_scope'
  | 'pending_research'

export type ResearchFailureReason =
  | 'source_unavailable'
  | 'rate_limited'
  | 'invalid_response'
  | 'research_error'

export interface ResearchServing {
  quantity: number | null
  unit: string | null
  description: string | null
}

interface ResearchOutcomeBase {
  status: ResearchStatus
  menuItemId: string
  itemName: string
  catalogSnapshotHash: string
}

export interface ResearchEvidenceOutcome extends ResearchOutcomeBase {
  status: 'accepted' | 'flagged'
  currentCarbs: number | null
  sourceKind: ResearchSourceKind
  sourceOwner: string
  ownerId: string
  sourceOwnerType: 'destination' | 'chain' | 'manufacturer'
  manufacturerRelationship: string | null
  sourceUrl: string
  sourceLocator: string | null
  sourceReportedItemName: string
  reportedCarbs: number
  serving: ResearchServing
  exactItemMatch: boolean
  exactServingMatch: boolean
  retrievedAt: string | null
  publishedAt: string | null
  contentHash: string | null
  upstreamSourceKey: string
  evidenceKey: string | null
  sourceExcerpt?: string
  reviewReasons: ResearchReviewReason[]
}

export interface ResearchSkippedOutcome extends ResearchOutcomeBase {
  status: 'skipped'
  reason: ResearchSkipReason
  detail: string
}

export interface ResearchFailedOutcome extends ResearchOutcomeBase {
  status: 'failed'
  reason: ResearchFailureReason
  detail: string
}

export type ResearchOutcome =
  | ResearchEvidenceOutcome
  | ResearchSkippedOutcome
  | ResearchFailedOutcome

export interface ResearchBatch {
  schemaVersion: 1
  batchId: string
  scope: ResearchScope
  catalogSnapshotAt: string
  generatedAt: string
  outcomes: ResearchOutcome[]
}

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'batchId',
  'scope',
  'catalogSnapshotAt',
  'generatedAt',
  'outcomes',
])

const EVIDENCE_KEYS = new Set([
  'status',
  'menuItemId',
  'itemName',
  'catalogSnapshotHash',
  'currentCarbs',
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
  'retrievedAt',
  'publishedAt',
  'contentHash',
  'upstreamSourceKey',
  'evidenceKey',
  'sourceExcerpt',
  'reviewReasons',
])

const RESULT_KEYS = new Set(['status', 'menuItemId', 'itemName', 'catalogSnapshotHash', 'reason', 'detail'])
const SERVING_KEYS = new Set(['quantity', 'unit', 'description'])
const ALLOWED_SOURCE_KINDS = new Set<ResearchSourceKind>([
  'official_research',
  'manufacturer_research',
])
const REVIEW_REASONS = new Set<ResearchReviewReason>([
  'material_carb_discrepancy',
  'owner_unverified',
  'ambiguous_item',
  'incomplete_serving',
  'inexact_item_match',
  'inexact_serving_match',
  'conflicting_observation',
  'source_drift',
  'catalog_drift',
  'invalid_source',
])
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be an object`)
  return value
}

function assertExactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, name: string): void {
  const unexpected = Object.keys(record).find(key => !allowed.has(key))
  if (unexpected) throw new Error(`${name} contains unexpected field: ${unexpected}`)
}

function requireString(value: unknown, name: string, maxLength = 500): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string`)
  if (value.length > maxLength) throw new Error(`${name} exceeds ${maxLength} characters`)
  return value
}

function requireNullableString(value: unknown, name: string): string | null {
  if (value === null) return null
  return requireString(value, name)
}

function requireIsoDate(value: unknown, name: string): string {
  const text = requireString(value, name)
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${name} must be an ISO date`)
  return text
}

function requireNullableIsoDate(value: unknown, name: string): string | null {
  if (value === null) return null
  return requireIsoDate(value, name)
}

function requireNonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`)
  }
  return value
}

function requireNullableNonNegativeNumber(value: unknown, name: string): number | null {
  if (value === null) return null
  return requireNonNegativeNumber(value, name)
}

function requireHash(value: unknown, name: string): string {
  const text = requireString(value, name)
  if (!/^[a-f0-9]{64}$/i.test(text)) throw new Error(`${name} must be a SHA-256 hash`)
  return text.toLowerCase()
}

function requireHttpsUrl(value: unknown, name: string): string {
  const text = requireString(value, name, 2_048)
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS`)
  return text
}

function scanForSecrets(value: unknown, path = 'batch'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSecrets(item, `${path}[${index}]`))
    return
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (/(?:api[_-]?key|service[_-]?role|password|secret|access[_-]?token|refresh[_-]?token)/i.test(key)) {
        throw new Error(`${path}.${key} may contain a secret`)
      }
      scanForSecrets(item, `${path}.${key}`)
    }
    return
  }
  if (typeof value === 'string' && /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(value)) {
    throw new Error(`${path} contains a JWT-like secret`)
  }
}

function parseServing(value: unknown, name: string): ResearchServing {
  const record = requireRecord(value, name)
  assertExactKeys(record, SERVING_KEYS, name)
  const quantity = record.quantity === null ? null : requireNonNegativeNumber(record.quantity, `${name}.quantity`)
  const unit = record.unit === null ? null : requireString(record.unit, `${name}.unit`)
  const description = record.description === null
    ? null
    : requireString(record.description, `${name}.description`)
  return { quantity, unit, description }
}

function hasCompleteServing(serving: ResearchServing): boolean {
  return serving.quantity != null && serving.quantity > 0 && serving.unit != null && serving.description != null
}

function parseEvidenceOutcome(record: Record<string, unknown>, index: number): ResearchEvidenceOutcome {
  const name = `outcomes[${index}]`
  assertExactKeys(record, EVIDENCE_KEYS, name)
  const status = record.status
  if (status !== 'accepted' && status !== 'flagged') throw new Error(`${name}.status is invalid`)
  const sourceKind = record.sourceKind
  if (typeof sourceKind !== 'string' || !ALLOWED_SOURCE_KINDS.has(sourceKind as ResearchSourceKind)) {
    throw new Error(`${name}.sourceKind must be official_research or manufacturer_research`)
  }
  const serving = parseServing(record.serving, `${name}.serving`)
  const sourceOwnerType = record.sourceOwnerType
  if (sourceOwnerType !== 'destination' && sourceOwnerType !== 'chain' && sourceOwnerType !== 'manufacturer') {
    throw new Error(`${name}.sourceOwnerType is invalid`)
  }
  const manufacturerRelationship = requireNullableString(
    record.manufacturerRelationship,
    `${name}.manufacturerRelationship`,
  )
  if (sourceOwnerType === 'manufacturer' && manufacturerRelationship == null) {
    throw new Error(`${name}.manufacturerRelationship is required for manufacturer evidence`)
  }
  if (sourceOwnerType === 'manufacturer' && sourceKind !== 'manufacturer_research') {
    throw new Error(`${name}.sourceKind must be manufacturer_research for a manufacturer source`)
  }
  if (sourceOwnerType !== 'manufacturer' && sourceKind !== 'official_research') {
    throw new Error(`${name}.sourceKind must be official_research for a destination or chain source`)
  }
  const exactItemMatch = record.exactItemMatch
  const exactServingMatch = record.exactServingMatch
  if (typeof exactItemMatch !== 'boolean') throw new Error(`${name}.exactItemMatch must be boolean`)
  if (typeof exactServingMatch !== 'boolean') throw new Error(`${name}.exactServingMatch must be boolean`)
  if (!Array.isArray(record.reviewReasons)) throw new Error(`${name}.reviewReasons must be an array`)
  const reviewReasons = record.reviewReasons.map((reason, reasonIndex) => {
    if (typeof reason !== 'string' || !REVIEW_REASONS.has(reason as ResearchReviewReason)) {
      throw new Error(`${name}.reviewReasons[${reasonIndex}] is invalid`)
    }
    return reason as ResearchReviewReason
  })
  if (status === 'accepted') {
    if (!hasCompleteServing(serving)) throw new Error(`${name}.serving must be complete for accepted evidence`)
    if (!exactItemMatch) throw new Error(`${name}.exactItemMatch must be true for accepted evidence`)
    if (!exactServingMatch) throw new Error(`${name}.exactServingMatch must be true for accepted evidence`)
    if (reviewReasons.length > 0) throw new Error(`${name}.reviewReasons must be empty for accepted evidence`)
  } else if (reviewReasons.length === 0) {
    throw new Error(`${name}.reviewReasons must identify why evidence is flagged`)
  }

  const sourceExcerpt = record.sourceExcerpt === undefined
    ? undefined
    : requireString(record.sourceExcerpt, `${name}.sourceExcerpt`, 500)
  const retrievedAt = record.retrievedAt === null ? null : requireIsoDate(record.retrievedAt, `${name}.retrievedAt`)
  const contentHash = record.contentHash === null ? null : requireHash(record.contentHash, `${name}.contentHash`)
  const evidenceKey = record.evidenceKey === null ? null : requireHash(record.evidenceKey, `${name}.evidenceKey`)
  if (status === 'accepted' && (retrievedAt == null || contentHash == null || evidenceKey == null)) {
    throw new Error(`${name} accepted evidence requires retrievedAt, contentHash, and evidenceKey`)
  }
  if ((retrievedAt == null || contentHash == null || evidenceKey == null)
    && !reviewReasons.some(reason => reason === 'owner_unverified' || reason === 'invalid_source')) {
    throw new Error(`${name} missing provenance is allowed only for an unverified or invalid source`)
  }
  return {
    status,
    menuItemId: requireString(record.menuItemId, `${name}.menuItemId`),
    itemName: requireString(record.itemName, `${name}.itemName`),
    catalogSnapshotHash: requireHash(record.catalogSnapshotHash, `${name}.catalogSnapshotHash`),
    currentCarbs: requireNullableNonNegativeNumber(record.currentCarbs, `${name}.currentCarbs`),
    sourceKind: sourceKind as ResearchSourceKind,
    sourceOwner: requireString(record.sourceOwner, `${name}.sourceOwner`),
    ownerId: requireString(record.ownerId, `${name}.ownerId`),
    sourceOwnerType,
    manufacturerRelationship,
    sourceUrl: requireHttpsUrl(record.sourceUrl, `${name}.sourceUrl`),
    sourceLocator: requireNullableString(record.sourceLocator, `${name}.sourceLocator`),
    sourceReportedItemName: requireString(record.sourceReportedItemName, `${name}.sourceReportedItemName`),
    reportedCarbs: requireNonNegativeNumber(record.reportedCarbs, `${name}.reportedCarbs`),
    serving,
    exactItemMatch,
    exactServingMatch,
    retrievedAt,
    publishedAt: requireNullableIsoDate(record.publishedAt, `${name}.publishedAt`),
    contentHash,
    upstreamSourceKey: requireString(record.upstreamSourceKey, `${name}.upstreamSourceKey`),
    evidenceKey,
    ...(sourceExcerpt === undefined ? {} : { sourceExcerpt }),
    reviewReasons: [...new Set(reviewReasons)].sort(),
  }
}

function parseResultOutcome(record: Record<string, unknown>, index: number): ResearchSkippedOutcome | ResearchFailedOutcome {
  const name = `outcomes[${index}]`
  assertExactKeys(record, RESULT_KEYS, name)
  const common = {
    menuItemId: requireString(record.menuItemId, `${name}.menuItemId`),
    itemName: requireString(record.itemName, `${name}.itemName`),
    catalogSnapshotHash: requireHash(record.catalogSnapshotHash, `${name}.catalogSnapshotHash`),
    detail: requireString(record.detail, `${name}.detail`, 500),
  }
  if (record.status === 'skipped') {
    if (typeof record.reason !== 'string' || !SKIP_REASONS.has(record.reason as ResearchSkipReason)) {
      throw new Error(`${name}.reason is not a valid skip reason`)
    }
    return { status: 'skipped', ...common, reason: record.reason as ResearchSkipReason }
  }
  if (record.status === 'failed') {
    if (typeof record.reason !== 'string' || !FAILURE_REASONS.has(record.reason as ResearchFailureReason)) {
      throw new Error(`${name}.reason is not a valid failure reason`)
    }
    return { status: 'failed', ...common, reason: record.reason as ResearchFailureReason }
  }
  throw new Error(`${name}.status is invalid`)
}

function outcomeSortKey(outcome: ResearchOutcome): string {
  const discriminator = 'evidenceKey' in outcome ? outcome.evidenceKey : outcome.reason
  return `${outcome.menuItemId}\u0000${outcome.status}\u0000${discriminator}`
}

export function isMaterialCarbDiscrepancy(
  currentCarbs: number | null,
  foundCarbs: number,
): boolean {
  if (currentCarbs == null) return false
  const absolute = Math.abs(foundCarbs - currentCarbs)
  if (absolute > 10) return true
  if (currentCarbs === 0) return absolute > 0
  return absolute / Math.abs(currentCarbs) > 0.2
}

export function parseResearchBatch(value: unknown): ResearchBatch {
  scanForSecrets(value)
  const record = requireRecord(value, 'batch')
  assertExactKeys(record, TOP_LEVEL_KEYS, 'batch')
  if (record.schemaVersion !== RESEARCH_SCHEMA_VERSION) throw new Error('schemaVersion must be 1')
  if (record.scope !== 'wdw' && record.scope !== 'all-disney') throw new Error('scope is invalid')
  if (!Array.isArray(record.outcomes)) throw new Error('outcomes must be an array')
  const outcomes = record.outcomes.map((item, index) => {
    const outcome = requireRecord(item, `outcomes[${index}]`)
    return outcome.status === 'accepted' || outcome.status === 'flagged'
      ? parseEvidenceOutcome(outcome, index)
      : parseResultOutcome(outcome, index)
  })
  const duplicates = new Set<string>()
  for (const outcome of outcomes) {
    if (!('evidenceKey' in outcome) || outcome.evidenceKey == null) continue
    const key = `${outcome.menuItemId}\u0000${outcome.evidenceKey}`
    if (duplicates.has(key)) throw new Error(`duplicate menu item/evidence key pair: ${outcome.menuItemId}`)
    duplicates.add(key)
  }
  return {
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    batchId: requireString(record.batchId, 'batchId'),
    scope: record.scope,
    catalogSnapshotAt: requireIsoDate(record.catalogSnapshotAt, 'catalogSnapshotAt'),
    generatedAt: requireIsoDate(record.generatedAt, 'generatedAt'),
    outcomes: outcomes.sort((first, second) => outcomeSortKey(first).localeCompare(outcomeSortKey(second), 'en')),
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([first], [second]) => first.localeCompare(second, 'en'))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

export function stableResearchJson(value: unknown): string {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}
