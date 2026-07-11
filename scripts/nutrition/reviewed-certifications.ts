import { assessCertification } from '../../src/lib/nutrition-fidelity.js'
import type { CertificationCandidate, CertificationTier, ServingBasis } from '../../src/lib/nutrition-fidelity.js'

export interface ReviewedCertificationDecision {
  menuItemId: string
  tier: Extract<CertificationTier, 'A' | 'B'>
  canonicalCarbs: number
  serving: ServingBasis
  reviewerId: string
  reason: string
  reviewedAt: string
  expiresAt: string
  evidenceKeys: string[]
  expectedActiveCertificationId: string | null
}

export interface ReviewedCertificationArtifact {
  schemaVersion: 1
  decisions: ReviewedCertificationDecision[]
}

const TIER_RANK: Record<CertificationTier, number> = { A: 4, B: 3, C: 2, D: 1 }
const MAX_REVIEW_WINDOW_MS = 180 * 24 * 60 * 60 * 1000

export function validateReviewedDecision(
  decision: ReviewedCertificationDecision,
  candidate: CertificationCandidate,
  current: Pick<CertificationCandidate, 'tier'> | null,
  now: Date,
): string[] {
  const reasons = [...assessCertification(candidate, now).reasons]
  const reviewedAt = new Date(decision.reviewedAt)
  const expiresAt = new Date(decision.expiresAt)

  if (candidate.tier !== decision.tier) reasons.push('candidate tier does not match reviewed decision')
  if (candidate.canonicalCarbs !== decision.canonicalCarbs) reasons.push('candidate carbs do not match reviewed decision')
  if (candidate.serving.quantity !== decision.serving.quantity
    || candidate.serving.unit !== decision.serving.unit
    || candidate.serving.description !== decision.serving.description) {
    reasons.push('candidate serving does not match reviewed decision')
  }
  if (!decision.reviewerId.trim()) reasons.push('reviewer identifier is required')
  if (!decision.reason.trim()) reasons.push('review reason is required')
  if (decision.evidenceKeys.length === 0) reasons.push('at least one evidence key is required')
  if (Number.isNaN(reviewedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    reasons.push('review or expiry timestamp is invalid')
  } else if (expiresAt.getTime() - reviewedAt.getTime() > MAX_REVIEW_WINDOW_MS) {
    reasons.push('certification expiry exceeds 180 days')
  }
  if (current && TIER_RANK[decision.tier] < TIER_RANK[current.tier]) {
    reasons.push('decision would downgrade the active certification')
  }

  return [...new Set(reasons)]
}

export function parseReviewedArtifact(value: unknown): ReviewedCertificationArtifact {
  if (!value || typeof value !== 'object') throw new Error('Reviewed artifact must be an object')
  const artifact = value as Partial<ReviewedCertificationArtifact>
  if (artifact.schemaVersion !== 1 || !Array.isArray(artifact.decisions)) {
    throw new Error('Reviewed artifact must use schemaVersion 1 and include decisions')
  }
  return artifact as ReviewedCertificationArtifact
}
