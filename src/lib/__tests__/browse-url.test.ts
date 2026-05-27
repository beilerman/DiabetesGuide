import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS } from '../filters'
import { buildBrowsePresetUrl, getInitialBrowseFilters } from '../browse-url'

describe('browse URL helpers', () => {
  it('builds homepage quick-filter links with real browse query params', () => {
    expect(buildBrowsePresetUrl('low-carb')).toBe('/browse?maxCarbs=30&sort=carbsAsc')
    expect(buildBrowsePresetUrl('top-rated')).toBe('/browse?grade=A%2CB&sort=grade')
    expect(buildBrowsePresetUrl('gluten-free')).toBe('/browse?allergenFree=wheat&sort=name')
  })

  it('hydrates browse filters from query params', () => {
    const filters = getInitialBrowseFilters(new URLSearchParams('maxCarbs=30&grade=A,B&allergenFree=wheat&sort=grade'))

    expect(filters).toEqual({
      ...DEFAULT_FILTERS,
      maxCarbs: 30,
      gradeFilter: ['A', 'B'],
      allergenFree: ['wheat'],
      sort: 'grade',
    })
  })
})
