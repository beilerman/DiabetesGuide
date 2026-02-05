// src/lib/resort-config.ts
import type { Park } from './types'

export interface ResortTheme {
  primary: string
  secondary: string
  accent: string
  gradient: string
}

export interface ResortCategory {
  id: string
  label: string
  icon: string
  /** Park names to match (case-insensitive substring) */
  matchParkNames?: string[]
  /** If true, this category uses is_seasonal filter instead of park matching */
  seasonalFilter?: boolean
}

export interface ResortConfig {
  id: string
  name: string
  location: string
  icon: string
  theme: ResortTheme
  categories: ResortCategory[]
}

export const RESORT_CONFIG: ResortConfig[] = [
  {
    id: 'wdw',
    name: 'Walt Disney World',
    location: 'Orlando, Florida',
    icon: '🏰',
    theme: {
      primary: '#6B21A8',
      secondary: '#2563EB',
      accent: '#F5D0FE',
      gradient: 'linear-gradient(135deg, #6B21A8, #2563EB)',
    },
    categories: [
      {
        id: 'theme-parks',
        label: 'Theme Parks',
        icon: '🎢',
        matchParkNames: ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom'],
      },
      {
        id: 'hotels',
        label: 'Resort Hotels',
        icon: '🏨',
        matchParkNames: ['Walt Disney World Resort Hotels'],
      },
      {
        id: 'disney-springs',
        label: 'Disney Springs',
        icon: '🛍️',
        matchParkNames: ['Disney Springs'],
      },
      {
        id: 'seasonal',
        label: 'Seasonal & Festivals',
        icon: '🎪',
        seasonalFilter: true,
      },
    ],
  },
  {
    id: 'disneyland',
    name: 'Disneyland Resort',
    location: 'Anaheim, California',
    icon: '🎆',
    theme: {
      primary: '#1E40AF',
      secondary: '#DB2777',
      accent: '#DBEAFE',
      gradient: 'linear-gradient(135deg, #1E40AF, #DB2777)',
    },
    categories: [
      {
        id: 'theme-parks',
        label: 'Theme Parks',
        icon: '🎢',
        matchParkNames: ['Disneyland Park', 'Disney California Adventure'],
      },
      {
        id: 'downtown-disney',
        label: 'Downtown Disney',
        icon: '🛍️',
        matchParkNames: ['Downtown Disney'],
      },
      {
        id: 'hotels',
        label: 'Resort Hotels',
        icon: '🏨',
        matchParkNames: ['Disneyland Resort Hotels'],
      },
    ],
  },
  {
    id: 'universal-orlando',
    name: 'Universal Orlando Resort',
    location: 'Orlando, Florida',
    icon: '🌍',
    theme: {
      primary: '#064E3B',
      secondary: '#22C55E',
      accent: '#D1FAE5',
      gradient: 'linear-gradient(135deg, #064E3B, #22C55E)',
    },
    categories: [
      {
        id: 'theme-parks',
        label: 'Theme Parks',
        icon: '🎢',
        matchParkNames: ['Universal Studios Florida', 'Islands of Adventure', 'Epic Universe'],
      },
      {
        id: 'water-parks',
        label: 'Water Parks',
        icon: '🌊',
        matchParkNames: ['Volcano Bay'],
      },
      {
        id: 'citywalk',
        label: 'CityWalk',
        icon: '🎵',
        matchParkNames: ['Universal CityWalk'],
      },
      {
        id: 'hotels',
        label: 'Resort Hotels',
        icon: '🏨',
        matchParkNames: [
          'Universal Aventura Hotel',
          'Universal Cabana Bay',
          'Universal Hard Rock Hotel',
          'Universal Portofino Bay',
          'Universal Royal Pacific',
          'Universal Sapphire Falls',
          'Universal Endless Summer - Dockside',
          'Universal Endless Summer - Surfside',
          'Universal Stella Nova',
          'Universal Terra Luna',
        ],
      },
    ],
  },
  {
    id: 'cruise',
    name: 'Disney Cruise Line',
    location: 'At Sea',
    icon: '🚢',
    theme: {
      primary: '#1E3A5F',
      secondary: '#0EA5E9',
      accent: '#E0F2FE',
      gradient: 'linear-gradient(135deg, #1E3A5F, #0EA5E9)',
    },
    categories: [
      {
        id: 'ships',
        label: 'Ships',
        icon: '🚢',
        matchParkNames: [
          'Disney Magic', 'Disney Wonder', 'Disney Dream',
          'Disney Fantasy', 'Disney Wish', 'Disney Treasure',
        ],
      },
    ],
  },
  {
    id: 'seaworld',
    name: 'SeaWorld Parks',
    location: 'Florida',
    icon: '🐬',
    theme: {
      primary: '#0F766E',
      secondary: '#06B6D4',
      accent: '#CCFBF1',
      gradient: 'linear-gradient(135deg, #0F766E, #06B6D4)',
    },
    categories: [
      {
        id: 'parks',
        label: 'Parks',
        icon: '🎢',
        matchParkNames: ['SeaWorld Orlando', 'Busch Gardens Tampa'],
      },
    ],
  },
  {
    id: 'aulani',
    name: 'Aulani Resort',
    location: 'Ko Olina, Hawaii',
    icon: '🌺',
    theme: {
      primary: '#C2410C',
      secondary: '#E879F9',
      accent: '#FFF7ED',
      gradient: 'linear-gradient(135deg, #C2410C, #E879F9)',
    },
    categories: [
      {
        id: 'dining',
        label: 'Dining',
        icon: '🍽️',
        matchParkNames: ['Aulani'],
      },
    ],
  },
  {
    id: 'dollywood',
    name: 'Dollywood',
    location: 'Pigeon Forge, Tennessee',
    icon: '🦅',
    theme: {
      primary: '#B45309',
      secondary: '#D97706',
      accent: '#FEF3C7',
      gradient: 'linear-gradient(135deg, #B45309, #D97706)',
    },
    categories: [
      {
        id: 'theme-park',
        label: 'Theme Park',
        icon: '🎢',
        matchParkNames: ['Dollywood'],
      },
    ],
  },
  {
    id: 'kings-island',
    name: 'Kings Island',
    location: 'Mason, Ohio',
    icon: '👑',
    theme: {
      primary: '#DC2626',
      secondary: '#F97316',
      accent: '#FEE2E2',
      gradient: 'linear-gradient(135deg, #DC2626, #F97316)',
    },
    categories: [
      {
        id: 'theme-park',
        label: 'Theme Park',
        icon: '🎢',
        matchParkNames: ['Kings Island'],
      },
    ],
  },
]

