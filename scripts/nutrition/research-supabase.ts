import { createClient } from '@supabase/supabase-js'

import { loadEnv } from '../audit/utils.js'
import type { ResearchCatalogItem } from './research-queue.js'

interface ResearchQueryResult {
  data: unknown[] | null
  error: { message?: string } | null
}

export interface ResearchQueryBuilder {
  select(columns: string): ResearchQueryBuilder
  order(column: string): ResearchQueryBuilder
  range(from: number, to: number): Promise<ResearchQueryResult>
}

export interface ResearchQueryClient {
  from(table: string): ResearchQueryBuilder
}

export interface ResearchSupabaseConfig {
  url: string
  key: string
}

function readOnlyKey(env: Record<string, string | undefined>): string | undefined {
  return env.SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY
    || env.VITE_SUPABASE_ANON_KEY
}

function supabaseUrl(env: Record<string, string | undefined>): string | undefined {
  return env.SUPABASE_URL || env.VITE_SUPABASE_URL
}

export function resolveResearchSupabaseConfig(
  envVars: Record<string, string> = loadEnv(),
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): ResearchSupabaseConfig {
  const localUrl = supabaseUrl(envVars)
  const localKey = readOnlyKey(envVars)
  if (localUrl || localKey) {
    if (!localUrl) throw new Error('Local Supabase configuration is missing a URL')
    if (!localKey) throw new Error('Local Supabase configuration requires an anon or publishable key')
    return { url: localUrl, key: localKey }
  }

  const runtimeUrl = supabaseUrl(runtimeEnv)
  const runtimeKey = readOnlyKey(runtimeEnv)
  if (!runtimeUrl) throw new Error('Research requires SUPABASE_URL or VITE_SUPABASE_URL')
  if (!runtimeKey) throw new Error('Research requires an anon or publishable Supabase key')
  return { url: runtimeUrl, key: runtimeKey }
}

export function createResearchSupabaseClient(
  config = resolveResearchSupabaseConfig(),
): ResearchQueryClient {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as unknown as ResearchQueryClient
}

async function fetchAllPages(
  client: ResearchQueryClient,
  table: string,
  columns: string,
  orderColumn: string,
  pageSize: number,
): Promise<unknown[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('pageSize must be a positive integer')
  const rows: unknown[] = []
  let offset = 0
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderColumn)
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Failed to read ${table}: ${error.message ?? 'unknown Supabase error'}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

function record(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function one(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return record(value[0])
  return record(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeCatalogRow(value: unknown): ResearchCatalogItem {
  const row = record(value)
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string') {
    throw new Error('Supabase returned an invalid menu_items row')
  }
  const restaurant = one(row.restaurant)
  const park = one(restaurant?.park)
  const nutrition = one(row.nutritional_data)
  return {
    menuItemId: row.id,
    itemName: row.name,
    description: text(row.description),
    category: text(row.category),
    restaurantName: text(restaurant?.name) ?? 'Unknown Restaurant',
    parkName: text(park?.name) ?? 'Unknown Park',
    parkLocation: text(park?.location),
    servingQuantity: number(nutrition?.serving_quantity),
    servingUnit: text(nutrition?.serving_unit),
    servingDescription: text(nutrition?.serving_description),
    nutritionDataId: text(nutrition?.id),
    currentCarbs: number(nutrition?.carbs),
    confidence: number(nutrition?.confidence_score),
    activeCertificationId: text(nutrition?.active_certification_id),
  }
}

export async function fetchResearchCatalog(
  client: ResearchQueryClient,
  pageSize = 500,
): Promise<ResearchCatalogItem[]> {
  const rows = await fetchAllPages(
    client,
    'menu_items',
    `id, name, description, category,
     restaurant:restaurants(name, park:parks(name, location)),
     nutritional_data(id, carbs, confidence_score, serving_quantity, serving_unit,
       serving_description, active_certification_id)`,
    'id',
    pageSize,
  )
  return rows.map(normalizeCatalogRow)
}

export async function fetchEvidencedMenuItemIds(
  client: ResearchQueryClient,
  pageSize = 500,
): Promise<Set<string>> {
  const rows = await fetchAllPages(
    client,
    'nutrition_sources',
    'menu_item_id',
    'menu_item_id',
    pageSize,
  )
  const ids = rows
    .map(record)
    .map(row => text(row?.menu_item_id))
    .filter((id): id is string => id != null)
  return new Set(ids.sort())
}
