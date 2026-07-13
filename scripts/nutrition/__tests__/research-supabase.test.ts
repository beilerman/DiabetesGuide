import { describe, expect, it } from 'vitest'

import {
  fetchEvidencedMenuItemIds,
  fetchResearchCatalog,
  resolveResearchSupabaseConfig,
  type ResearchQueryClient,
} from '../research-supabase.js'

describe('resolveResearchSupabaseConfig', () => {
  it('accepts an anon key from runtime environment', () => {
    expect(resolveResearchSupabaseConfig({}, {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
    })).toEqual({ url: 'https://project.supabase.co', key: 'anon' })
  })

  it('accepts publishable and Vite-compatible names', () => {
    expect(resolveResearchSupabaseConfig({}, {
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable',
    })).toEqual({ url: 'https://project.supabase.co', key: 'publishable' })
    expect(resolveResearchSupabaseConfig({}, {
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'vite-anon',
    })).toEqual({ url: 'https://project.supabase.co', key: 'vite-anon' })
  })

  it('rejects service-role-only configuration', () => {
    expect(() => resolveResearchSupabaseConfig({}, {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-only',
    })).toThrow(/anon or publishable/i)
  })

  it('keeps local URL and read-only key paired and rejects partial local config', () => {
    expect(resolveResearchSupabaseConfig({
      SUPABASE_URL: 'https://local.supabase.co',
      SUPABASE_ANON_KEY: 'local-anon',
    }, {
      SUPABASE_URL: 'https://runtime.supabase.co',
      SUPABASE_ANON_KEY: 'runtime-anon',
    })).toEqual({ url: 'https://local.supabase.co', key: 'local-anon' })

    expect(() => resolveResearchSupabaseConfig({
      SUPABASE_URL: 'https://local.supabase.co',
    }, {
      SUPABASE_URL: 'https://runtime.supabase.co',
      SUPABASE_ANON_KEY: 'runtime-anon',
    })).toThrow(/local.*anon or publishable/i)

    expect(() => resolveResearchSupabaseConfig({
      SUPABASE_ANON_KEY: 'local-anon',
    }, {
      SUPABASE_URL: 'https://runtime.supabase.co',
      SUPABASE_ANON_KEY: 'runtime-anon',
    })).toThrow(/local.*URL/i)
  })
})

function fakeClient(tables: Record<string, unknown[]>): {
  client: ResearchQueryClient
  calls: Array<{ table: string; select: string; order: string; from: number; to: number }>
} {
  const calls: Array<{ table: string; select: string; order: string; from: number; to: number }> = []
  return {
    calls,
    client: {
      from(table: string) {
        let selected = ''
        let ordered = ''
        const builder = {
          select(columns: string) {
            selected = columns
            return builder
          },
          order(column: string) {
            ordered = column
            return builder
          },
          async range(from: number, to: number) {
            calls.push({ table, select: selected, order: ordered, from, to })
            return { data: (tables[table] ?? []).slice(from, to + 1), error: null }
          },
        }
        return builder
      },
    },
  }
}

describe('read-only research queries', () => {
  it('paginates and normalizes catalog rows in stable ID order', async () => {
    const { client, calls } = fakeClient({
      menu_items: [
        {
          id: 'item-1',
          name: 'Pretzel',
          description: 'Warm pretzel',
          category: 'snack',
          restaurant: {
            name: 'Cart',
            park: { name: 'Magic Kingdom', location: 'Walt Disney World Resort' },
          },
          nutritional_data: [{
            id: 'nutrition-1',
            carbs: 50,
            confidence_score: 45,
            serving_quantity: 1,
            serving_unit: 'pretzel',
            serving_description: '1 pretzel',
            active_certification_id: null,
          }],
        },
        {
          id: 'item-2',
          name: 'Dessert',
          description: null,
          category: 'dessert',
          restaurant: [{
            name: 'Cafe',
            park: [{ name: 'EPCOT', location: 'Walt Disney World Resort' }],
          }],
          nutritional_data: [],
        },
      ],
    })
    const rows = await fetchResearchCatalog(client, 1)
    expect(rows).toEqual([
      expect.objectContaining({
        menuItemId: 'item-1',
        restaurantName: 'Cart',
        parkName: 'Magic Kingdom',
        parkLocation: 'Walt Disney World Resort',
        currentCarbs: 50,
        servingDescription: '1 pretzel',
      }),
      expect.objectContaining({
        menuItemId: 'item-2',
        nutritionDataId: null,
        currentCarbs: null,
        confidence: null,
      }),
    ])
    expect(calls.map(call => [call.table, call.order, call.from, call.to])).toEqual([
      ['menu_items', 'id', 0, 0],
      ['menu_items', 'id', 1, 1],
      ['menu_items', 'id', 2, 2],
    ])
    expect(calls[0].select).toContain('active_certification_id')
  })

  it('loads existing evidence IDs without exposing a write API', async () => {
    const { client, calls } = fakeClient({
      nutrition_sources: [
        { menu_item_id: 'item-2' },
        { menu_item_id: 'item-1' },
        { menu_item_id: 'item-2' },
      ],
    })
    await expect(fetchEvidencedMenuItemIds(client, 2)).resolves.toEqual(new Set(['item-1', 'item-2']))
    expect(calls[0]).toMatchObject({ table: 'nutrition_sources', order: 'menu_item_id' })
    expect('insert' in client).toBe(false)
    expect('update' in client).toBe(false)
  })
})
