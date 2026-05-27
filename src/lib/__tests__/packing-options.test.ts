import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHECKLIST_OPTIONS,
  loadChecklistOptions,
  normalizeChecklistOptions,
  normalizeTripDays,
  saveChecklistOptions,
} from '../packing-options'

describe('packing checklist options', () => {
  it('keeps trip days within the supported 1 to 30 day range', () => {
    expect(normalizeTripDays(-4)).toBe(1)
    expect(normalizeTripDays(0)).toBe(1)
    expect(normalizeTripDays(7.8)).toBe(8)
    expect(normalizeTripDays(45)).toBe(30)
  })

  it('normalizes persisted options before using them', () => {
    expect(normalizeChecklistOptions({ t1: false, pump: true, tripDays: 99 })).toEqual({
      ...DEFAULT_CHECKLIST_OPTIONS,
      t1: false,
      pump: true,
      tripDays: 30,
    })
  })

  it('loads saved options and falls back to defaults for invalid storage', () => {
    localStorage.setItem('dg_checklist_options', JSON.stringify({ child: true, tripDays: 0 }))

    expect(loadChecklistOptions()).toEqual({
      ...DEFAULT_CHECKLIST_OPTIONS,
      child: true,
      tripDays: 1,
    })

    localStorage.setItem('dg_checklist_options', '{')
    expect(loadChecklistOptions()).toEqual(DEFAULT_CHECKLIST_OPTIONS)
  })

  it('saves normalized options', () => {
    saveChecklistOptions({ ...DEFAULT_CHECKLIST_OPTIONS, tripDays: 60 })

    expect(JSON.parse(localStorage.getItem('dg_checklist_options') ?? '{}')).toEqual({
      ...DEFAULT_CHECKLIST_OPTIONS,
      tripDays: 30,
    })
  })
})
