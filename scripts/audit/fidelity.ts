import {
  assessCertification,
  carbValuesAgree,
  hasCompleteServing,
} from '../../src/lib/nutrition-fidelity.js'
import type {
  CertificationStatus,
  CertificationTier,
  EvidenceSourceType,
  NutritionEvidence,
  ServingBasis,
} from '../../src/lib/nutrition-fidelity.js'
import { dosingPriorityScore } from './trust.js'

export interface FidelityEvidence extends NutritionEvidence {
  retrievable: boolean
}

export interface FidelityCertification {
  id: string
  tier: CertificationTier
  status: CertificationStatus
  canonicalCarbs: number | null
  serving: ServingBasis
  reviewedAt: string
  expiresAt: string | null
  evidence: FidelityEvidence[]
}

export interface FidelityItem {
  id: string
  name: string
  category: string | null
  parkLocation: string | null
  carbs: number | null
  serving: ServingBasis
  certification: FidelityCertification | null
  isMultiServing: boolean
  isConfigurable: boolean
  hasFixedConfiguration: boolean
}

export interface PreviousCertifiedValue {
  certificationId: string
  carbs: number | null
}

export interface FidelityFinding {
  menuItemId: string
  itemName: string
  checkName: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  message: string
}

export interface FidelityReport {
  generatedAt: string
  metrics: {
    totalItems: number
    dosingGradeCount: number
    dosingGradePct: number
    dosingImpactWeightedPct: number
    explicitServingCount: number
    retrievableProvenanceCount: number
    quarantinedCount: number
    expiredCount: number
    upcomingExpiryCount: number
    sourceConflictCount: number
    certifiedValueRegressionCount: number
    tiers: Record<CertificationTier | 'unreviewed', number>
  }
  findings: FidelityFinding[]
  reviewQueue: Array<{
    menuItemId: string
    itemName: string
    priority: number
  }>
}

const UPCOMING_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 10_000) / 100
}

function dateOrNull(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function canonicalServingMatches(item: FidelityItem): boolean {
  const certification = item.certification
  if (!certification) return false
  return item.carbs === certification.canonicalCarbs
    && item.serving.quantity === certification.serving.quantity
    && item.serving.unit === certification.serving.unit
    && item.serving.description === certification.serving.description
}

function evidenceHasConflict(evidence: FidelityEvidence[]): boolean {
  for (let firstIndex = 0; firstIndex < evidence.length; firstIndex++) {
    const first = evidence[firstIndex]
    if (!first) continue
    for (let secondIndex = firstIndex + 1; secondIndex < evidence.length; secondIndex++) {
      const second = evidence[secondIndex]
      if (second && !carbValuesAgree(first.carbs, second.carbs)) return true
    }
  }
  return false
}

function finding(
  item: FidelityItem,
  checkName: string,
  severity: FidelityFinding['severity'],
  message: string,
): FidelityFinding {
  return { menuItemId: item.id, itemName: item.name, checkName, severity, message }
}

export function calculateFidelityReport(
  items: FidelityItem[],
  now: Date,
  previousValues: Record<string, PreviousCertifiedValue> = {},
): FidelityReport {
  const findings: FidelityFinding[] = []
  const reviewQueue: FidelityReport['reviewQueue'] = []
  const tiers: FidelityReport['metrics']['tiers'] = { A: 0, B: 0, C: 0, D: 0, unreviewed: 0 }
  let dosingGradeCount = 0
  let dosingGradeWeight = 0
  let totalWeight = 0
  let explicitServingCount = 0
  let retrievableProvenanceCount = 0
  let quarantinedCount = 0
  let expiredCount = 0
  let upcomingExpiryCount = 0
  let sourceConflictCount = 0
  let certifiedValueRegressionCount = 0

  for (const item of items) {
    const weight = dosingPriorityScore(item.category, item.parkLocation, item.carbs)
    totalWeight += weight
    if (hasCompleteServing(item.serving)) explicitServingCount++

    const certification = item.certification
    if (!certification) {
      tiers.unreviewed++
      reviewQueue.push({ menuItemId: item.id, itemName: item.name, priority: weight })
      continue
    }

    tiers[certification.tier]++
    if (certification.status === 'quarantined') quarantinedCount++

    const expiresAt = dateOrNull(certification.expiresAt)
    const isExpired = expiresAt == null || expiresAt <= now
    if (isExpired) {
      expiredCount++
      findings.push(finding(item, 'expired_certification', 'HIGH', 'Active certification is expired or lacks a valid expiry.'))
    } else if (expiresAt.getTime() - now.getTime() <= UPCOMING_EXPIRY_MS) {
      upcomingExpiryCount++
      findings.push(finding(item, 'certification_expiring', 'LOW', 'Certification expires within 30 days.'))
    }

    if (certification.evidence.length > 0 && certification.evidence.every(entry => entry.retrievable)) {
      retrievableProvenanceCount++
    } else if (certification.evidence.some(entry => !entry.retrievable)) {
      findings.push(finding(item, 'evidence_unavailable', 'MEDIUM', 'One or more certification sources are unavailable.'))
    }

    if (evidenceHasConflict(certification.evidence)) {
      sourceConflictCount++
      findings.push(finding(item, 'source_conflict', 'HIGH', 'Linked evidence values exceed the agreement tolerance.'))
    }

    const assessment = assessCertification({
      tier: certification.tier,
      status: certification.status,
      canonicalCarbs: certification.canonicalCarbs,
      serving: certification.serving,
      evidence: certification.evidence,
      reviewedAt: certification.reviewedAt,
      expiresAt: certification.expiresAt,
      isMultiServing: item.isMultiServing,
      isConfigurable: item.isConfigurable,
      hasFixedConfiguration: item.hasFixedConfiguration,
    }, now)

    const servingMatches = canonicalServingMatches(item)
    if (!servingMatches) {
      findings.push(finding(item, 'canonical_serving_mismatch', 'HIGH', 'Canonical carbs or serving differs from its certification decision.'))
    }
    if (!assessment.eligible) {
      findings.push(finding(item, 'invalid_active_certification', 'HIGH', assessment.reasons.join('; ')))
    }

    const dosingGrade = assessment.dosingGrade && servingMatches
    if (dosingGrade) {
      dosingGradeCount++
      dosingGradeWeight += weight
    } else {
      reviewQueue.push({ menuItemId: item.id, itemName: item.name, priority: weight })
    }

    const previous = previousValues[item.id]
    if (previous
      && previous.certificationId === certification.id
      && previous.carbs !== item.carbs) {
      certifiedValueRegressionCount++
      findings.push(finding(item, 'certified_value_regression', 'HIGH', 'Carbs changed without a new certification decision.'))
    }
  }

  reviewQueue.sort((first, second) => second.priority - first.priority || first.menuItemId.localeCompare(second.menuItemId))

  return {
    generatedAt: now.toISOString(),
    metrics: {
      totalItems: items.length,
      dosingGradeCount,
      dosingGradePct: percentage(dosingGradeCount, items.length),
      dosingImpactWeightedPct: percentage(dosingGradeWeight, totalWeight),
      explicitServingCount,
      retrievableProvenanceCount,
      quarantinedCount,
      expiredCount,
      upcomingExpiryCount,
      sourceConflictCount,
      certifiedValueRegressionCount,
      tiers,
    },
    findings,
    reviewQueue,
  }
}

export type { EvidenceSourceType }
