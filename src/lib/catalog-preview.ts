import { CATALOG_PREVIEW } from '../data/catalog-preview'
import type { Park } from './types'

export interface CatalogPreviewPark {
  readonly id: string
  readonly name: string
  readonly location: string
  readonly timezone: string
  readonly resortId: string
  readonly categoryId: string
  readonly itemCount: number
  readonly restaurantCount: number
  readonly lands: readonly string[]
}

export interface CatalogPreview {
  readonly version: number
  readonly snapshotDate: string
  readonly generatedAt: string
  readonly totalItems: number
  readonly totalRestaurants: number
  readonly totalDestinations: number
  readonly parks: readonly CatalogPreviewPark[]
}

type CatalogPreviewFetcher = typeof fetch

export const STATIC_CATALOG_PREVIEW: CatalogPreview = CATALOG_PREVIEW

export function normalizeCatalogKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function catalogPreviewParkToPark(previewPark: CatalogPreviewPark): Park {
  return {
    id: previewPark.id,
    name: previewPark.name,
    location: previewPark.location,
    timezone: previewPark.timezone,
    first_aid_locations: [],
    created_at: '',
  }
}

export function getCatalogPreviewParks(preview: CatalogPreview = STATIC_CATALOG_PREVIEW): Park[] {
  return preview.parks.map(catalogPreviewParkToPark)
}

export function getCatalogPreviewItemCounts(preview: CatalogPreview = STATIC_CATALOG_PREVIEW): Map<string, number> {
  return new Map(preview.parks.map(park => [park.id, park.itemCount]))
}

export function getCatalogPreviewItemCountsForParks(
  preview: CatalogPreview,
  parks: Park[] | undefined,
): Map<string, number> {
  if (!parks || parks.length === 0) return getCatalogPreviewItemCounts(preview)

  return new Map(
    parks.map(park => {
      const previewPark = findCatalogPreviewPark(preview, park.id) ?? findCatalogPreviewPark(preview, park.name)
      return [park.id, previewPark?.itemCount ?? 0]
    }),
  )
}

export function findCatalogPreviewPark(
  preview: CatalogPreview,
  idOrName: string | undefined,
): CatalogPreviewPark | undefined {
  if (!idOrName) return undefined
  const key = normalizeCatalogKey(idOrName)
  return preview.parks.find(park =>
    park.id === idOrName ||
    normalizeCatalogKey(park.id) === key ||
    normalizeCatalogKey(park.name) === key
  )
}

export function getCatalogPreviewVenues(
  preview: CatalogPreview,
  resortId: string,
  categoryId: string,
): CatalogPreviewPark[] {
  return preview.parks.filter(park =>
    park.resortId === resortId &&
    park.categoryId === categoryId &&
    park.itemCount > 0
  )
}

export function isCatalogPreview(value: unknown): value is CatalogPreview {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CatalogPreview>
  return candidate.version === 1 &&
    typeof candidate.snapshotDate === 'string' &&
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.totalItems === 'number' &&
    typeof candidate.totalRestaurants === 'number' &&
    typeof candidate.totalDestinations === 'number' &&
    Array.isArray(candidate.parks) &&
    candidate.parks.every(isCatalogPreviewPark)
}

function isCatalogPreviewPark(value: unknown): value is CatalogPreviewPark {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CatalogPreviewPark>
  return typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.location === 'string' &&
    typeof candidate.timezone === 'string' &&
    typeof candidate.resortId === 'string' &&
    typeof candidate.categoryId === 'string' &&
    typeof candidate.itemCount === 'number' &&
    typeof candidate.restaurantCount === 'number' &&
    Array.isArray(candidate.lands)
}

export async function fetchCatalogPreview(fetcher: CatalogPreviewFetcher = fetch): Promise<CatalogPreview> {
  const response = await fetcher('/data/catalog-preview.json', { cache: 'force-cache' })
  if (!response.ok) throw new Error('Catalog preview unavailable')

  const preview = await response.json()
  if (!isCatalogPreview(preview)) throw new Error('Catalog preview malformed')
  return preview
}
