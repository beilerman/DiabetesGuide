import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'dg_preferences'

interface Preferences {
  highContrast: boolean
  fontScale: number
  carbGoal: number
}

const defaults: Preferences = { highContrast: false, fontScale: 1.0, carbGoal: 60 }

function load(): Preferences {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  } catch { return defaults }
}

let currentPrefs = load()
let lastStoredValue: string | null = null
const listeners = new Set<(prefs: Preferences) => void>()

function applyPreferenceEffects(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  document.documentElement.style.fontSize = `${16 * prefs.fontScale}px`
  document.body.classList.toggle('high-contrast', prefs.highContrast)
}

function getSnapshot(): Preferences {
  const storedValue = localStorage.getItem(STORAGE_KEY)
  if (storedValue !== lastStoredValue) {
    currentPrefs = load()
    lastStoredValue = storedValue
  }
  return currentPrefs
}

function commitPreferences(updater: (prefs: Preferences) => Preferences) {
  currentPrefs = updater(getSnapshot())
  lastStoredValue = JSON.stringify(currentPrefs)
  applyPreferenceEffects(currentPrefs)
  listeners.forEach(listener => listener(currentPrefs))
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(getSnapshot)

  useEffect(() => {
    const listener = (nextPrefs: Preferences) => setPrefs(nextPrefs)
    listeners.add(listener)
    applyPreferenceEffects(getSnapshot())
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const setFontScale = useCallback((s: number) => {
    commitPreferences(p => ({ ...p, fontScale: Math.max(0.8, Math.min(1.6, s)) }))
  }, [])

  const toggleContrast = useCallback(() => {
    commitPreferences(p => ({ ...p, highContrast: !p.highContrast }))
  }, [])

  const setCarbGoal = useCallback((g: number) => {
    commitPreferences(p => ({ ...p, carbGoal: g }))
  }, [])

  const resetPreferences = useCallback(() => {
    commitPreferences(() => defaults)
  }, [])

  return { ...prefs, setFontScale, toggleContrast, setCarbGoal, resetPreferences }
}
