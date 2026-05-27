export interface BrowseSummaryInput {
  isLocationView: boolean
  isAllParks: boolean
  filteredCount: number
  visibleItemCount: number
  totalLoadedItems: number
  totalMenuRecordCount?: number
  locationRestaurantCount: number
}

export interface BrowseSummary {
  main: string
  detail: string | null
  note: string | null
  previewTooltip: string | null
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

export const PREVIEW_ITEMS_TOOLTIP = 'All Parks shows a 3,000-item preview for speed; pick a destination for the full catalog.'

export function getBrowseSummary(input: BrowseSummaryInput): BrowseSummary {
  const {
    isLocationView,
    isAllParks,
    filteredCount,
    visibleItemCount,
    totalLoadedItems,
    totalMenuRecordCount,
    locationRestaurantCount,
  } = input
  const isPreview = isAllParks && totalMenuRecordCount != null && totalMenuRecordCount > totalLoadedItems
  const loadedLabel = isPreview ? 'loaded preview items' : 'loaded items'
  const note = isPreview
    ? `Full catalog: ${formatCount(totalMenuRecordCount)} menu items. Choose a destination for complete listings.`
    : null
  const previewTooltip = isPreview ? PREVIEW_ITEMS_TOOLTIP : null

  if (isLocationView) {
    return {
      main: `Showing ${formatCount(filteredCount)} ${loadedLabel}`,
      detail: `across ${formatCount(locationRestaurantCount)} restaurants`,
      note,
      previewTooltip,
    }
  }

  if (filteredCount !== visibleItemCount) {
    return {
      main: `Showing ${formatCount(visibleItemCount)} of ${formatCount(filteredCount)} items`,
      detail: null,
      note,
      previewTooltip,
    }
  }

  if (isPreview && filteredCount !== totalLoadedItems) {
    return {
      main: `Showing ${formatCount(visibleItemCount)} items from ${formatCount(totalLoadedItems)} loaded preview items`,
      detail: null,
      note,
      previewTooltip,
    }
  }

  return {
    main: `Showing ${formatCount(visibleItemCount)} items`,
    detail: null,
    note,
    previewTooltip,
  }
}
