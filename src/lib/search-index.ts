import Fuse, { type FuseResult, type IFuseOptions } from 'fuse.js'
import { getMenuItemDisplayName } from './display'
import type { MenuItemWithNutrition } from './types'

export type SearchMatchTier = 'strong' | 'good' | 'weak'

export interface SearchItemMatch {
  item: MenuItemWithNutrition
  tier: SearchMatchTier
  reason: string
  score: number
  fuzzyScore?: number
}

export interface SearchIndex {
  fuse: Fuse<MenuItemWithNutrition>
  items: MenuItemWithNutrition[]
}

const FUSE_OPTIONS: IFuseOptions<MenuItemWithNutrition> = {
  keys: [
    { name: 'name', weight: 3 },
    { name: 'restaurant.name', weight: 1.5 },
    { name: 'description', weight: 0.75 },
  ],
  threshold: 0.34,
  includeScore: true,
  minMatchCharLength: 2,
}

const MAX_WEAK_FUZZY_SCORE = 0.34

export function buildSearchIndex(items: MenuItemWithNutrition[]): SearchIndex {
  return {
    fuse: new Fuse(items, FUSE_OPTIONS),
    items,
  }
}

export function searchItems(
  index: SearchIndex,
  query: string,
  limit = 50,
): MenuItemWithNutrition[] {
  return searchItemMatches(index, query, limit).map(match => match.item)
}

export function searchItemMatches(
  index: SearchIndex,
  query: string,
  limit = 50,
): SearchItemMatch[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const deterministicMatches = new Map<string, SearchItemMatch>()
  for (const item of index.items) {
    const match = getDeterministicMatch(item, trimmed)
    if (match) deterministicMatches.set(item.id, match)
  }

  const fuzzyMatches = index.fuse.search(trimmed, { limit: Math.max(limit * 3, limit) })
  for (const result of fuzzyMatches) {
    if (deterministicMatches.has(result.item.id)) continue
    const match = getWeakFuzzyMatch(result)
    if (match) deterministicMatches.set(result.item.id, match)
  }

  return [...deterministicMatches.values()]
    .sort((a, b) => b.score - a.score || getMenuItemDisplayName(a.item).localeCompare(getMenuItemDisplayName(b.item)))
    .slice(0, limit)
}

function getDeterministicMatch(item: MenuItemWithNutrition, query: string): SearchItemMatch | null {
  const normalizedQuery = normalize(query)
  if (normalizedQuery.length < 2) return null

  const name = normalize(getMenuItemDisplayName(item))
  const restaurant = normalize(item.restaurant?.name)
  const description = normalize(item.description)
  const queryTokens = tokenize(normalizedQuery)

  if (name === normalizedQuery) {
    return { item, tier: 'strong', reason: 'Exact name match', score: 120 }
  }
  if (name.startsWith(normalizedQuery)) {
    return { item, tier: 'strong', reason: 'Name starts with search', score: 112 }
  }
  if (hasWordBoundaryPhrase(name, normalizedQuery)) {
    return { item, tier: 'strong', reason: 'Name word match', score: 104 }
  }
  if (allTokensMatchWords(name, queryTokens)) {
    return { item, tier: 'good', reason: 'Name token match', score: 94 }
  }
  if (restaurant === normalizedQuery || restaurant.startsWith(normalizedQuery)) {
    return { item, tier: 'good', reason: 'Restaurant match', score: 82 }
  }
  if (hasWordBoundaryPhrase(restaurant, normalizedQuery)) {
    return { item, tier: 'good', reason: 'Restaurant word match', score: 78 }
  }
  if (hasWordBoundaryPhrase(description, normalizedQuery)) {
    return { item, tier: 'good', reason: 'Description word match', score: 68 }
  }

  return null
}

function getWeakFuzzyMatch(result: FuseResult<MenuItemWithNutrition>): SearchItemMatch | null {
  const fuzzyScore = result.score ?? 1
  if (fuzzyScore > MAX_WEAK_FUZZY_SCORE) return null

  return {
    item: result.item,
    tier: 'weak',
    reason: 'Fuzzy match',
    score: Math.max(1, 55 - fuzzyScore * 100),
    fuzzyScore,
  }
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).filter(token => token.length >= 2)
}

function hasWordBoundaryPhrase(value: string, query: string): boolean {
  if (!value || !query) return false
  return value.split(/\s+/).some((_, index, words) => words.slice(index, index + tokenize(query).length).join(' ') === query)
}

function allTokensMatchWords(value: string, queryTokens: string[]): boolean {
  if (!value || queryTokens.length === 0) return false
  const words = value.split(/\s+/)
  return queryTokens.every(token => words.some(word => word === token || word.startsWith(token)))
}
