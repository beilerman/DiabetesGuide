import type { ChecklistOptions } from '../data/checklist'
import { STORAGE_KEYS } from './storage-keys'

export const CHECKLIST_OPTIONS_KEY = STORAGE_KEYS.checklistOptions

export const MIN_TRIP_DAYS = 1
export const MAX_TRIP_DAYS = 30

export const DEFAULT_CHECKLIST_OPTIONS: ChecklistOptions = {
  t1: true,
  t2: false,
  pump: false,
  cgm: false,
  child: false,
  tripDays: 3,
}

export function normalizeTripDays(value: number): number {
  if (!Number.isFinite(value)) return MIN_TRIP_DAYS
  return Math.min(MAX_TRIP_DAYS, Math.max(MIN_TRIP_DAYS, Math.round(value)))
}

export function normalizeChecklistOptions(value: Partial<ChecklistOptions> | null | undefined): ChecklistOptions {
  return {
    t1: value?.t1 ?? DEFAULT_CHECKLIST_OPTIONS.t1,
    t2: value?.t2 ?? DEFAULT_CHECKLIST_OPTIONS.t2,
    pump: value?.pump ?? DEFAULT_CHECKLIST_OPTIONS.pump,
    cgm: value?.cgm ?? DEFAULT_CHECKLIST_OPTIONS.cgm,
    child: value?.child ?? DEFAULT_CHECKLIST_OPTIONS.child,
    tripDays: normalizeTripDays(value?.tripDays ?? DEFAULT_CHECKLIST_OPTIONS.tripDays),
  }
}

export function loadChecklistOptions(): ChecklistOptions {
  try {
    return normalizeChecklistOptions(JSON.parse(localStorage.getItem(CHECKLIST_OPTIONS_KEY) || '{}'))
  } catch {
    return DEFAULT_CHECKLIST_OPTIONS
  }
}

export function saveChecklistOptions(options: ChecklistOptions): void {
  localStorage.setItem(CHECKLIST_OPTIONS_KEY, JSON.stringify(normalizeChecklistOptions(options)))
}
