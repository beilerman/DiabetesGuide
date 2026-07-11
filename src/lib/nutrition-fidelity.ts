export type CertificationTier = 'A' | 'B' | 'C' | 'D'
export type CertificationStatus = 'approved' | 'rejected' | 'quarantined'
export type EvidenceSourceType =
  | 'official_restaurant'
  | 'manufacturer'
  | 'government_database'
  | 'third_party_database'
  | 'editorial'
  | 'recipe_calculation'
  | 'ai_estimate'
  | 'other'

export interface ServingBasis {
  quantity: number | null
  unit: string | null
  description: string | null
}

export interface NutritionEvidence {
  id: string
  sourceType: EvidenceSourceType
  upstreamSourceKey: string | null
  carbs: number
  serving: ServingBasis
  exactItemMatch: boolean
  exactServingMatch: boolean
}

export interface CertificationCandidate {
  tier: CertificationTier
  status: CertificationStatus
  canonicalCarbs: number | null
  serving: ServingBasis
  evidence: NutritionEvidence[]
  reviewedAt: string
  expiresAt: string | null
  isMultiServing: boolean
  isConfigurable: boolean
  hasFixedConfiguration: boolean
}

export interface CertificationAssessment {
  eligible: boolean
  dosingGrade: boolean
  reasons: string[]
}

const DOSING_GRADE_TIERS = new Set<CertificationTier>(['A', 'B'])
const EXACT_PRIMARY_SOURCE_TYPES = new Set<EvidenceSourceType>([
  'official_restaurant',
  'manufacturer',
])
const TIER_RANK: Record<CertificationTier, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
}

function isNonEmpty(value: string | null): boolean {
  return value != null && value.trim().length > 0
}

function validDate(value: string | null): Date | null {
  if (value == null) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isValidCarbValue(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value >= 0
}

export function hasCompleteServing(serving: ServingBasis): boolean {
  return serving.quantity != null
    && Number.isFinite(serving.quantity)
    && serving.quantity > 0
    && isNonEmpty(serving.unit)
    && isNonEmpty(serving.description)
}

/** Internal review tolerance, not a claim about labeling or biological precision. */
export function agreementTolerance(firstCarbs: number, secondCarbs: number): number {
  return Math.max(2, Math.max(firstCarbs, secondCarbs) * 0.1)
}

export function carbValuesAgree(firstCarbs: number, secondCarbs: number): boolean {
  if (!isValidCarbValue(firstCarbs) || !isValidCarbValue(secondCarbs)) return false
  return Math.abs(firstCarbs - secondCarbs) <= agreementTolerance(firstCarbs, secondCarbs)
}

export function areIndependentEvidence(
  first: NutritionEvidence,
  second: NutritionEvidence,
): boolean {
  return isNonEmpty(first.upstreamSourceKey)
    && isNonEmpty(second.upstreamSourceKey)
    && first.upstreamSourceKey !== second.upstreamSourceKey
}

function isExactEvidence(item: NutritionEvidence): boolean {
  return item.exactItemMatch
    && item.exactServingMatch
    && isValidCarbValue(item.carbs)
    && hasCompleteServing(item.serving)
}

function hasExactPrimarySource(evidence: NutritionEvidence[]): boolean {
  return evidence.some(item => isExactEvidence(item) && EXACT_PRIMARY_SOURCE_TYPES.has(item.sourceType))
}

function hasIndependentAgreeingPair(
  evidence: NutritionEvidence[],
  canonicalCarbs: number,
): boolean {
  for (let firstIndex = 0; firstIndex < evidence.length; firstIndex++) {
    const first = evidence[firstIndex]
    if (!first || !isExactEvidence(first) || !carbValuesAgree(first.carbs, canonicalCarbs)) continue

    for (let secondIndex = firstIndex + 1; secondIndex < evidence.length; secondIndex++) {
      const second = evidence[secondIndex]
      if (!second || !isExactEvidence(second)) continue
      if (!areIndependentEvidence(first, second)) continue
      if (!carbValuesAgree(second.carbs, canonicalCarbs)) continue
      if (!carbValuesAgree(first.carbs, second.carbs)) continue
      return true
    }
  }

  return false
}

export function assessCertification(
  candidate: CertificationCandidate,
  now: Date,
): CertificationAssessment {
  const reasons: string[] = []
  const canonicalCarbs = candidate.canonicalCarbs
  const reviewedAt = validDate(candidate.reviewedAt)
  const expiresAt = validDate(candidate.expiresAt)

  if (candidate.status !== 'approved') reasons.push('decision is not approved')
  if (!isValidCarbValue(candidate.canonicalCarbs)) reasons.push('canonical carbs are invalid')
  if (!hasCompleteServing(candidate.serving)) reasons.push('serving basis is incomplete')
  if (!reviewedAt) reasons.push('review timestamp is invalid')
  if (!expiresAt || expiresAt <= now) reasons.push('certification is expired or has no expiry')
  if ((candidate.isMultiServing || candidate.isConfigurable) && !candidate.hasFixedConfiguration) {
    reasons.push('multi-serving or configurable item has no fixed configuration')
  }
  if (candidate.evidence.length === 0) reasons.push('no evidence is linked')

  if (DOSING_GRADE_TIERS.has(candidate.tier) && isValidCarbValue(canonicalCarbs)) {
    if (!hasExactPrimarySource(candidate.evidence)) {
      reasons.push('no exact restaurant or manufacturer evidence is linked')
    }

    if (candidate.tier === 'A') {
      const exactPrimaryAgrees = candidate.evidence.some(item =>
        isExactEvidence(item)
        && EXACT_PRIMARY_SOURCE_TYPES.has(item.sourceType)
        && Math.round(item.carbs) === canonicalCarbs,
      )
      if (!exactPrimaryAgrees) reasons.push('Tier A evidence does not match canonical carbs')
    }

    if (candidate.tier === 'B' && !hasIndependentAgreeingPair(candidate.evidence, canonicalCarbs)) {
      reasons.push('Tier B lacks two independent agreeing observations')
    }
  }

  const eligible = reasons.length === 0
  return {
    eligible,
    dosingGrade: eligible && DOSING_GRADE_TIERS.has(candidate.tier),
    reasons,
  }
}

export function isActiveDosingGrade(candidate: CertificationCandidate, now: Date): boolean {
  return assessCertification(candidate, now).dosingGrade
}

export function shouldReplaceCertification(
  current: CertificationCandidate | null,
  candidate: CertificationCandidate,
  now: Date,
): boolean {
  if (!isActiveDosingGrade(candidate, now)) return false
  if (current == null || !isActiveDosingGrade(current, now)) return true
  if (TIER_RANK[candidate.tier] < TIER_RANK[current.tier]) return false

  const currentReviewedAt = validDate(current.reviewedAt)
  const candidateReviewedAt = validDate(candidate.reviewedAt)
  if (!currentReviewedAt || !candidateReviewedAt) return false
  return candidateReviewedAt > currentReviewedAt
}
