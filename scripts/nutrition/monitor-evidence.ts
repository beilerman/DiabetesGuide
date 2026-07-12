export interface EvidenceMonitorTarget {
  id: string
  menuItemId: string
  sourceUrl: string
  contentHash: string | null
  upstreamSourceKey: string | null
  reportedItemName: string | null
  servingDescription: string | null
}

export interface EvidenceObservation {
  ok: boolean
  httpStatus: number | null
  resolvedUrl: string
  contentHash: string | null
  reportedItemName: string | null
  servingDescription: string | null
}

export interface EvidenceCheckResult {
  sourceId: string
  status: 'unchanged' | 'changed' | 'unavailable' | 'redirected'
  reviewRequired: boolean
  reasons: string[]
  observation: EvidenceObservation
}

export interface CertificationExpiryTarget {
  certificationId: string
  menuItemId: string
  expiresAt: string
  priority: number
}

export interface CertificationReviewQueueEntry extends CertificationExpiryTarget {
  reason: 'expires_within_30_days' | 'monthly_high_impact_sample'
}

function normalized(value: string | null): string | null {
  const text = value?.trim().replace(/\s+/g, ' ')
  return text ? text.toLocaleLowerCase() : null
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.trim().replace(/\/$/, '')
  }
}

export function evaluateEvidenceCheck(
  target: EvidenceMonitorTarget,
  observation: EvidenceObservation,
): EvidenceCheckResult {
  const reasons: string[] = []
  if (!observation.ok) reasons.push('source is unavailable')
  if (target.contentHash && observation.contentHash && target.contentHash !== observation.contentHash) {
    reasons.push('source content hash changed')
  }
  if (normalized(target.reportedItemName) !== normalized(observation.reportedItemName)) {
    reasons.push('source item identity changed')
  }
  if (normalized(target.servingDescription) !== normalized(observation.servingDescription)) {
    reasons.push('source serving basis changed')
  }
  const redirected = comparableUrl(target.sourceUrl) !== comparableUrl(observation.resolvedUrl)
  if (redirected) reasons.push('source URL redirected')

  const contentChanged = reasons.some(reason =>
    reason === 'source content hash changed'
    || reason === 'source item identity changed'
    || reason === 'source serving basis changed')
  const status = !observation.ok
    ? 'unavailable'
    : contentChanged
      ? 'changed'
      : redirected
        ? 'redirected'
        : 'unchanged'

  return {
    sourceId: target.id,
    status,
    reviewRequired: status !== 'unchanged',
    reasons,
    observation,
  }
}

export function evidenceBlastRadius(
  targets: EvidenceMonitorTarget[],
  changedSourceId: string,
): string[] {
  const changed = targets.find(target => target.id === changedSourceId)
  if (!changed) return []
  const affected = changed.upstreamSourceKey
    ? targets.filter(target => target.upstreamSourceKey === changed.upstreamSourceKey)
    : [changed]
  return [...new Set(affected.map(target => target.menuItemId))].sort()
}

export function buildExpiryQueue(
  targets: CertificationExpiryTarget[],
  now: Date,
): CertificationReviewQueueEntry[] {
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  const queue: CertificationReviewQueueEntry[] = []
  const queued = new Set<string>()

  for (const target of targets) {
    const expiresAt = new Date(target.expiresAt)
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() - now.getTime() <= thirtyDays) {
      queue.push({ ...target, reason: 'expires_within_30_days' })
      queued.add(target.certificationId)
    }
  }

  const remaining = targets
    .filter(target => !queued.has(target.certificationId))
    .sort((first, second) => second.priority - first.priority || first.certificationId.localeCompare(second.certificationId))
  const sampleSize = remaining.length === 0 ? 0 : Math.max(1, Math.ceil(targets.length * 0.1))
  for (const target of remaining.slice(0, sampleSize)) {
    queue.push({ ...target, reason: 'monthly_high_impact_sample' })
  }

  return queue.sort((first, second) => second.priority - first.priority || first.certificationId.localeCompare(second.certificationId))
}
