import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CertificationCandidate, NutritionEvidence } from '../../src/lib/nutrition-fidelity.js'
import { createSupabaseClient, rootPath } from '../audit/utils.js'
import {
  parseReviewedArtifact,
  validateReviewedDecision,
} from './reviewed-certifications.js'
import type { ReviewedCertificationDecision } from './reviewed-certifications.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface EvidenceRow {
  id: string
  evidence_key: string
  source_type: NutritionEvidence['sourceType']
  upstream_source_key: string | null
  reported_carbs: number
  normalized_carbs: number | null
  serving_quantity: number | null
  serving_unit: string | null
  serving_description: string | null
  exact_item_match: boolean
  exact_serving_match: boolean
}

interface CanonicalRow {
  id: string
  menu_item_id: string
  carbs: number | null
  serving_quantity: number | null
  serving_unit: string | null
  serving_description: string | null
  active_certification_id: string | null
}

interface PublicationPlanEntry {
  decision: ReviewedCertificationDecision
  evidenceIds: string[]
  current: CanonicalRow | null
  currentTier: CertificationCandidate['tier'] | null
  errors: string[]
}

function multiServing(name: string, description: string | null): boolean {
  return /\b(dozen|whole|family|serves?\s+\d|sharing|sampler|flight|bucket|platter)\b/i.test(`${name} ${description ?? ''}`)
}

function configurable(name: string, description: string | null): boolean {
  return /\b(build your own|choose your|customi[sz]|choice of|create your own)\b/i.test(`${name} ${description ?? ''}`)
}

