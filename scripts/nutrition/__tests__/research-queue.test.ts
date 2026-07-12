import { describe, expect, it } from 'vitest'

import {
  buildResearchQueue,
  isDestinationInScope,
  researchPriority,
  type ResearchCatalogItem,
} from '../research-queue.js'

function item(overrides: Partial<ResearchCatalogItem> = {}): ResearchCatalogItem {
  return {
    menuItemId: 'item-1',
    itemName: 'Example Entree',
    description: 'A current menu item',
    category: 'entree',
    restaurantName: 'Example Restaurant',
    parkName: 'Magic Kingdom',
    parkLocation: 'Walt Disney World Resort',
    servingQuantity: null,
    servingUnit: null,
    servingDescription: null,
    nutritionDataId: 'nutrition-1',
    currentCarbs: 45,
    confidence: 40,
    activeCertificationId: null,
    ...overrides,
  }
}

describe('isDestinationInScope', () => {
  it.each([
    ['Walt Disney World Resort', true],
    ['Magic Kingdom — Walt Disney World', true],
    ['EPCOT at Walt Disney World', true],
    ['Disney Springs, Walt Disney World', true],
    ['Disney Resort Hotels - Florida', true],
    ['Disney’s Blizzard Beach Water Park', true],
    ['Disney’s Typhoon Lagoon Water Park', true],
    ['EPCOT International Food & Wine Festival', true],
    ['Disneyland Resort', false],
    ['Disney Cruise Line', false],
    ['Aulani, A Disney Resort & Spa', false],
    ['Universal Orlando', false],
  ])('classifies %s for WDW scope', (location, expected) => {
    expect(isDestinationInScope(location, 'wdw')).toBe(expected)
  })

  it.each([
    'Walt Disney World Resort',
    'Disneyland Resort',
    'Disney Cruise Line',
    'Aulani, A Disney Resort & Spa',
    'Disneyland Paris',
    'Tokyo Disney Resort',
    'Hong Kong Disneyland',
    'Shanghai Disney Resort',
  ])('includes %s in all-Disney scope', location => {
    expect(isDestinationInScope(location, 'all-disney')).toBe(true)
  })

  it('does not treat non-Disney destinations as phase 2', () => {
    expect(isDestinationInScope('Universal Orlando Resort', 'all-disney')).toBe(false)
  })
})

describe('researchPriority', () => {
  it('ranks missing carbs above low-confidence and trusted values', () => {
    const missing = researchPriority(item({ currentCarbs: null, confidence: null }))
    const low = researchPriority(item({ currentCarbs: 80, confidence: 30 }))
    const trusted = researchPriority(item({ currentCarbs: 80, confidence: 90 }))
    expect(missing).toBeGreaterThan(low)
    expect(low).toBeGreaterThan(trusted)
  })

  it('uses category and dosing magnitude within the same trust band', () => {
    const entree = researchPriority(item({ category: 'entree', currentCarbs: 90 }))
    const beverage = researchPriority(item({ category: 'beverage', currentCarbs: 10 }))
    expect(entree).toBeGreaterThan(beverage)
  })
})

describe('buildResearchQueue', () => {
  it('filters certified, evidenced, pending, and out-of-scope items but keeps chains', () => {
    const queue = buildResearchQueue([
      item({ menuItemId: 'chain', restaurantName: 'Starbucks' }),
      item({ menuItemId: 'certified', activeCertificationId: 'cert-1' }),
      item({ menuItemId: 'evidenced' }),
      item({ menuItemId: 'pending' }),
      item({ menuItemId: 'land', parkLocation: 'Disneyland Resort' }),
    ], {
      scope: 'wdw',
      limit: 5,
      pendingMenuItemIds: new Set(['pending']),
      evidencedMenuItemIds: new Set(['evidenced']),
      now: '2026-07-12T12:34:56.000Z',
    })
    expect(queue.items.map(result => result.menuItemId)).toEqual(['chain'])
  })

  it('orders deterministically and uses menu item ID as the final tie-breaker', () => {
    const source = [
      item({ menuItemId: 'z-id', itemName: 'Same' }),
      item({ menuItemId: 'a-id', itemName: 'Same' }),
      item({ menuItemId: 'missing', currentCarbs: null, confidence: null }),
      item({ menuItemId: 'trusted', confidence: 90 }),
    ]
    const options = {
      scope: 'wdw' as const,
      limit: 5,
      pendingMenuItemIds: new Set<string>(),
      evidencedMenuItemIds: new Set<string>(),
      now: '2026-07-12T12:34:56.000Z',
    }
    const first = buildResearchQueue(source, options)
    const second = buildResearchQueue([...source].reverse(), options)
    expect(first).toEqual(second)
    expect(first.items.map(result => result.menuItemId)).toEqual(['missing', 'a-id', 'z-id', 'trusted'])
    expect(first.batchId).toMatch(/^wdw-20260712T120000Z-[a-f0-9]{8}$/)
  })

  it('limits a batch to five and rejects a larger requested limit', () => {
    const candidates = Array.from({ length: 7 }, (_, index) => item({ menuItemId: `item-${index}` }))
    const options = {
      scope: 'wdw' as const,
      limit: 5,
      pendingMenuItemIds: new Set<string>(),
      evidencedMenuItemIds: new Set<string>(),
      now: '2026-07-12T12:00:00.000Z',
    }
    expect(buildResearchQueue(candidates, options).items).toHaveLength(5)
    expect(() => buildResearchQueue(candidates, { ...options, limit: 6 })).toThrow(/limit/i)
  })

  it('adds phase-2 destinations without changing the artifact contract', () => {
    const queue = buildResearchQueue([
      item({ menuItemId: 'wdw' }),
      item({ menuItemId: 'dlr', parkLocation: 'Disneyland Resort' }),
      item({ menuItemId: 'cruise', parkLocation: 'Disney Cruise Line' }),
      item({ menuItemId: 'aulani', parkLocation: 'Aulani, A Disney Resort & Spa' }),
    ], {
      scope: 'all-disney',
      limit: 5,
      pendingMenuItemIds: new Set(),
      evidencedMenuItemIds: new Set(),
      now: '2026-07-12T12:00:00.000Z',
    })
    expect(new Set(queue.items.map(result => result.menuItemId))).toEqual(
      new Set(['wdw', 'dlr', 'cruise', 'aulani']),
    )
    expect(queue.scope).toBe('all-disney')
  })

  it('captures a stable hash of catalog fields used by later drift checks', () => {
    const first = buildResearchQueue([item()], {
      scope: 'wdw',
      limit: 5,
      pendingMenuItemIds: new Set(),
      evidencedMenuItemIds: new Set(),
      now: '2026-07-12T12:00:00.000Z',
    })
    const changed = buildResearchQueue([item({ currentCarbs: 46 })], {
      scope: 'wdw',
      limit: 5,
      pendingMenuItemIds: new Set(),
      evidencedMenuItemIds: new Set(),
      now: '2026-07-12T12:00:00.000Z',
    })
    expect(first.items[0].catalogSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.items[0].catalogSnapshotHash).not.toBe(changed.items[0].catalogSnapshotHash)
  })
})
