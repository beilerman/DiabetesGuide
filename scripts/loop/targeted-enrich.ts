/**
 * targeted-enrich.ts — Turn the improvement loop's dosing-impact prioritization
 * into actual carb enrichment, using ONLY corroborated (triangulated) estimates.
 *
 * The loop already ranks gap items by dosing impact (control.buildEnrichmentWorklist).
 * This module walks that ranking, and for the highest-impact items that have a
 * genuine carb HOLE (no nutrition row, or carbs null) it runs the two free local
 * estimators — keyword copy + chain-class median — and imports a carb value ONLY
 * when the two independently AGREE (via audit/triangulate.assignTriangulation) and
 * the result passes the import-safety gate. Items that already carry a numeric carb
 * value are NEVER touched here: filling a null is additive, but overwriting an
 * existing carb count is the dosing-dangerous direction and belongs to the audit /
 * verification flows, not this hole-filler.
 *
 * Triangulated confidence is capped at 65 by the calibration tiers — below the
 * app's dosing-grade bar (70) — so a corroborated fill improves comprehensiveness
 * without ever being presented to a user as safe to dose insulin from.
 *
 * buildTargetedEstimates is PURE (no DB, no fs, no env). applyTargetedEstimates is
 * the only impure part: a tolerant writer that updates or inserts one row at a time
 * and counts failures rather than throwing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Item } from '../audit/types.js'
import { nd } from '../audit/utils.js'
import { buildEnrichmentWorklist } from './control.js'
import { estimateNutrition, extractKeywords } from '../sync/estimate-nutrition.js'
import type { NutritionPoolEntry } from '../sync/estimate-nutrition.js'
import type { MergedItem } from '../sync/merge.js'
import { chainClassEstimate } from '../audit/calibration-methods.js'
import type { OfficialRow } from '../audit/calibration-methods.js'
import { assignTriangulation, isImportable } from '../audit/triangulate.js'
import type { FullMacros, MethodEstimate } from '../audit/triangulate.js'

export interface TargetedEstimate {
  itemId: string
  nutritionDataId: string | null // null => item has NO nutrition row (needs insert)
  name: string
  category: string
  carbs: number
  macros: FullMacros | null
  confidence: number // from triangulation, always <= 65 (below dosing-grade)
  method: string // e.g. 'triangulated(keyword+chain)'
  agreeing: string[]
  priorityScore: number
  reason: string
}

export interface TargetedOptions {
  limit: number
}

export interface ApplyResult {
  updated: number
  inserted: number
  failed: number
}

/**
 * PURE. Corroborated carb estimates for the top `limit` highest-dosing-impact
 * items that have a genuine carb HOLE (reason 'no nutrition row' or 'carbs
 * missing'). Requires >=2 methods (keyword + chain) to AGREE via
 * assignTriangulation and the result to pass isImportable. NEVER targets items
 * that already have a numeric carb value. Returns fewer than `limit` if not
 * enough corroborated estimates exist.
 */
export function buildTargetedEstimates(items: Item[], opts: TargetedOptions): TargetedEstimate[] {
  // 1. Keyword-copy pool: every item with a complete numeric macro panel.
  const pool: NutritionPoolEntry[] = []
  // 2. Chain-class pool: high-confidence official rows with a carb value.
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

  // 3. Genuine holes only, in dosing-impact order. 'carbs not dosing-grade' has a
  //    numeric value already — never overwrite it here.
  const holes = buildEnrichmentWorklist(items).filter(
    (e) => e.reason === 'carbs missing' || e.reason === 'no nutrition row',
  )

  const produced: TargetedEstimate[] = []
  for (const entry of holes) {
    const item = entry.item

    const candidatePool = pool.filter((p) => p.id !== item.id)
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
      officialPool.filter((o) => o.id !== item.id),
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

    if (estimates.length < 2) continue

    const tri = assignTriangulation(estimates, item.category)
    if (!tri || !isImportable(tri)) continue

    produced.push({
      itemId: item.id,
      nutritionDataId: nd(item)?.id ?? null,
      name: item.name,
      category: item.category,
      carbs: tri.carbs,
      macros: tri.macros,
      confidence: tri.confidence,
      method: `triangulated(${tri.agreeing.join('+')})`,
      agreeing: tri.agreeing,
      priorityScore: entry.score,
      reason: entry.reason,
    })

    if (produced.length === opts.limit) break
  }

  return produced
}

/**
 * DB writer: for each estimate, UPDATE the existing nutrition row (by
 * nutritionDataId) or INSERT a new row (carrying menu_item_id). Sets
 * source='crowdsourced' and the capped confidence. Tolerant: counts failures,
 * never throws on a single row error.
 */
export async function applyTargetedEstimates(
  supabase: SupabaseClient,
  estimates: TargetedEstimate[],
): Promise<ApplyResult> {
  const result: ApplyResult = { updated: 0, inserted: 0, failed: 0 }

  for (const est of estimates) {
    const fields: Record<string, number | string> = {
      carbs: est.carbs,
      source: 'crowdsourced',
      confidence_score: est.confidence,
    }
    const m = est.macros
    if (m) {
      if (m.calories != null) fields.calories = m.calories
      if (m.fat != null) fields.fat = m.fat
      if (m.protein != null) fields.protein = m.protein
      if (m.sugar != null) fields.sugar = m.sugar
      if (m.fiber != null) fields.fiber = m.fiber
      if (m.sodium != null) fields.sodium = m.sodium
    }

    try {
      if (est.nutritionDataId) {
        const { error } = await supabase
          .from('nutritional_data')
          .update(fields)
          .eq('id', est.nutritionDataId)
        if (error) result.failed++
        else result.updated++
      } else {
        const { error } = await supabase
          .from('nutritional_data')
          .insert({ menu_item_id: est.itemId, ...fields })
        if (error) result.failed++
        else result.inserted++
      }
    } catch {
      result.failed++
    }
  }

  return result
}
