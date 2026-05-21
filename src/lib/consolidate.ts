import type { MenuItemWithNutrition } from './types'
import { getNutrition } from './nutrition'

/**
 * A group of menu items that represent the same product sold at multiple
 * locations (e.g. "Bottled Water" available at hundreds of restaurants).
 */
export interface ConsolidatedItem {
  /** Representative item rendered on the card. */
  item: MenuItemWithNutrition
  /** Every menu_items row in this group, sorted by park then restaurant. */
  locations: MenuItemWithNutrition[]
}

/** Lowercase, trim, and collapse internal whitespace for stable matching. */
export function normalizeItemName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Two items are "the same" when they share a normalized name, category, and
 * matching carbohydrate and calorie values. Carbs and calories are the
 * metrics that matter most for diabetes, so near-duplicates with diverging
 * values are intentionally kept separate.
 */
function groupKey(item: MenuItemWithNutrition): string {
  const n = getNutrition(item)
  const carbs = n?.carbs ?? 'x'
  const calories = n?.calories ?? 'x'
  return `${normalizeItemName(item.name)}|${item.category}|${carbs}|${calories}`
}

function locationSort(a: MenuItemWithNutrition, b: MenuItemWithNutrition): number {
  const pa = a.restaurant?.park?.name ?? ''
  const pb = b.restaurant?.park?.name ?? ''
  if (pa !== pb) return pa.localeCompare(pb)
  return (a.restaurant?.name ?? '').localeCompare(b.restaurant?.name ?? '')
}

/**
 * Collapse duplicate menu items into one entry per unique product.
 *
 * Input order is preserved: each group appears at the position of its first
 * occurrence, so an already-sorted or relevance-ranked list stays ordered.
 */
export function consolidateItems(
  items: MenuItemWithNutrition[],
): ConsolidatedItem[] {
  const groups = new Map<string, MenuItemWithNutrition[]>()
  for (const item of items) {
    const key = groupKey(item)
    const existing = groups.get(key)
    if (existing) existing.push(item)
    else groups.set(key, [item])
  }

  const result: ConsolidatedItem[] = []
  for (const list of groups.values()) {
    const locations = [...list].sort(locationSort)
    result.push({ item: locations[0], locations })
  }
  return result
}
