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

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    document.documentElement.style.fontSize = `${16 * prefs.fontScale}px`
    document.body.classList.toggle('high-contrast', prefs.highContrast)
  }, [prefs])

  const setFontScale = useCallback((s: number) => {
    setPrefs(p => ({ ...p, fontScale: Math.max(0.8, Math.min(1.6, s)) }))
  }, [])

  const toggleContrast = useCallback(() => {
    setPrefs(p => ({ ...p, highContrast: !p.highContrast }))
  }, [])

  const setCarbGoal = useCallback((g: number) => {
    setPrefs(p => ({ ...p, carbGoal: g }))
  }, [])

  return { ...prefs, setFontScale, toggleContrast, setCarbGoal }
}
