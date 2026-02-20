import { useParams } from 'react-router-dom'
import { type ParkTheme, getThemeForResort, DEFAULT_THEME } from '../lib/park-themes'

/**
 * Resolves the current park theme from route params.
 * Returns the resort-specific theme when inside a resort route,
 * or the default teal theme otherwise.
 */
export function useCurrentTheme(): ParkTheme {
  const { resortId } = useParams<{ resortId?: string }>()
  if (!resortId) return DEFAULT_THEME
  return getThemeForResort(resortId)
}
