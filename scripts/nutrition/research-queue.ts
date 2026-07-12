import { createHash } from 'node:crypto'

import { dosingPriorityScore, TRUSTED_CONFIDENCE } from '../audit/trust.js'
import type { ResearchScope } from './research-contract.js'

export const MAX_RESEARCH_BATCH_SIZE = 5

export interface ResearchCatalogItem {
  menuItemId: string
  itemName: string
  description: string | null
  category: string | null
  restaurantName: string
  parkName: string
  parkLocation: string | null
  servingQuantity: number | null
  servingUnit: string | null
  servingDescription: string | null
  nutritionDataId: string | null
  currentCarbs: number | null
  confidence: number | null
  activeCertificationId: string | null
}

export interface ResearchQueueItem extends ResearchCatalogItem {
  priority: number
  catalogSnapshotHash: string
}

export interface ResearchQueue {
  schemaVersion: 1
  batchId: string
  scope: ResearchScope
  catalogSnapshotAt: string
  items: ResearchQueueItem[]
}

export interface ResearchQueueOptions {
  scope: ResearchScope
  limit: number
  pendingMenuItemIds: ReadonlySet<string>
  evidencedMenuItemIds: ReadonlySet<string>
  now: string
}

const WDW_PATTERNS = [
  /walt disney world/i,
  /magic kingdom/i,
  /\bepcot\b/i,
  /hollywood studios/i,
  /animal kingdom/i,
  /disney springs/i,
  /disney resort hotels?.*florida/i,
  /blizzard beach/i,
  /typhoon lagoon/i,
]

const PHASE_TWO_PATTERNS = [
  /disneyland resort/i,
  /disney cruise line/i,
  /aulani.*disney resort/i,
  /disneyland paris/i,
  /tokyo disney/i,
  /hong kong disneyland/i,
  /shanghai disney/i,
]

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}

function utcHour(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('now must be a valid ISO date')
  const iso = date.toISOString()
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}0000Z`
}

export function isDestinationInScope(location: string | null, scope: ResearchScope): boolean {
  const text = location?.trim() ?? ''
  if (WDW_PATTERNS.some(pattern => pattern.test(text))) return true
  return scope === 'all-disney' && PHASE_TWO_PATTERNS.some(pattern => pattern.test(text))
}

export function researchPriority(item: ResearchCatalogItem): number {
  const trustBand = item.currentCarbs == null
    ? 3
    : (item.confidence ?? 0) < TRUSTED_CONFIDENCE
      ? 2
      : 1
  return trustBand * 1_000_000
    + dosingPriorityScore(item.category, item.parkLocation, item.currentCarbs) * 1_000
}

export function catalogSnapshotHash(item: ResearchCatalogItem): string {
  return sha256(JSON.stringify({
    activeCertificationId: item.activeCertificationId,
    category: item.category,
    confidence: item.confidence,
    currentCarbs: item.currentCarbs,
    description: item.description,
    itemName: item.itemName,
    menuItemId: item.menuItemId,
    nutritionDataId: item.nutritionDataId,
    parkLocation: item.parkLocation,
    parkName: item.parkName,
    restaurantName: item.restaurantName,
    servingDescription: item.servingDescription,
    servingQuantity: item.servingQuantity,
    servingUnit: item.servingUnit,
  }))
}

export function buildResearchQueue(
  items: ResearchCatalogItem[],
  options: ResearchQueueOptions,
): ResearchQueue {
  if (!Number.isInteger(options.limit) || options.limit < 0 || options.limit > MAX_RESEARCH_BATCH_SIZE) {
    throw new Error(`limit must be an integer from 0 to ${MAX_RESEARCH_BATCH_SIZE}`)
  }
  const catalogSnapshotAt = new Date(options.now).toISOString()
  const selected = items
    .filter(item => isDestinationInScope(item.parkLocation ?? item.parkName, options.scope))
    .filter(item => item.activeCertificationId == null)
    .filter(item => !options.pendingMenuItemIds.has(item.menuItemId))
    .filter(item => !options.evidencedMenuItemIds.has(item.menuItemId))
    .map(item => ({
      ...item,
      priority: researchPriority(item),
      catalogSnapshotHash: catalogSnapshotHash(item),
    }))
    .sort((first, second) => second.priority - first.priority || compareText(first.menuItemId, second.menuItemId))
    .slice(0, options.limit)

  const identity = selected.map(item => `${item.menuItemId}:${item.catalogSnapshotHash}`).join('|')
  const suffix = sha256(`${options.scope}|${identity}`).slice(0, 8)
  return {
    schemaVersion: 1,
    batchId: `${options.scope}-${utcHour(catalogSnapshotAt)}-${suffix}`,
    scope: options.scope,
    catalogSnapshotAt,
    items: selected,
  }
}
