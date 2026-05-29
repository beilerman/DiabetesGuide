/**
 * Comprehensive database audit.
 *
 * Runs the standard audit pipeline (accuracy + completeness + external) plus
 * structural and coverage checks the pipeline doesn't perform:
 *
 *   - row counts and 1:1 invariants
 *   - schema column presence
 *   - duplicates by normalized name
 *   - FK orphans
 *   - per-source distribution
 *   - per-confidence-tier distribution
 *   - per-park coverage (% items with calories, % with carbs, % with confidence ≥ 50)
 *   - freshness distribution (fresh / 12-24mo / >2y / never)
 *   - items with all-zero macros (likely empty shells we should know about)
 *   - allergen coverage
 *   - dosing-grade item count (official source, confidence ≥ 80, fresh)
 *
 * Read-only. Outputs a markdown report to audit/comprehensive-<date>.md and
 * the JSON to audit/comprehensive-<date>.json.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { HIGH_CONFIDENCE, MEDIUM_CONFIDENCE } from '../lib/confidence-thresholds.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000
const TWENTY_FOUR_MONTHS_MS = 2 * 365 * 24 * 60 * 60 * 1000

interface SectionResult {
  name: string
  ok: boolean
  rows: { label: string; value: string | number; status?: 'ok' | 'warn' | 'fail' }[]
}

const sections: SectionResult[] = []

async function exactCount(table: string): Promise<number> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`count ${table}: ${error.message}`)
  return count ?? -1
}

async function paginatedAll<T>(table: string, columns: string): Promise<T[]> {
  // Supabase REST accepts up to 10,000 rows per request. With current prod
  // sizes (~18k nutrition rows, ~14k allergens) 5k pages mean 1-4 round-trips
  // per table instead of the previous 1k * 18 round-trips for nutrition alone.
  const pageSize = 5000
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw new Error(`paginate ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

async function rowCounts(): Promise<SectionResult> {
  const tables = ['parks', 'restaurants', 'menu_items', 'nutritional_data', 'allergens']
  const counts: Record<string, number> = {}
  for (const t of tables) counts[t] = await exactCount(t)
  const rows: SectionResult['rows'] = tables.map(t => ({ label: t, value: counts[t] }))

  // Invariant: items == nutrition rows
  const itemsEqualNut = counts['menu_items'] === counts['nutritional_data']
  rows.push({
    label: '1:1 menu_items ↔ nutritional_data invariant',
    value: itemsEqualNut ? 'PASS' : `FAIL (Δ ${counts['menu_items'] - counts['nutritional_data']})`,
    status: itemsEqualNut ? 'ok' : 'fail',
  })

  return { name: 'Row counts', ok: itemsEqualNut, rows }
}

interface RestRow {
  id: string
  park_id: string
  name: string
}
interface ItemRow {
  id: string
  restaurant_id: string
  name: string
  category: string
}
interface NutRow {
  id: string
  menu_item_id: string
  source: string
  confidence_score: number | null
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  alcohol_grams: number | null
  updated_at: string | null
}
interface AllergenRow {
  id: string
  menu_item_id: string
}
interface ParkRow {
  id: string
  name: string
}

async function fkOrphans(
  restaurants: RestRow[],
  items: ItemRow[],
  nutrition: NutRow[],
  allergens: AllergenRow[],
  parks: ParkRow[],
): Promise<SectionResult> {
  const parkIds = new Set(parks.map(p => p.id))
  const restIds = new Set(restaurants.map(r => r.id))
  const itemIds = new Set(items.map(i => i.id))

  const orphRest = restaurants.filter(r => !parkIds.has(r.park_id))
  const orphItems = items.filter(i => !restIds.has(i.restaurant_id))
  const orphNut = nutrition.filter(n => !itemIds.has(n.menu_item_id))
  const orphAll = allergens.filter(a => !itemIds.has(a.menu_item_id))

  const rows: SectionResult['rows'] = [
    { label: 'restaurants without park', value: orphRest.length, status: orphRest.length === 0 ? 'ok' : 'fail' },
    { label: 'menu_items without restaurant', value: orphItems.length, status: orphItems.length === 0 ? 'ok' : 'fail' },
    { label: 'nutritional_data without item', value: orphNut.length, status: orphNut.length === 0 ? 'ok' : 'fail' },
    { label: 'allergens without item', value: orphAll.length, status: orphAll.length === 0 ? 'ok' : 'fail' },
  ]
  return { name: 'FK orphans', ok: rows.every(r => r.status === 'ok'), rows }
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

function duplicates(restaurants: RestRow[], items: ItemRow[]): SectionResult {
  const restMap = new Map<string, number>()
  for (const r of restaurants) restMap.set(`${r.park_id}::${normalize(r.name)}`, (restMap.get(`${r.park_id}::${normalize(r.name)}`) ?? 0) + 1)
  const restDupes = [...restMap.values()].filter(v => v > 1).length

  const itemMap = new Map<string, number>()
  for (const i of items) itemMap.set(`${i.restaurant_id}::${normalize(i.name)}`, (itemMap.get(`${i.restaurant_id}::${normalize(i.name)}`) ?? 0) + 1)
  const itemDupes = [...itemMap.values()].filter(v => v > 1).length

  return {
    name: 'Duplicates by normalized name',
    ok: restDupes === 0 && itemDupes === 0,
    rows: [
      { label: 'duplicate (park, name) restaurant groups', value: restDupes, status: restDupes === 0 ? 'ok' : 'fail' },
      { label: 'duplicate (restaurant, name) item groups', value: itemDupes, status: itemDupes === 0 ? 'ok' : 'fail' },
    ],
  }
}

function sourceDistribution(nutrition: NutRow[]): SectionResult {
  const buckets: Record<string, number> = { official: 0, api_lookup: 0, crowdsourced: 0, other: 0 }
  for (const n of nutrition) {
    if (n.source in buckets) buckets[n.source]++
    else buckets['other']++
  }
  const total = nutrition.length || 1
  const rows: SectionResult['rows'] = Object.entries(buckets).map(([k, v]) => ({
    label: `source: ${k}`,
    value: `${v} (${((v / total) * 100).toFixed(1)}%)`,
  }))
  return { name: 'Source distribution', ok: true, rows }
}

function confidenceDistribution(nutrition: NutRow[]): SectionResult {
  const buckets = { high: 0, medium: 0, low: 0, null_score: 0 }
  for (const n of nutrition) {
    if (n.confidence_score == null) buckets.null_score++
    else if (n.confidence_score >= HIGH_CONFIDENCE) buckets.high++
    else if (n.confidence_score >= MEDIUM_CONFIDENCE) buckets.medium++
    else buckets.low++
  }
  const total = nutrition.length || 1
  return {
    name: 'Confidence distribution',
    ok: true,
    rows: [
      { label: 'high (≥80)', value: `${buckets.high} (${((buckets.high / total) * 100).toFixed(1)}%)` },
      { label: 'medium (50–79)', value: `${buckets.medium} (${((buckets.medium / total) * 100).toFixed(1)}%)` },
      { label: 'low (<50)', value: `${buckets.low} (${((buckets.low / total) * 100).toFixed(1)}%)` },
      { label: 'null (no confidence recorded)', value: `${buckets.null_score} (${((buckets.null_score / total) * 100).toFixed(1)}%)` },
    ],
  }
}

function freshnessDistribution(nutrition: NutRow[]): SectionResult {
  const now = Date.now()
  const buckets = { fresh: 0, stale_12mo: 0, very_stale_24mo: 0, never: 0 }
  for (const n of nutrition) {
    if (!n.updated_at) { buckets.never++; continue }
    const age = now - Date.parse(n.updated_at)
    if (isNaN(age)) { buckets.never++; continue }
    if (age >= TWENTY_FOUR_MONTHS_MS) buckets.very_stale_24mo++
    else if (age >= TWELVE_MONTHS_MS) buckets.stale_12mo++
    else buckets.fresh++
  }
  const total = nutrition.length || 1
  return {
    name: 'Freshness distribution',
    ok: true,
    rows: [
      { label: 'fresh (<12 months)', value: `${buckets.fresh} (${((buckets.fresh / total) * 100).toFixed(1)}%)` },
      { label: '12–24 months stale', value: `${buckets.stale_12mo} (${((buckets.stale_12mo / total) * 100).toFixed(1)}%)`, status: buckets.stale_12mo > 0 ? 'warn' : 'ok' },
      { label: '> 2 years stale', value: `${buckets.very_stale_24mo} (${((buckets.very_stale_24mo / total) * 100).toFixed(1)}%)`, status: buckets.very_stale_24mo > 0 ? 'warn' : 'ok' },
      { label: 'never verified (null updated_at)', value: `${buckets.never} (${((buckets.never / total) * 100).toFixed(1)}%)`, status: buckets.never > 0 ? 'warn' : 'ok' },
    ],
  }
}

function nutritionCoverage(nutrition: NutRow[]): SectionResult {
  const total = nutrition.length || 1
  const withCalories = nutrition.filter(n => n.calories != null && n.calories > 0).length
  const withCarbs = nutrition.filter(n => n.carbs != null).length
  const withProtein = nutrition.filter(n => n.protein != null).length
  const withFat = nutrition.filter(n => n.fat != null).length
  const withSodium = nutrition.filter(n => n.sodium != null).length
  const withSugar = nutrition.filter(n => n.sugar != null).length
  const withFiber = nutrition.filter(n => n.fiber != null).length
  const allMacrosNull = nutrition.filter(n => n.calories == null && n.carbs == null && n.protein == null && n.fat == null).length
  const allZeroMacros = nutrition.filter(n => n.calories === 0 && n.carbs === 0 && n.protein === 0 && n.fat === 0).length
  return {
    name: 'Nutrition field coverage',
    ok: true,
    rows: [
      { label: 'calories > 0', value: `${withCalories} (${((withCalories / total) * 100).toFixed(1)}%)` },
      { label: 'carbs not null', value: `${withCarbs} (${((withCarbs / total) * 100).toFixed(1)}%)` },
      { label: 'protein not null', value: `${withProtein} (${((withProtein / total) * 100).toFixed(1)}%)` },
      { label: 'fat not null', value: `${withFat} (${((withFat / total) * 100).toFixed(1)}%)` },
      { label: 'sodium not null', value: `${withSodium} (${((withSodium / total) * 100).toFixed(1)}%)` },
      { label: 'sugar not null', value: `${withSugar} (${((withSugar / total) * 100).toFixed(1)}%)` },
      { label: 'fiber not null', value: `${withFiber} (${((withFiber / total) * 100).toFixed(1)}%)` },
      { label: 'all macros null (empty shells)', value: `${allMacrosNull} (${((allMacrosNull / total) * 100).toFixed(1)}%)`, status: allMacrosNull > total * 0.05 ? 'warn' : 'ok' },
      { label: 'all macros = 0', value: `${allZeroMacros} (${((allZeroMacros / total) * 100).toFixed(1)}%)`, status: allZeroMacros > total * 0.05 ? 'warn' : 'ok' },
    ],
  }
}

function dosingGradeCoverage(nutrition: NutRow[]): SectionResult {
  const now = Date.now()
  const dosingGrade = nutrition.filter(n =>
    n.source === 'official' &&
    n.confidence_score != null && n.confidence_score >= HIGH_CONFIDENCE &&
    n.carbs != null &&
    n.updated_at && (now - Date.parse(n.updated_at)) < TWELVE_MONTHS_MS,
  ).length
  const total = nutrition.length || 1
  return {
    name: 'Dosing-grade items',
    ok: true,
    rows: [
      {
        label: 'items meeting dosing bar (source=official, conf≥80, carbs not null, fresh)',
        value: `${dosingGrade} (${((dosingGrade / total) * 100).toFixed(1)}%)`,
        status: dosingGrade < total * 0.10 ? 'warn' : 'ok',
      },
    ],
  }
}

function impossibleValues(nutrition: NutRow[]): SectionResult {
  let negative = 0
  let extremeCal = 0
  let extremeSodium = 0
  let sugarOverCarbs = 0
  let fiberOverCarbs = 0
  for (const n of nutrition) {
    if ((n.calories ?? 0) < 0 || (n.carbs ?? 0) < 0 || (n.fat ?? 0) < 0 || (n.protein ?? 0) < 0) negative++
    if ((n.calories ?? 0) > 5000) extremeCal++
    if ((n.sodium ?? 0) > 10000) extremeSodium++
    if (n.sugar != null && n.carbs != null && n.sugar > n.carbs) sugarOverCarbs++
    if (n.fiber != null && n.carbs != null && n.fiber > n.carbs) fiberOverCarbs++
  }
  const ok = negative === 0 && extremeCal === 0 && extremeSodium === 0 && sugarOverCarbs === 0 && fiberOverCarbs === 0
  return {
    name: 'Impossible values',
    ok,
    rows: [
      { label: 'negative macros', value: negative, status: negative === 0 ? 'ok' : 'fail' },
      { label: 'calories > 5000', value: extremeCal, status: extremeCal === 0 ? 'ok' : 'fail' },
      { label: 'sodium > 10000mg', value: extremeSodium, status: extremeSodium === 0 ? 'ok' : 'fail' },
      { label: 'sugar > carbs', value: sugarOverCarbs, status: sugarOverCarbs === 0 ? 'ok' : 'fail' },
      { label: 'fiber > carbs', value: fiberOverCarbs, status: fiberOverCarbs === 0 ? 'ok' : 'fail' },
    ],
  }
}

function categoryDistribution(items: ItemRow[]): SectionResult {
  const buckets: Record<string, number> = {}
  for (const i of items) buckets[i.category] = (buckets[i.category] ?? 0) + 1
  const total = items.length || 1
  return {
    name: 'Category distribution',
    ok: true,
    rows: Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      label: k,
      value: `${v} (${((v / total) * 100).toFixed(1)}%)`,
    })),
  }
}

function allergenCoverage(items: ItemRow[], allergens: AllergenRow[]): SectionResult {
  const itemsWithAllergen = new Set(allergens.map(a => a.menu_item_id))
  const total = items.length || 1
  const covered = items.filter(i => itemsWithAllergen.has(i.id)).length
  return {
    name: 'Allergen coverage',
    ok: true,
    rows: [
      { label: 'menu_items with ≥1 allergen record', value: `${covered} (${((covered / total) * 100).toFixed(1)}%)` },
      { label: 'avg allergen records per covered item', value: covered > 0 ? (allergens.length / covered).toFixed(2) : '0' },
    ],
  }
}

interface ParkCoverageRow {
  park: string
  items: number
  withCalories: number
  withCarbs: number
  withConfMed: number
  pctCalories: number
  pctCarbs: number
  pctConfMed: number
}

function perParkCoverage(
  parks: ParkRow[],
  restaurants: RestRow[],
  items: ItemRow[],
  nutrition: NutRow[],
): { rows: ParkCoverageRow[]; section: SectionResult } {
  const parkById = new Map(parks.map(p => [p.id, p]))
  const restToPark = new Map(restaurants.map(r => [r.id, r.park_id]))
  const nutByItem = new Map(nutrition.map(n => [n.menu_item_id, n]))

  const parkAgg = new Map<string, { items: number; withCal: number; withCarbs: number; withConfMed: number }>()

  for (const it of items) {
    const parkId = restToPark.get(it.restaurant_id) ?? '_unknown_'
    const a = parkAgg.get(parkId) ?? { items: 0, withCal: 0, withCarbs: 0, withConfMed: 0 }
    a.items++
    const n = nutByItem.get(it.id)
    if (n) {
      if (n.calories != null && n.calories > 0) a.withCal++
      if (n.carbs != null) a.withCarbs++
      if (n.confidence_score != null && n.confidence_score >= MEDIUM_CONFIDENCE) a.withConfMed++
    }
    parkAgg.set(parkId, a)
  }

  const rows: ParkCoverageRow[] = [...parkAgg.entries()].map(([pid, a]) => ({
    park: parkById.get(pid)?.name ?? '(unknown)',
    items: a.items,
    withCalories: a.withCal,
    withCarbs: a.withCarbs,
    withConfMed: a.withConfMed,
    pctCalories: a.items === 0 ? 0 : (a.withCal / a.items) * 100,
    pctCarbs: a.items === 0 ? 0 : (a.withCarbs / a.items) * 100,
    pctConfMed: a.items === 0 ? 0 : (a.withConfMed / a.items) * 100,
  })).sort((a, b) => b.items - a.items)

  return {
    rows,
    section: {
      name: 'Per-park coverage (top 10 by item count)',
      ok: true,
      rows: rows.slice(0, 10).map(r => ({
        label: r.park,
        value: `${r.items} items, ${r.pctCalories.toFixed(0)}% w/ cal, ${r.pctCarbs.toFixed(0)}% w/ carbs, ${r.pctConfMed.toFixed(0)}% conf≥50`,
      })),
    },
  }
}

function renderMarkdown(allSections: SectionResult[], parkCoverage: ParkCoverageRow[], date: string): string {
  let md = `# Comprehensive Database Audit — ${date}\n\n`
  const overall = allSections.every(s => s.ok)
  md += `## Overall: ${overall ? '🟢 PASS' : '🔴 FAIL — see sections marked FAIL below'}\n\n`
  for (const s of allSections) {
    md += `## ${s.name}\n\n`
    md += `| Item | Value | |\n|------|-------|--|\n`
    for (const r of s.rows) {
      const icon = r.status === 'fail' ? '🔴' : r.status === 'warn' ? '🟡' : ''
      md += `| ${r.label} | ${r.value} | ${icon} |\n`
    }
    md += `\n`
  }
  md += `## Per-park coverage (full)\n\n`
  md += `| Park | Items | Cal % | Carbs % | Conf ≥50 % |\n|------|------:|------:|--------:|----------:|\n`
  for (const r of parkCoverage) {
    md += `| ${r.park} | ${r.items} | ${r.pctCalories.toFixed(0)}% | ${r.pctCarbs.toFixed(0)}% | ${r.pctConfMed.toFixed(0)}% |\n`
  }
  md += `\n`
  return md
}

async function main() {
  const t0 = Date.now()
  console.log('Comprehensive audit — fetching data...')

  const [parks, restaurants, items, nutrition, allergens] = await Promise.all([
    paginatedAll<ParkRow>('parks', 'id, name'),
    paginatedAll<RestRow>('restaurants', 'id, park_id, name'),
    paginatedAll<ItemRow>('menu_items', 'id, restaurant_id, name, category'),
    paginatedAll<NutRow>('nutritional_data', 'id, menu_item_id, source, confidence_score, calories, carbs, fat, protein, sugar, fiber, sodium, alcohol_grams, updated_at'),
    paginatedAll<AllergenRow>('allergens', 'id, menu_item_id'),
  ])

  console.log(`Fetched: ${parks.length} parks, ${restaurants.length} restaurants, ${items.length} items, ${nutrition.length} nutrition rows, ${allergens.length} allergens`)

  sections.push(await rowCounts())
  sections.push(await fkOrphans(restaurants, items, nutrition, allergens, parks))
  sections.push(duplicates(restaurants, items))
  sections.push(impossibleValues(nutrition))
  sections.push(sourceDistribution(nutrition))
  sections.push(confidenceDistribution(nutrition))
  sections.push(freshnessDistribution(nutrition))
  sections.push(nutritionCoverage(nutrition))
  sections.push(dosingGradeCoverage(nutrition))
  sections.push(categoryDistribution(items))
  sections.push(allergenCoverage(items, allergens))
  const pc = perParkCoverage(parks, restaurants, items, nutrition)
  sections.push(pc.section)

  const date = new Date().toISOString().slice(0, 10)
  const md = renderMarkdown(sections, pc.rows, date)
  const json = { date, generatedAt: new Date().toISOString(), sections, parkCoverage: pc.rows }

  mkdirSync(resolve(ROOT, 'audit'), { recursive: true })
  const mdPath = resolve(ROOT, 'audit', `comprehensive-${date}.md`)
  const jsonPath = resolve(ROOT, 'audit', `comprehensive-${date}.json`)
  writeFileSync(mdPath, md, 'utf-8')
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8')

  console.log('\n=== SUMMARY ===')
  for (const s of sections) {
    const status = s.ok ? '✓' : '✗'
    console.log(`  ${status} ${s.name}`)
  }
  const overall = sections.every(s => s.ok)
  const ms = Date.now() - t0
  console.log(`\nOverall: ${overall ? 'PASS' : 'FAIL'}    Elapsed: ${(ms / 1000).toFixed(1)}s`)
  console.log(`Reports: ${mdPath}`)
  console.log(`         ${jsonPath}`)

  if (!overall) process.exit(1)
}

main().catch(err => {
  console.error('comprehensive audit failed:', err)
  process.exit(1)
})
