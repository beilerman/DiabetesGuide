/**
 * import-ai-nutrition.ts — Apply Opus-generated, web/recipe-grounded nutrition.
 *
 * Reads data/ai-nutrition.json (produced by Opus subagents that research copycat
 * recipes / published figures and decompose items into components) and updates
 * each item's nutrition BY ID. Honest confidence tiers come from the generator:
 *   published/official ~75, recipe-computed ~60, decomposition ~50.
 *
 * SAFE by default: dry-run (prints, writes nothing). Pass --apply to write.
 * Only overwrites items whose existing confidence is BELOW the new value, so it
 * never downgrades better data.
 *
 * Usage:
 *   npx tsx scripts/import-ai-nutrition.ts            # dry-run
 *   npx tsx scripts/import-ai-nutrition.ts --apply
 *   npx tsx scripts/import-ai-nutrition.ts --file=data/ai-nutrition-batch2.json --apply
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './audit/utils.js'
import { buildEvidenceCandidate, buildReviewArtifact, parseEvidenceMode } from './nutrition/evidence-intake.js'
import type { EvidenceCandidate, EvidenceSourceKind } from './nutrition/evidence-intake.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envVars = loadEnv()
const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  envVars.SUPABASE_URL ||
  envVars.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key)
const APPLY = process.argv.includes('--apply')
const EVIDENCE_MODE = parseEvidenceMode(process.argv.slice(2))
if (APPLY && EVIDENCE_MODE !== 'dry-run') {
  throw new Error('Select only one write mode: --apply or --apply-evidence')
}
if (EVIDENCE_MODE === 'publish-reviewed') {
  throw new Error('Reviewed decisions must be published by the dedicated certification command')
}
// --force: overwrite even when existing confidence is >= the new value. Use for
// the flagged run, where the existing data is provably WRONG (internally
// inconsistent) regardless of its confidence label.
const FORCE = process.argv.includes('--force')
const fileArg = process.argv.find(a => a.startsWith('--file='))
const FILE = fileArg ? fileArg.split('=')[1] : 'data/ai-nutrition.json'
const reviewOutArg = process.argv.find(a => a.startsWith('--review-out='))

const RANGES: Record<string, [number, number]> = {
  // carbs cap 700: multi-unit items sold as one menu entry (e.g. Voodoo's
  // 13-doughnut "All Classic Dozen" = 677g as sold) legitimately exceed the
  // old 600 cap; the Atwater check below still validates internal consistency.
  calories: [0, 5000], carbs: [0, 700], fat: [0, 400], protein: [0, 300],
  sugar: [0, 400], fiber: [0, 100], sodium: [0, 20000], cholesterol: [0, 3000],
}
const NUT_FIELDS = Object.keys(RANGES) as (keyof typeof RANGES)[]

interface Entry {
  id: string
  name?: string
  calories: number; carbs: number
  fat?: number; protein?: number; sugar?: number; fiber?: number; sodium?: number; cholesterol?: number
  confidence: number
  source?: string // 'official' | 'crowdsourced'
  method?: string
  sourceUrl?: string
  sourceDetail?: string
  note?: string
  servingQuantity?: number
  servingUnit?: string
  servingDescription?: string
  exactItemMatch?: boolean
  exactServingMatch?: boolean
  retrievedAt?: string
  publishedAt?: string
  contentHash?: string
  upstreamSourceKey?: string
}

function evidenceSourceKind(entry: Entry): EvidenceSourceKind {
  if (/decompos/i.test(entry.method ?? '')) return 'decomposition'
  if (/recipe/i.test(entry.method ?? '')) return 'recipe'
  return 'ai'
}

function sane(e: Entry): string | null {
  for (const f of NUT_FIELDS) {
    const v = (e as any)[f]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${f} not a number`
    const [min, max] = RANGES[f]
    if (v < min || v > max) return `${f}=${v} out of range`
  }
  if (e.calories == null || e.carbs == null) return 'missing calories/carbs'
  if (e.sugar != null && e.sugar > e.carbs + 1) return `sugar>${e.carbs} carbs`
  if (e.fiber != null && e.fiber > e.carbs + 1) return `fiber>${e.carbs} carbs`
  // Atwater plausibility — SKIP for alcoholic drinks, whose ~7 cal/g of alcohol
  // is invisible to the P*4+C*4+F*9 estimate (the documented caloric-math gap).
  // Check name AND the generator's note (creative cocktail names like
  // "Tequilasaurus"/"Uh-Oa!" don't contain a keyword, but the note does).
  const text = `${e.name ?? ''} ${e.method ?? ''} ${e.note ?? ''} ${e.sourceDetail ?? ''}`
  const isAlcohol = /(alcohol|margarita|mojito|daiquiri|martini|cocktail|sangria|mimosa|bellini|negroni|paloma|colada|mai.?tai|michelada|tiki|spritz|jungle juice|icefall|beer|wine|cider|seltzer|\brum\b|vodka|tequila|whiskey|bourbon|\bgin\b|sake|mezcal|liqueur|aperol|prosecco|champagne|hard )/i.test(text)
  if (!isAlcohol && e.fat != null && e.protein != null) {
    const est = e.protein * 4 + e.carbs * 4 + e.fat * 9
    if (e.calories > 50 && Math.abs(e.calories - est) / e.calories > 0.45) return `caloric math off (stated ${e.calories}, macros imply ${Math.round(est)})`
  }
  return null
}

async function main() {
  const path = resolve(__dirname, '..', FILE)
  const json = JSON.parse(readFileSync(path, 'utf-8')) as { entries: Entry[] }
  console.log(`Loaded ${json.entries.length} entries from ${FILE}`)
  console.log(APPLY ? '\n*** APPLYING ***\n' : '\n(dry-run — pass --apply to write)\n')

  let written = 0, skippedBetter = 0, rejected = 0
  const reviewCandidates: EvidenceCandidate[] = []
  for (const e of json.entries) {
    const bad = sane(e)
    if (bad) { console.log(`  REJECT ${e.name ?? e.id}: ${bad}`); rejected++; continue }

    const evidenceCandidate = buildEvidenceCandidate({
      menuItemId: e.id,
      itemName: e.name ?? e.id,
      sourceKind: evidenceSourceKind(e),
      sourceName: e.method ?? 'AI-assisted nutrition research',
      sourceUrl: e.sourceUrl ?? null,
      upstreamSourceKey: e.upstreamSourceKey ?? null,
      carbs: e.carbs,
      serving: {
        quantity: e.servingQuantity ?? null,
        unit: e.servingUnit ?? null,
        description: e.servingDescription ?? null,
      },
      exactItemMatch: e.exactItemMatch ?? false,
      exactServingMatch: e.exactServingMatch ?? false,
      retrievedAt: e.retrievedAt ?? new Date().toISOString(),
      publishedAt: e.publishedAt ?? null,
      contentHash: e.contentHash ?? null,
      note: e.note ?? e.sourceDetail ?? null,
      legacyConfidence: e.confidence,
    })
    const evidenceReasons = evidenceCandidate.reviewReasons.length > 0
      ? `; review: ${evidenceCandidate.reviewReasons.join(', ')}`
      : ''
    console.log(`  evidence ${evidenceCandidate.proposedTier} candidate for ${evidenceCandidate.itemName}${evidenceReasons}`)
    reviewCandidates.push(evidenceCandidate)

    if (EVIDENCE_MODE === 'apply-evidence') {
      const { error } = await supabase.from('nutrition_sources').upsert(
        evidenceCandidate.evidenceRow,
        { onConflict: 'evidence_key', ignoreDuplicates: true },
      )
      if (error) throw new Error(`evidence write failed for ${evidenceCandidate.itemName}: ${error.message}`)
      written++
      continue
    }

    const { data: nd } = await supabase
      .from('nutritional_data').select('id, confidence_score').eq('menu_item_id', e.id).limit(1)
    const existing = nd?.[0]
    if (!FORCE && existing && (existing.confidence_score ?? 0) >= e.confidence) {
      skippedBetter++
      continue
    }

    const fields: Record<string, unknown> = {
      source: e.source ?? 'crowdsourced',
      confidence_score: e.confidence,
    }
    const sourceDetail = e.sourceDetail ?? buildSourceDetail(e)
    if (sourceDetail) fields.source_detail = sourceDetail
    for (const f of NUT_FIELDS) if ((e as any)[f] != null) fields[f] = (e as any)[f]

    console.log(`  ${APPLY ? 'WRITE' : 'would write'} ${e.name ?? e.id}: ${e.calories}cal/${e.carbs}g [${e.method ?? '?'}, conf ${e.confidence}]`)
    if (APPLY) {
      let result
      if (existing) {
        let update = supabase.from('nutritional_data').update(fields).eq('id', existing.id)
        if (!FORCE) {
          update = update.or(`confidence_score.is.null,confidence_score.lt.${e.confidence}`)
        }
        result = await update
      } else {
        result = await supabase.from('nutritional_data').upsert(
          { menu_item_id: e.id, ...fields },
          { onConflict: 'menu_item_id', ignoreDuplicates: true },
        )
      }
      const { error } = result
      if (error) console.error(`    write failed: ${error.message}`)
      else written++
    } else {
      written++
    }
  }

  console.log(`\n=== ${APPLY ? 'Applied' : 'Dry-run'}: ${written} ${APPLY ? 'written' : 'to write'}, ${skippedBetter} skipped (already better), ${rejected} rejected ===`)
  if (reviewOutArg) {
    const outputPath = resolve(__dirname, '..', reviewOutArg.split('=')[1])
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(buildReviewArtifact(reviewCandidates, FILE), null, 2)}\n`, 'utf8')
    console.log(`Evidence review artifact: ${outputPath}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

function buildSourceDetail(e: Entry): string | null {
  const parts = [
    e.method,
    e.sourceUrl ? `source: ${e.sourceUrl}` : '',
    e.note,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' | ') : null
}