/** Find which resort a park belongs to based on park name or location */
export function findResortForPark(park: Park): ResortConfig | undefined {
  for (const resort of RESORT_CONFIG) {
    for (const category of resort.categories) {
      if (category.matchParkNames) {
        const match = category.matchParkNames.some(pattern =>
          park.name.toLowerCase().includes(pattern.toLowerCase())
        )
        if (match) return resort
      }
    }
  }
  return undefined
}

/** Find which category within a resort a park belongs to */
export function findCategoryForPark(resort: ResortConfig, park: Park): ResortCategory | undefined {
  for (const category of resort.categories) {
    if (category.matchParkNames) {
      const match = category.matchParkNames.some(pattern =>
        park.name.toLowerCase().includes(pattern.toLowerCase())
      )
      if (match) return category
    }
  }
  return undefined
}

/** Get all parks that match a specific resort + category */
export function getParksForCategory(
  parks: Park[],
  resort: ResortConfig,
  categoryId: string
): Park[] {
  const category = resort.categories.find(c => c.id === categoryId)
  if (!category || !category.matchParkNames) return []
  return parks.filter(park =>
    category.matchParkNames!.some(pattern =>
      park.name.toLowerCase().includes(pattern.toLowerCase())
    )
  )
}

/** Get the resort config by ID */
export function getResortById(resortId: string): ResortConfig | undefined {
  return RESORT_CONFIG.find(r => r.id === resortId)
}

/** Get all parks belonging to a resort (across all categories) */
export function getParksForResort(parks: Park[], resort: ResortConfig): Park[] {
  const allPatterns: string[] = []
  for (const cat of resort.categories) {
    if (cat.matchParkNames) allPatterns.push(...cat.matchParkNames)
  }
  return parks.filter(park =>
    allPatterns.some(pattern =>
      park.name.toLowerCase().includes(pattern.toLowerCase())
    )
  )
}
