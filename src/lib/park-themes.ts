export interface ParkTheme {
  id: string
  gradient: string
  primary: string
  secondary: string
  surface: string
  icon: string
  pattern: 'castle' | 'globe' | 'nature' | 'mountains' | 'coaster' | 'none'
}

export const PARK_THEMES: Record<string, ParkTheme> = {
  wdw: {
    id: 'wdw',
    gradient: 'linear-gradient(135deg, #4338ca, #6366f1)',
    primary: '#4338ca',
    secondary: '#6366f1',
    surface: '#eef2ff',
    icon: '🏰',
    pattern: 'castle',
  },
  disneyland: {
    id: 'disneyland',
    gradient: 'linear-gradient(135deg, #be185d, #f472b6)',
    primary: '#be185d',
    secondary: '#f472b6',
    surface: '#fdf2f8',
    icon: '🎆',
    pattern: 'castle',
  },
  'universal-orlando': {
    id: 'universal-orlando',
    gradient: 'linear-gradient(135deg, #1c1917, #f59e0b)',
    primary: '#f59e0b',
    secondary: '#1c1917',
    surface: '#fefce8',
    icon: '🌍',
    pattern: 'globe',
  },
  seaworld: {
    id: 'seaworld',
    gradient: 'linear-gradient(135deg, #0e7490, #22d3ee)',
    primary: '#0e7490',
    secondary: '#22d3ee',
    surface: '#ecfeff',
    icon: '🐬',
    pattern: 'nature',
  },
  dollywood: {
    id: 'dollywood',
    gradient: 'linear-gradient(135deg, #92400e, #d97706)',
    primary: '#92400e',
    secondary: '#d97706',
    surface: '#fffbeb',
    icon: '🦅',
    pattern: 'mountains',
  },
  'kings-island': {
    id: 'kings-island',
    gradient: 'linear-gradient(135deg, #dc2626, #f97316)',
    primary: '#dc2626',
    secondary: '#f97316',
    surface: '#fef2f2',
    icon: '👑',
    pattern: 'coaster',
  },
  cruise: {
    id: 'cruise',
    gradient: 'linear-gradient(135deg, #1e3a5f, #0ea5e9)',
    primary: '#1e3a5f',
    secondary: '#0ea5e9',
    surface: '#f0f9ff',
    icon: '🚢',
    pattern: 'none',
  },
  aulani: {
    id: 'aulani',
    gradient: 'linear-gradient(135deg, #c2410c, #e879f9)',
    primary: '#c2410c',
    secondary: '#e879f9',
    surface: '#fff7ed',
    icon: '🌺',
    pattern: 'none',
  },
  festivals: {
    id: 'festivals',
    gradient: 'linear-gradient(135deg, #0d9488, #2dd4bf)',
    primary: '#0d9488',
    secondary: '#2dd4bf',
    surface: '#f0fdfa',
    icon: '🎪',
    pattern: 'globe',
  },
}

export const DEFAULT_THEME: ParkTheme = {
  id: 'default',
  gradient: 'linear-gradient(135deg, #0d9488, #059669)',
  primary: '#0d9488',
  secondary: '#059669',
  surface: '#f0fdfa',
  icon: '🍽️',
  pattern: 'none',
}

export function getThemeForResort(resortId: string): ParkTheme {
  return PARK_THEMES[resortId] ?? DEFAULT_THEME
}
