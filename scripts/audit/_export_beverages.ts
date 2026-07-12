/** One-off: export improvable non-alcoholic beverage targets (with
 * descriptions) for Claude-decomposition, priority-ordered. Read-only. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createSupabaseClient, isLikelyAlcoholic } from './utils.js'
import { dosingPriorityScore } from './trust.js'

const sb = createSupabaseClient()

interface Row {
  id: string
  name: string
  category: string
  description: string | null
  restaurant: { name: string; park: { name: string; location: string | null } | null } | null
  nutritional_data: Array<{ carbs: number | null; source: string | null; confidence_score: number | null }>
}

const rows: Row[] = []
let from = 0
for (;;) {
  const { data, error } = await sb
    .from('menu_items')
    .select(
      `id, name, category, description,
       restaurant:restaurants(name, park:parks(name, location)),
       nutritional_data(carbs, source, confidence_score)`,
    )
    .eq('category', 'beverage')
    .order('id')
    .range(from, from + 999)
  if (error) throw error
  if (!data?.length) break
  rows.push(...(data as unknown as Row[]))
  if (data.length < 1000) break
  from += 1000
}

const targets = rows
  .filter((r) => {
    const n = r.nutritional_data?.[0]
    if (!n || n.source === 'official') return false
    if (n.carbs != null && (n.confidence_score ?? 0) >= 70) return false
    if ((r.description ?? '').trim().length < 20) return false
    if (isLikelyAlcoholic(r.name, { category: r.category, description: r.description } as never)) return false
    return true
  })
  .map((r) => ({
    r,
    priority: dosingPriorityScore(r.category, r.restaurant?.park?.location ?? null, r.nutritional_data?.[0]?.carbs ?? null),
  }))
  .sort((a, b) => b.priority - a.priority)
  .slice(0, 300)
  .map(({ r }) => ({ id: r.id, name: r.name, category: r.category, description: r.description }))

mkdirSync('data/pending', { recursive: true })
writeFileSync('data/pending/claude-decomp-beverage-targets.json', JSON.stringify(targets, null, 2))
console.log(`beverage targets exported: ${targets.length}`)
