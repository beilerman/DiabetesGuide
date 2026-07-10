/**
 * estimate-core.ts — the reusable corroborated-carb estimation core extracted
 * from targeted-enrich.ts so other flows (e.g. the accuracy back-test) can run
 * the exact same keyword-copy + chain-class triangulation without duplicating
 * the pool-building and gating logic.
 *
 * Two pure functions:
 *   buildPools(items)                 — builds the keyword-similarity pool and
 *                                       the official ground-truth pool once.
 *   triangulateCarbs(item, pools, id) — the per-item keyword + chain estimate,
 *                                       gated by assignTriangulation + isImportable.
 *
 * Behavior is verbatim with the original targeted-enrich implementation: same
 * field mappings, same estimateNutrition first-arg cast, same MethodEstimate
 * construction, same >=2-methods / agreement / import-safety gates.
 */

import type { Item } from '../audit/types.js'
import { nd } from '../audit/utils.js'
import { estimateNutrition, extractKeywords } from '../sync/estimate-nutrition.js'
import type { NutritionPoolEntry } from '../sync/estimate-nutrition.js'
import type { MergedItem } from '../sync/merge.js'
import { assignTriangulation, isImportable } from '../audit/triangulate.js'
import type { MethodEstimate, FullMacros } from '../audit/triangulate.js'
import { chainClassEstimate } from '../audit/calibration-methods.js'
import type { OfficialRow } from '../audit/calibration-methods.js'

export interface Pools {
  pool: NutritionPoolEntry[]
  officialPool: OfficialRow[]
}

/**
 * Build the keyword-similarity pool (items with numeric calories/carbs/fat/protein)
 * and the official ground-truth pool (source==='official' && confidence>=85 && carbs!=null).
 */
export function buildPools(items: Item[]): Pools {
  const pool: NutritionPoolEntry[] = []
  const officialPool: OfficialRow[] = []
  for (const item of items) {
    const n = nd(item)
    if (!n) continue
    if (
      typeof n.calories === 'number' &&
      typeof n.carbs === 'number' &&
      typeof n.fat === 'number' &&
      typeof n.protein === 'number'
    ) {
      pool.push({
        id: item.id,
        name: item.name,
        category: item.category,
        calories: n.calories,
        carbs: n.carbs,
        fat: n.fat,
        protein: n.protein,
        sugar: n.sugar,
        fiber: n.fiber,
        sodium: n.sodium,
        keywords: extractKeywords(item.name),
      })
    }
    if (n.source === 'official' && (n.confidence_score ?? 0) >= 85 && n.carbs != null) {
      officialPool.push({
        id: item.id,
        name: item.name,
        category: item.category,
        carbs: n.carbs,
        calories: n.calories,
      })
    }
  }
  return { pool, officialPool }
}

export interface CarbEstimate {
  carbs: number
  macros: FullMacros | null
  confidence: number
  method: string // e.g. 'triangulated(keyword+chain)'
  agreeing: string[]
}

/**
 * Corroborated carb estimate for ONE item via keyword + chain triangulation.
 * Leave-one-out: excludes excludeId (default item.id) from BOTH pools. Returns
 * null unless >=2 methods are available AND they AGREE via assignTriangulation
 * AND the result passes isImportable.
 */
export function triangulateCarbs(
  item: Item,
  pools: Pools,
  excludeId: string = item.id,
): CarbEstimate | null {
  const candidatePool = pools.pool.filter((p) => p.id !== excludeId)
  const kw = estimateNutrition(
    {
      itemName: item.name,
      category: item.category,
      restaurantName: '',
      parkName: '',
      sources: [],
      confidence: 100,
      isNew: true,
    } as unknown as MergedItem,
    candidatePool,
  )
  const chain = chainClassEstimate(
    { id: item.id, name: item.name },
    pools.officialPool.filter((o) => o.id !== excludeId),
  )

  const estimates: MethodEstimate[] = []
  if (kw) {
    estimates.push({
      method: 'keyword',
      carbs: kw.carbs,
      full: {
        calories: kw.calories,
        fat: kw.fat,
        protein: kw.protein,
        sugar: kw.sugar ?? null,
        fiber: kw.fiber ?? null,
        sodium: kw.sodium ?? null,
      },
    })
  }
  if (chain) estimates.push({ method: 'chain', carbs: chain.carbs })

  if (estimates.length < 2) return null

  const tri = assignTriangulation(estimates, item.category)
  if (!tri || !isImportable(tri)) return null

  return {
    carbs: tri.carbs,
    macros: tri.macros,
    confidence: tri.confidence,
    method: `triangulated(${tri.agreeing.join('+')})`,
    agreeing: tri.agreeing,
  }
}
