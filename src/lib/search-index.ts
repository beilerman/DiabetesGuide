import Fuse, { type IFuseOptions } from 'fuse.js'
import type { MenuItemWithNutrition } from './types'

export type SearchIndex = Fuse<MenuItemWithNutrition>

const FUSE_OPTIONS: IFuseOptions<MenuItemWithNutrition> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'restaurant.name', weight: 1.5 },
    { name: 'description', weight: 1 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
}

export function buildSearchIndex(items: MenuItemWithNutrition[]): SearchIndex {
  return new Fuse(items, FUSE_OPTIONS)
}

export function searchItems(
  index: SearchIndex,
  query: string,
  limit = 50,
): MenuItemWithNutrition[] {
  if (!query.trim()) return []
  return index.search(query.trim(), { limit }).map(r => r.item)
}
