import { describe, expect, it } from 'vitest'
import { getBrowseSummary } from '../browse-summary'

describe('getBrowseSummary', () => {
  it('labels all-parks browse as a loaded preview when the full catalog is larger', () => {
    expect(getBrowseSummary({
      isLocationView: true,
      isAllParks: true,
      filteredCount: 2999,
      visibleItemCount: 48,
      totalLoadedItems: 2999,
      totalMenuRecordCount: 9261,
      locationRestaurantCount: 680,
    })).toEqual({
      main: 'Showing 2,999 loaded preview items',
      detail: 'across 680 restaurants',
      note: 'Full catalog: 9,261 menu records. Choose a destination for complete listings.',
    })
  })

  it('uses normal complete wording when a destination is selected', () => {
    expect(getBrowseSummary({
      isLocationView: false,
      isAllParks: false,
      filteredCount: 120,
      visibleItemCount: 48,
      totalLoadedItems: 120,
      totalMenuRecordCount: 9261,
      locationRestaurantCount: 12,
    })).toEqual({
      main: 'Showing 48 of 120 items',
      detail: null,
      note: null,
    })
  })

  it('mentions loaded source size when filters reduce the loaded preview', () => {
    expect(getBrowseSummary({
      isLocationView: false,
      isAllParks: true,
      filteredCount: 18,
      visibleItemCount: 18,
      totalLoadedItems: 2999,
      totalMenuRecordCount: 9261,
      locationRestaurantCount: 680,
    })).toEqual({
      main: 'Showing 18 items from 2,999 loaded preview items',
      detail: null,
      note: 'Full catalog: 9,261 menu records. Choose a destination for complete listings.',
    })
  })
})