async function planDecision(decision: ReviewedCertificationDecision): Promise<PublicationPlanEntry> {
  const supabase = createSupabaseClient()
  const errors: string[] = []
  const [{ data: evidenceData, error: evidenceError }, { data: itemData, error: itemError }] = await Promise.all([
    supabase
      .from('nutrition_sources')
      .select(`id, evidence_key, source_type, upstream_source_key,
        reported_carbs, normalized_carbs, serving_quantity, serving_unit,
        serving_description, exact_item_match, exact_serving_match`)
      .eq('menu_item_id', decision.menuItemId)
      .in('evidence_key', decision.evidenceKeys),
    supabase
      .from('menu_items')
      .select(`id, name, description,
        nutritional_data(id, menu_item_id, carbs, serving_quantity, serving_unit,
          serving_description, active_certification_id)`)
      .eq('id', decision.menuItemId)
      .maybeSingle(),
  ])
  if (evidenceError) throw evidenceError
  if (itemError) throw itemError

  const evidenceRows = (evidenceData ?? []) as EvidenceRow[]
  if (evidenceRows.length !== decision.evidenceKeys.length) {
    errors.push('one or more evidence keys are missing, duplicated, or belong to another item')
  }
  const item = itemData as unknown as {
    name: string
    description: string | null
    nutritional_data: CanonicalRow[]
  } | null
  const current = item?.nutritional_data?.[0] ?? null
  if (!current) errors.push('menu item has no canonical nutrition row')
  if (current?.active_certification_id !== decision.expectedActiveCertificationId) {
    errors.push('active certification differs from the reviewed artifact')
  }

  let currentTier: CertificationCandidate['tier'] | null = null
  if (current?.active_certification_id) {
    const { data, error } = await supabase
      .from('nutrition_certifications')
      .select('tier')
      .eq('id', current.active_certification_id)
      .maybeSingle()
    if (error) throw error
    currentTier = (data?.tier as CertificationCandidate['tier'] | undefined) ?? null
  }

  const evidence: NutritionEvidence[] = evidenceRows.map(source => ({
    id: source.id,
    sourceType: source.source_type,
    upstreamSourceKey: source.upstream_source_key,
    carbs: source.normalized_carbs ?? source.reported_carbs,
    serving: {
      quantity: source.serving_quantity,
      unit: source.serving_unit,
      description: source.serving_description,
    },
    exactItemMatch: source.exact_item_match,
    exactServingMatch: source.exact_serving_match,
  }))
  const candidate: CertificationCandidate = {
    tier: decision.tier,
    status: 'approved',
    canonicalCarbs: decision.canonicalCarbs,
    serving: decision.serving,
    evidence,
    reviewedAt: decision.reviewedAt,
    expiresAt: decision.expiresAt,
    isMultiServing: item ? multiServing(item.name, item.description) : false,
    isConfigurable: item ? configurable(item.name, item.description) : false,
    hasFixedConfiguration: true,
  }
  errors.push(...validateReviewedDecision(
    decision,
    candidate,
    currentTier ? { tier: currentTier } : null,
    new Date(),
  ))

  return {
    decision,
    evidenceIds: evidenceRows.map(source => source.id),
    current,
    currentTier,
    errors: [...new Set(errors)],
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const fileArgument = process.argv.find(argument => argument.startsWith('--file='))
  if (!fileArgument) throw new Error('Pass --file=<reviewed-certification-artifact.json>')
  const artifactPath = resolve(__dirname, '..', '..', fileArgument.split('=')[1])
  const artifact = parseReviewedArtifact(JSON.parse(readFileSync(artifactPath, 'utf8')))
  const duplicateItems = artifact.decisions
    .map(decision => decision.menuItemId)
    .filter((itemId, index, all) => all.indexOf(itemId) !== index)
  if (duplicateItems.length > 0) throw new Error('Reviewed artifact contains duplicate menu-item decisions')

  const entries: PublicationPlanEntry[] = []
  for (const decision of artifact.decisions) entries.push(await planDecision(decision))
  const outputPath = rootPath('audit', 'certification-publish-plan.json')
  writeFileSync(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    sourceArtifact: fileArgument.split('=')[1],
    valid: entries.filter(entry => entry.errors.length === 0).length,
    invalid: entries.filter(entry => entry.errors.length > 0).length,
    entries,
  }, null, 2)}\n`, 'utf8')

  const invalid = entries.filter(entry => entry.errors.length > 0)
  if (invalid.length > 0) {
    throw new Error(`${invalid.length} reviewed decision(s) failed validation; inspect ${outputPath}`)
  }
  if (!apply) {
    console.log(`Validated ${entries.length} reviewed decision(s); no database writes.`)
    console.log(`Plan: ${outputPath}`)
    return
  }

  const undoPath = rootPath('audit', 'undo', `certification-publish-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  mkdirSync(dirname(undoPath), { recursive: true })
  writeFileSync(undoPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    note: 'Certification decisions are immutable. Rollback requires a reviewed superseding decision.',
    entries: entries.map(entry => ({ menuItemId: entry.decision.menuItemId, before: entry.current })),
  }, null, 2)}\n`, 'utf8')

  let applied = 0
  for (const entry of entries) {
    const decision = entry.decision
    const { error } = await createSupabaseClient().rpc('publish_nutrition_certification', {
      p_menu_item_id: decision.menuItemId,
      p_tier: decision.tier,
      p_canonical_carbs: decision.canonicalCarbs,
      p_serving_quantity: decision.serving.quantity,
      p_serving_unit: decision.serving.unit,
      p_serving_description: decision.serving.description,
      p_reviewer_id: decision.reviewerId,
      p_decision_reason: decision.reason,
      p_reviewed_at: decision.reviewedAt,
      p_expires_at: decision.expiresAt,
      p_evidence_ids: entry.evidenceIds,
      p_expected_active_certification_id: decision.expectedActiveCertificationId,
    })
    if (error) throw new Error(`publication failed for ${decision.menuItemId}: ${error.message}`)
    applied++
  }

  console.log(`Published ${applied} reviewed certification(s).`)
  console.log(`Pre-write manifest: ${undoPath}`)
}

main().catch(error => {
  console.error('Certification publication failed:', error)
  process.exit(1)
})
