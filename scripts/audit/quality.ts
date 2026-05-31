/**
 * audit/quality.ts — Database quality & trustworthiness report.
 *
 * Unlike accuracy.ts (which flags individual bad values), this tracks the
 * BIG-PICTURE health of the catalog over time: coverage of each field and,
 * crucially for a carb-counting diabetes app, how TRUSTWORTHY the carb numbers
 * are (official/api source + confidence) versus low-confidence estimates.
 *
 * Writes a snapshot to audit/quality-results.json and appends a row to
 * audit/quality-history.json so you can watch "% trusted carbs" climb as you
 * enrich from authoritative sources.
 *
 * Usage:
 *   npx tsx scripts/audit/quality.ts
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { createSupabaseClient, rootPath } from './utils.js'

interface Row {
  id: string
  category: string | null
  description: string | null
  photo_url: string | null
  price: number | null
  nutritional_data: {
    calories: number | null
    carbs: number | null
    fat: number | null
    protein: number | null
    sugar: number | null
    fiber: number | null
    sodium: number | null
    cholesterol: number | null
    source: string | null
    confidence_score: number | null
  }[]
}

const NUT_FIELDS = ['calories', 'carbs', 'fat', 'protein', 'sugar', 'fiber', 'sodium', 'cholesterol'] as const
// A carb value is "trusted" for insulin dosing if it comes from an authoritative
// source OR carries a high confidence score.
const TRUSTED_SOURCES = new Set(['official', 'api_lookup'])
const TRUSTED_CONFIDENCE = 70

async function fetchAll(): Promise<Row[]> {
  const supabase = createSupabaseClient()
  const all: Row[] = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(
        `id, category, description, photo_url, price,
         nutritional_data(calories, carbs, fat, protein, sugar, fiber, sodium, cholesterol, source, confidence_score)`,
      )
      .range(from, from + page - 1)
    if (error) throw new Error(`fetch error at ${from}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Row[]))
    if (data.length < page) break
    from += page
  }
  return all
}

async function countAllergenItems(): Promise<number> {
  const supabase = createSupabaseClient()
  const ids = new Set<string>()
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('allergens').select('menu_item_id').range(from, from + page - 1)
    if (error) throw new Error(`allergen fetch error at ${from}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const a of data as { menu_item_id: string }[]) ids.add(a.menu_item_id)
    if (data.length < page) break
    from += page
  }
  return ids.size
}

function nd(row: Row) {
  return row.nutritional_data?.[0] ?? null
}

async function main() {
  console.log('Running quality assessment...\n')
  const rows = await fetchAll()
  const allergenCount = await countAllergenItems()
  const N = rows.length

  let hasDesc = 0, hasPhoto = 0, hasPrice = 0, hasRow = 0, hasCal = 0, hasCarbs = 0, allEight = 0
  let trustedCarbs = 0
  const bySource: Record<string, number> = {}
  const fieldNull: Record<string, number> = {}
  for (const f of NUT_FIELDS) fieldNull[f] = 0

  for (const row of rows) {
    if (row.description?.trim()) hasDesc++
    if (row.photo_url) hasPhoto++
    if (row.price != null) hasPrice++
    const n = nd(row)
    if (!n) continue
    hasRow++
    if ((n.calories ?? 0) > 0) hasCal++
    if (n.carbs != null) hasCarbs++
    for (const f of NUT_FIELDS) if (n[f] == null) fieldNull[f]++
    if (NUT_FIELDS.every(f => n[f] != null)) allEight++
    const src = n.source ?? 'null'
    bySource[src] = (bySource[src] ?? 0) + 1
    if (n.carbs != null && (TRUSTED_SOURCES.has(src) || (n.confidence_score ?? 0) >= TRUSTED_CONFIDENCE)) {
      trustedCarbs++
    }
  }

  const p = (x: number) => Number(((x / N) * 100).toFixed(1))

  // Composite quality score (0-100), weighted for a carb-counting app:
  // trusted carbs is the dominant term.
  const score = Math.round(
    0.45 * (trustedCarbs / N) * 100 +
    0.20 * (hasCarbs / N) * 100 +
    0.15 * (hasCal / N) * 100 +
    0.10 * (allEight / N) * 100 +
    0.05 * (hasDesc / N) * 100 +
    0.05 * (allergenCount / N) * 100,
  )

  const snapshot = {
    date: new Date().toISOString().slice(0, 10),
    totalItems: N,
    qualityScore: score,
    coverage: {
      description: p(hasDesc),
      photo: p(hasPhoto),
      price: p(hasPrice),
      nutritionRow: p(hasRow),
      caloriesPresent: p(hasCal),
      carbsPresent: p(hasCarbs),
      allEightFields: p(allEight),
      allergens: p(allergenCount),
    },
    carbTrust: {
      trustedCarbsPct: p(trustedCarbs),
      untrustedCarbs: hasCarbs - trustedCarbs,
      bySource,
    },
    nutritionFieldNullPct: Object.fromEntries(
      NUT_FIELDS.map(f => [f, Number(((fieldNull[f] / Math.max(1, hasRow)) * 100).toFixed(1))]),
    ),
    orphans: N - hasRow,
  }

  // Console summary
  console.log(`=== Quality Report (${snapshot.date}) ===`)
  console.log(`Total items:        ${N}`)
  console.log(`QUALITY SCORE:      ${score}/100\n`)
  console.log(`Trusted carbs:      ${snapshot.carbTrust.trustedCarbsPct}%  (carbs from official/api or confidence>=${TRUSTED_CONFIDENCE})`)
  console.log(`Carbs present:      ${snapshot.coverage.carbsPresent}%`)
  console.log(`Calories present:   ${snapshot.coverage.caloriesPresent}%`)
  console.log(`All 8 fields:       ${snapshot.coverage.allEightFields}%`)
  console.log(`Description:        ${snapshot.coverage.description}%`)
  console.log(`Allergens:          ${snapshot.coverage.allergens}%`)
  console.log(`Photo:              ${snapshot.coverage.photo}%`)
  console.log(`Orphans (no row):   ${snapshot.orphans}`)
  console.log(`\nNutrition source mix:`)
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v} (${((v / hasRow) * 100).toFixed(1)}%)`)
  }

  // Persist snapshot + append to history
  writeFileSync(rootPath('audit', 'quality-results.json'), JSON.stringify(snapshot, null, 2) + '\n')

  const historyPath = rootPath('audit', 'quality-history.json')
  let history: typeof snapshot[] = []
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf-8'))
    } catch {
      history = []
    }
  }
  // Replace today's entry if re-run, else append
  history = history.filter(h => h.date !== snapshot.date)
  history.push(snapshot)
  writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n')

  if (history.length >= 2) {
    const prev = history[history.length - 2]
    const delta = score - prev.qualityScore
    console.log(`\nQuality score change since ${prev.date}: ${delta >= 0 ? '+' : ''}${delta}`)
  }

  console.log(`\nWritten to audit/quality-results.json (+ history)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
