import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'dg_preferences'

export interface Preferences {
  highContrast: boolean
  fontScale: number
  carbGoal: number
}

const defaults: Preferences = { highContrast: false, fontScale: 1.0, carbGoal: 60 }

const MIN_FONT_SCALE = 0.8
const MAX_FONT_SCALE = 1.6

function clampFontScale(s: number): number {
  return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, s))
}

/**
 * Sanitize an untrusted parsed value into a valid Preferences object. A
 * corrupted or partial localStorage payload (missing keys, wrong types, NaN,
 * negative carb goal) falls back to defaults per-field rather than crashing or
 * poisoning the UI.
 */
function sanitize(raw: unknown): Preferences {
  if (!raw || typeof raw !== 'object') return { ...defaults }
  const r = raw as Record<string, unknown>
  return {
    highContrast: typeof r.highContrast === 'boolean' ? r.highContrast : defaults.highContrast,
    fontScale:
      typeof r.fontScale === 'number' && Number.isFinite(r.fontScale)
        ? clampFontScale(r.fontScale)
        : defaults.fontScale,
    carbGoal:
      typeof r.carbGoal === 'number' && Number.isFinite(r.carbGoal) && r.carbGoal >= 0
        ? r.carbGoal
        : defaults.carbGoal,
  }
}

function readFromStorage(): Preferences {
  if (typeof window === 'undefined') return { ...defaults }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults }
    return sanitize(JSON.parse(raw))
  } catch {
    return { ...defaults }
  }
}

/**
 * Apply preferences to the DOM. Done centrally (in the shared setter, not each
 * hook instance) so multiple mounted instances can't fight over the body class
 * or root font size.
 */
function applyDomEffects(prefs: Preferences) {
  if (typeof document === 'undefined') return
  document.documentElement.style.fontSize = `${16 * prefs.fontScale}px`
  document.body.classList.toggle('high-contrast', prefs.highContrast)
}

let sharedPrefs: Preferences = readFromStorage()
const listeners = new Set<() => void>()
applyDomEffects(sharedPrefs)

function notify() {
  for (const listener of listeners) listener()
}

function writeToStorage(prefs: Preferences) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

function setSharedPrefs(next: Preferences) {
  sharedPrefs = next
  writeToStorage(next)
  applyDomEffects(next)
  notify()
}

// Cross-tab sync: the `storage` event fires only in OTHER tabs.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      sharedPrefs = readFromStorage()
      applyDomEffects(sharedPrefs)
      notify()
    }
  })
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(sharedPrefs)

  useEffect(() => {
    const listener = () => setPrefs({ ...sharedPrefs })
    listeners.add(listener)
    // Reconcile in case the shared store changed between module init and mount.
    listener()
    return () => { listeners.delete(listener) }
  }, [])

  const setFontScale = useCallback((s: number) => {
    setSharedPrefs({ ...sharedPrefs, fontScale: clampFontScale(s) })
  }, [])

  const toggleContrast = useCallback(() => {
    setSharedPrefs({ ...sharedPrefs, highContrast: !sharedPrefs.highContrast })
  }, [])

  const setCarbGoal = useCallback((g: number) => {
    setSharedPrefs({ ...sharedPrefs, carbGoal: g })
  }, [])

  return { ...prefs, setFontScale, toggleContrast, setCarbGoal }
}

export function __resetPreferencesState(prefs?: Preferences) {
  listeners.clear()
  sharedPrefs = prefs ? sanitize(prefs) : { ...defaults }
  writeToStorage(sharedPrefs)
  applyDomEffects(sharedPrefs)
}
