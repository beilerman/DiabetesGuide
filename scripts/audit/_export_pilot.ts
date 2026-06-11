/** One-off: export (a) a blind ground-truth calibration sample and (b) the
 * pilot targets, for the Claude-decomposition method. Read-only. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { dosingPriorityScore } from './trust.js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface Row {
  id: string
  name: string
  category: string
  description: string | null
  restaurant: { name: string; park: { name: string; location: string | null } | null } | null
  nutritional_data: Array<{ carbs: number | null; calories: number | null; source: string | null; confidence_score: number | null }>
}

const rows: Row[] = []
let from = 0
for (;;) {
  const { data, error } = await sb
    .from('menu_items')
    .select(
      `id, name, category, description,
       restaurant:restaurants(name, park:parks(name, location)),
       nutritional_data(carbs, calories, source, confidence_score)`,
    )
    .order('id')
    .range(from, from + 999)
  if (error) throw error
  if (!data?.length) break
  rows.push(...(data as unknown as Row[]))
  if (data.length < 1000) break
  from += 1000
}

// (a) Calibration sample: official rows WITH descriptions, every Nth → ~120
const officials = rows.filter((r) => {
  const n = r.nutritional_data?.[0]
  return n?.source === 'official' && (n.confidence_score ?? 0) >= 85 && n.carbs != null &&
    (r.description ?? '').trim().length >= 20
})
const step = Math.max(1, Math.floor(officials.length / 120))
const sample = officials.filter((_, i) => i % step === 0).slice(0, 120)
mkdirSync('data/pending', { recursive: true })
// Blind file (no answers) for the estimators…
writeFileSync(
  'data/pending/claude-decomp-calibration-blind.json',
  JSON.stringify(sample.map((r) => ({ id: r.id, name: r.name, category: r.category, description: r.description })), null, 2),
)
// …answer key kept separately for scoring.
writeFileSync(
  'data/pending/claude-decomp-calibration-key.json',
  JSON.stringify(sample.map((r) => ({ id: r.id, carbs: r.nutritional_data[0].carbs })), null, 2),
)
console.log(`calibration sample: ${sample.length} official items with descriptions`)

// (b) Pilot targets: same selection as triangulate.ts (improvable, non-official,
// non-alcoholic-suspected is applied later in triangulate; keep raw here)
const targets = rows
  .filter((r) => {
    const n = r.nutritional_data?.[0]
    if (!n || n.source === 'official') return false
    if (n.carbs != null && (n.confidence_score ?? 0) >= 60) return false
    return (r.description ?? '').trim().length >= 20
  })
  .map((r) => ({
    r,
    priority: dosingPriorityScore(r.category, r.restaurant?.park?.location ?? null, r.nutritional_data?.[0]?.carbs ?? null),
  }))
  .sort((a, b) => b.priority - a.priority)
  .slice(0, 300)
  .map(({ r }) => ({ id: r.id, name: r.name, category: r.category, description: r.description }))
writeFileSync('data/pending/claude-decomp-pilot-targets.json', JSON.stringify(targets, null, 2))
console.log(`pilot targets: ${targets.length}`)
