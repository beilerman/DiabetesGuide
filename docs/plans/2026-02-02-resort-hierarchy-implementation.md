# Resort Hierarchy UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the app navigation from a flat park list to a 4-level resort hierarchy (Resort > Category > Venue > Menu Items) with themed visuals.

**Architecture:** Static config file (`lib/resort-config.ts`) maps the existing 24 database parks into resort groupings with themed colors. New page components for each hierarchy level use existing React Query hooks. No database changes needed — all mapping is client-side.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, React Router v7, TanStack React Query v5, Supabase (read-only).

**Validation:** No test runner configured. Validate via `npm run build` (TypeScript check) + manual UI testing in dev server.

---

### Task 1: Create Resort Config (`lib/resort-config.ts`)

The static data file that defines the entire resort hierarchy. Every other task depends on this.

**Files:**
- Create: `src/lib/resort-config.ts`

**Step 1: Create the resort config file**

```typescript
// src/lib/resort-config.ts
import type { Park, MenuItemWithNutrition } from './types'

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
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors related to resort-config.

**Step 3: Commit**

```bash
git add src/lib/resort-config.ts
git commit -m "feat: add resort hierarchy config with theme data and park mapping"
```

---

### Task 2: Create Breadcrumb Component (`components/ui/Breadcrumb.tsx`)

Shared navigation component used on Level 2, 3, and 4 pages.

**Files:**
- Create: `src/components/ui/Breadcrumb.tsx`

**Step 1: Create the breadcrumb component**

```typescript
// src/components/ui/Breadcrumb.tsx
import { Link } from 'react-router-dom'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface Props {
  items: BreadcrumbItem[]
  accentColor?: string
}

export function Breadcrumb({ items, accentColor }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          {i > 0 && (
            <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {item.to ? (
            <Link
              to={item.to}
              className="font-medium hover:underline transition-colors"
              style={{ color: accentColor || '#0d9488' }}
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-stone-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/ui/Breadcrumb.tsx
git commit -m "feat: add Breadcrumb navigation component"
```

---

### Task 3: Create ResortCard Component (`components/resort/ResortCard.tsx`)

The hero card displayed on the Home page for each resort.

**Files:**
- Create: `src/components/resort/ResortCard.tsx`

**Step 1: Create the ResortCard component**

```typescript
// src/components/resort/ResortCard.tsx
import { Link } from 'react-router-dom'
import type { ResortConfig } from '../../lib/resort-config'

interface Props {
  resort: ResortConfig
  parkCount: number
  venueCount: number
  itemCount: number
}

export function ResortCard({ resort, parkCount, venueCount, itemCount }: Props) {
  return (
    <Link
      to={`/resort/${resort.id}`}
      className="block rounded-2xl overflow-hidden shadow-md hover:shadow-xl active:scale-[0.98] transition-all duration-200"
    >
      <div
        className="relative h-44 p-6 flex flex-col justify-end"
        style={{ background: resort.theme.gradient }}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 50%)'
        }} />

        <div className="relative z-10">
          <div className="text-4xl mb-2">{resort.icon}</div>
          <h2 className="text-2xl font-bold text-white leading-tight">{resort.name}</h2>
          <p className="text-white/70 text-sm mt-1">{resort.location}</p>
          <div className="flex items-center gap-3 mt-3 text-white/80 text-sm">
            {parkCount > 0 && (
              <span>{parkCount} {parkCount === 1 ? 'Park' : 'Parks'}</span>
            )}
            {venueCount > 0 && (
              <>
                <span className="text-white/40">·</span>
                <span>{venueCount} Venues</span>
              </>
            )}
            <span className="text-white/40">·</span>
            <span>{itemCount} Items</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/resort/ResortCard.tsx
git commit -m "feat: add ResortCard hero component with themed gradients"
```

---

### Task 4: Create CategoryCard Component (`components/resort/CategoryCard.tsx`)

The card shown on the Resort Detail page for each category (Theme Parks, Hotels, etc.).

**Files:**
- Create: `src/components/resort/CategoryCard.tsx`

**Step 1: Create the CategoryCard component**

```typescript
// src/components/resort/CategoryCard.tsx
import { Link } from 'react-router-dom'
import type { ResortCategory, ResortTheme } from '../../lib/resort-config'

interface Props {
  category: ResortCategory
  resortId: string
  theme: ResortTheme
  venueCount: number
  itemCount: number
}

export function CategoryCard({ category, resortId, theme, venueCount, itemCount }: Props) {
  return (
    <Link
      to={`/resort/${resortId}/${category.id}`}
      className="block rounded-2xl overflow-hidden border border-stone-200 shadow-sm hover:shadow-lg active:scale-[0.98] transition-all duration-200"
      style={{ backgroundColor: theme.accent + '40' }}
    >
      <div className="p-5">
        <div className="text-3xl mb-2">{category.icon}</div>
        <h3 className="text-lg font-bold text-stone-900">{category.label}</h3>
        <div className="flex items-center gap-2 mt-2 text-sm text-stone-600">
          {venueCount > 0 && (
            <span>{venueCount} {venueCount === 1 ? 'venue' : 'venues'}</span>
          )}
          {venueCount > 0 && <span className="text-stone-400">·</span>}
          <span>{itemCount} items</span>
        </div>
      </div>
      {/* Bottom accent bar */}
      <div className="h-1" style={{ background: theme.gradient }} />
    </Link>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/resort/CategoryCard.tsx
git commit -m "feat: add CategoryCard component with resort-themed styling"
```

---

### Task 5: Create VenueCard Component (`components/resort/VenueCard.tsx`)

The card shown on the Venue List page for each individual park/venue.

**Files:**
- Create: `src/components/resort/VenueCard.tsx`

**Step 1: Create the VenueCard component**

```typescript
// src/components/resort/VenueCard.tsx
import { Link } from 'react-router-dom'
import type { ResortTheme } from '../../lib/resort-config'

// Park emoji mapping (extracted from old Home.tsx)
export function getParkEmoji(parkName: string): string {
  const name = parkName.toLowerCase()
  if (name.includes('magic kingdom') || name.includes('disneyland park')) return '🏰'
  if (name.includes('epcot')) return '🌐'
  if (name.includes('hollywood') || name.includes('studios')) return '🎬'
  if (name.includes('animal kingdom') && !name.includes('lodge')) return '🦁'
  if (name.includes('cruise') || name.includes('disney magic') || name.includes('disney wonder') || name.includes('disney dream') || name.includes('disney fantasy') || name.includes('disney wish') || name.includes('disney treasure')) return '🚢'
  if (name.includes('aulani')) return '🌺'
  if (name.includes('resort') || name.includes('hotel') || name.includes('lodge')) return '🏨'
  if (name.includes('epic universe')) return '🌌'
  if (name.includes('universal')) return '🎢'
  if (name.includes('islands')) return '🏝️'
  if (name.includes('water') || name.includes('aquatica') || name.includes('blizzard') || name.includes('typhoon') || name.includes('volcano')) return '🌊'
  if (name.includes('adventure') || name.includes('busch')) return '🎪'
  if (name.includes('legoland')) return '🧱'
  if (name.includes('springs') || name.includes('downtown disney')) return '🛍️'
  if (name.includes('seaworld')) return '🐬'
  return '🎡'
}

interface Props {
  parkId: string
  parkName: string
  resortId: string
  categoryId: string
  theme: ResortTheme
  lands: string[]
  restaurantCount: number
  itemCount: number
}

export function VenueCard({
  parkId, parkName, resortId, categoryId, theme,
  lands, restaurantCount, itemCount,
}: Props) {
  const maxLands = 3
  const visibleLands = lands.slice(0, maxLands)
  const remaining = lands.length - maxLands

  return (
    <Link
      to={`/resort/${resortId}/${categoryId}/${parkId}`}
      className="flex items-center gap-4 rounded-2xl bg-white border-l-4 border border-stone-200 p-5 shadow-sm hover:shadow-lg transition-all duration-200"
      style={{ borderLeftColor: theme.primary }}
    >
      <div className="text-3xl flex-shrink-0">{getParkEmoji(parkName)}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-stone-900">{parkName}</h3>
        {visibleLands.length > 0 && (
          <p className="text-sm text-stone-500 mt-0.5 truncate">
            {visibleLands.join(', ')}{remaining > 0 ? ` + ${remaining} more` : ''}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-sm text-stone-600">
          <span>{restaurantCount} {restaurantCount === 1 ? 'restaurant' : 'restaurants'}</span>
          <span className="text-stone-400">·</span>
          <span>{itemCount} items</span>
        </div>
      </div>
      <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </Link>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/resort/VenueCard.tsx
git commit -m "feat: add VenueCard component with park emoji and themed border"
```

---

### Task 6: Create RestaurantGroup Component (`components/menu/RestaurantGroup.tsx`)

Collapsible restaurant section used on the VenueMenu page (Level 4).

**Files:**
- Create: `src/components/menu/RestaurantGroup.tsx`

**Step 1: Create the RestaurantGroup component**

```typescript
// src/components/menu/RestaurantGroup.tsx
import { useState } from 'react'
import { MenuItemCard } from './MenuItemCard'
import type { MenuItemWithNutrition, MealItem } from '../../lib/types'

interface Props {
  restaurantName: string
  land: string | null
  items: MenuItemWithNutrition[]
  defaultExpanded: boolean
  accentColor?: string
  onAddToMeal: (item: MealItem) => void
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string) => void
}

export function RestaurantGroup({
  restaurantName, land, items, defaultExpanded, accentColor,
  onAddToMeal, isFavorite, onToggleFavorite,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-3 w-full text-left p-4 hover:bg-stone-50 transition-colors"
        aria-expanded={expanded}
      >
        <svg
          className={`w-5 h-5 text-stone-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-stone-900" style={{ color: expanded ? (accentColor || undefined) : undefined }}>
            {restaurantName}
          </h3>
          <div className="flex items-center gap-2 text-sm text-stone-500">
            {land && <span>{land}</span>}
            {land && <span className="text-stone-300">·</span>}
            <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToMeal={onAddToMeal}
                isFavorite={isFavorite(item.id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/menu/RestaurantGroup.tsx
git commit -m "feat: add collapsible RestaurantGroup component"
```

---

### Task 7: Add React Query Hook for Menu Items by Park IDs

The VenueMenu page needs to load items for a specific park. The existing `useMenuItems` hook fetches 500 items globally and client-filters. We need a version that can load items for a specific park ID efficiently. The existing hook already supports `parkId` — we just need to ensure VenueMenu uses it correctly.

Additionally, we need a way to get restaurant and item counts for a set of parks (for the resort/category cards). Add a `useMenuItemCounts` hook.

**Files:**
- Modify: `src/lib/queries.ts`

**Step 1: Add the counts query hook**

Add the following to the end of `src/lib/queries.ts`:

```typescript
/** Get restaurant count for a specific park */
export function useRestaurantCount(parkId: string | undefined) {
  return useQuery({
    queryKey: ['restaurantCount', parkId],
    queryFn: async (): Promise<number> => {
      if (!parkId) return 0
      const { count, error } = await supabase
        .from('restaurants')
        .select('*', { count: 'exact', head: true })
        .eq('park_id', parkId)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!parkId,
  })
}

/** Get menu item count for a specific park (client-side from cached data) */
export function useMenuItemCount(parkId: string | undefined) {
  return useQuery({
    queryKey: ['menuItemCount', parkId],
    queryFn: async (): Promise<number> => {
      if (!parkId) return 0
      const { count, error } = await supabase
        .from('menu_items')
        .select('*, restaurant:restaurants!inner(park_id)', { count: 'exact', head: true })
        .eq('restaurant.park_id', parkId)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!parkId,
  })
}
```

**Important note:** Supabase nested `.eq()` is unreliable for filtering (per CLAUDE.md gotchas). The inner join syntax with `!inner` may work for count queries. If it doesn't, we'll fall back to fetching all items and counting client-side. Test this during implementation — if the count returns incorrect results, replace with the client-side approach from the existing `useMenuItems` hook.

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: add restaurant and menu item count query hooks"
```

---

### Task 8: Rewrite Home Page (`pages/Home.tsx`)

Replace the flat park group list with resort hero cards.

**Files:**
- Modify: `src/pages/Home.tsx` (full rewrite)

**Step 1: Rewrite Home.tsx**

Replace the entire contents of `src/pages/Home.tsx` with:

```typescript
// src/pages/Home.tsx
import { Link } from 'react-router-dom'
import { useParks } from '../lib/queries'
import { ResortCard } from '../components/resort/ResortCard'
import { RESORT_CONFIG, getParksForResort } from '../lib/resort-config'

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md animate-pulse">
      <div className="h-44 bg-gradient-to-br from-stone-200 to-stone-300" />
    </div>
  )
}

export default function Home() {
  const { data: parks, isLoading, error } = useParks()

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl shadow-lg mb-4">
          <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            <path d="M12 8v8m-4-4h8" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-stone-900">DiabetesGuide</h1>
        <p className="text-lg text-stone-600 max-w-2xl mx-auto">
          Find diabetes-friendly meals across theme parks with detailed nutritional information
        </p>
      </div>

      {/* Quick action buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/browse?sort=carbsAsc"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-emerald-900">Low Carb Picks</div>
            <div className="text-xs text-emerald-700">Browse healthiest options</div>
          </div>
        </Link>

        <Link
          to="/browse"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 hover:border-teal-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-teal-900">Browse All</div>
            <div className="text-xs text-teal-700">Search all menu items</div>
          </div>
        </Link>

        <Link
          to="/insulin"
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 hover:border-amber-300 hover:shadow-md transition-all"
        >
          <div className="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-900">Insulin Helper</div>
            <div className="text-xs text-amber-700">Calculate dosage</div>
          </div>
        </Link>
      </div>

      {/* Resort cards section */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900 mb-4">Choose a Destination</h2>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-stone-900 mb-2">Failed to load parks</h3>
            <p className="text-stone-600 mb-4">There was an error loading the data. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {parks && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RESORT_CONFIG.map(resort => {
              const resortParks = getParksForResort(parks, resort)
              if (resortParks.length === 0) return null
              return (
                <ResortCard
                  key={resort.id}
                  resort={resort}
                  parkCount={resortParks.length}
                  venueCount={resort.categories.length}
                  itemCount={0}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Note:** `itemCount` is set to 0 initially. Getting accurate item counts requires loading all menu items or making count queries per resort, which is expensive. We can either: (a) skip item counts on the home page, (b) show park counts only, or (c) add count queries later. Start with park counts — it's the most useful info at the Home level anyway.

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Test in dev**

Run: `npm run dev`
Expected: Home page shows resort hero cards with themed gradients. Clicking a card navigates to `/resort/:id` (404 expected since ResortDetail page doesn't exist yet).

**Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: rewrite Home page with resort hero cards"
```

---

### Task 9: Create ResortDetail Page (`pages/ResortDetail.tsx`)

Level 2 — shows category cards for a specific resort.

**Files:**
- Create: `src/pages/ResortDetail.tsx`

**Step 1: Create ResortDetail page**

```typescript
// src/pages/ResortDetail.tsx
import { useParams } from 'react-router-dom'
import { useParks } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { CategoryCard } from '../components/resort/CategoryCard'
import { getResortById, getParksForCategory } from '../lib/resort-config'

export default function ResortDetail() {
  const { resortId } = useParams<{ resortId: string }>()
  const resort = getResortById(resortId || '')
  const { data: parks } = useParks()

  if (!resort) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Resort not found</h2>
        <p className="text-stone-600">The destination you're looking for doesn't exist.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: resort.name },
        ]}
        accentColor={resort.theme.primary}
      />

      {/* Resort header with gradient banner */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: resort.theme.gradient }}
      >
        <div className="text-4xl mb-2">{resort.icon}</div>
        <h1 className="text-3xl font-bold">{resort.name}</h1>
        <p className="text-white/70 mt-1">{resort.location}</p>
      </div>

      {/* Category cards grid */}
      <div className="grid grid-cols-2 gap-4">
        {resort.categories.map(category => {
          const categoryParks = parks ? getParksForCategory(parks, resort, category.id) : []
          return (
            <CategoryCard
              key={category.id}
              category={category}
              resortId={resort.id}
              theme={resort.theme}
              venueCount={categoryParks.length}
              itemCount={0}
            />
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/pages/ResortDetail.tsx
git commit -m "feat: add ResortDetail page with category cards"
```

---

### Task 10: Create VenueList Page (`pages/VenueList.tsx`)

Level 3 — shows individual venues (parks, hotels, etc.) within a category.

**Files:**
- Create: `src/pages/VenueList.tsx`

**Step 1: Create VenueList page**

```typescript
// src/pages/VenueList.tsx
import { useParams } from 'react-router-dom'
import { useParks, useRestaurants } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { VenueCard } from '../components/resort/VenueCard'
import { getResortById, getParksForCategory } from '../lib/resort-config'

export default function VenueList() {
  const { resortId, categoryId } = useParams<{ resortId: string; categoryId: string }>()
  const resort = getResortById(resortId || '')
  const category = resort?.categories.find(c => c.id === categoryId)
  const { data: allParks } = useParks()

  const categoryParks = (allParks && resort && categoryId)
    ? getParksForCategory(allParks, resort, categoryId)
    : []

  if (!resort || !category) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🗺️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Not found</h2>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: resort.name, to: `/resort/${resort.id}` },
          { label: category.label },
        ]}
        accentColor={resort.theme.primary}
      />

      {/* Category header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{category.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{category.label}</h1>
            <p className="text-sm text-stone-600">{categoryParks.length} {categoryParks.length === 1 ? 'venue' : 'venues'}</p>
          </div>
        </div>
      </div>

      {/* Venue cards */}
      <div className="space-y-3">
        {categoryParks.map(park => (
          <VenueCardWithData
            key={park.id}
            parkId={park.id}
            parkName={park.name}
            resortId={resort.id}
            categoryId={category.id}
            theme={resort.theme}
          />
        ))}
      </div>

      {categoryParks.length === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🍽️</div>
          <p className="text-stone-600">No venues found in this category.</p>
        </div>
      )}
    </div>
  )
}

/** Wrapper that loads restaurant data for a single venue card */
function VenueCardWithData({ parkId, parkName, resortId, categoryId, theme }: {
  parkId: string
  parkName: string
  resortId: string
  categoryId: string
  theme: import('../../lib/resort-config').ResortTheme
}) {
  const { data: restaurants } = useRestaurants(parkId)

  // Extract unique lands from restaurants
  const lands = [...new Set((restaurants ?? []).map(r => r.land).filter(Boolean) as string[])]

  return (
    <VenueCard
      parkId={parkId}
      parkName={parkName}
      resortId={resortId}
      categoryId={categoryId}
      theme={theme}
      lands={lands}
      restaurantCount={restaurants?.length ?? 0}
      itemCount={0}
    />
  )
}
```

**Important:** The `VenueCardWithData` wrapper makes individual `useRestaurants` calls for each park. With 4 parks in a category this is fine (4 queries). For hotel categories with many venues, this could be chatty. An optimization for later would be to batch-load restaurants for all parks in the category.

**Also note:** The import path for `ResortTheme` in the inline type uses `../../lib/resort-config` which is wrong — it should be `'../../lib/resort-config'`. The type reference in the function signature should use the proper import. Fix this during implementation by importing `ResortTheme` at the top of the file.

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds. If the inline `import()` type doesn't work, add `import type { ResortTheme } from '../lib/resort-config'` at top and use it directly.

**Step 3: Commit**

```bash
git add src/pages/VenueList.tsx
git commit -m "feat: add VenueList page with venue cards and restaurant counts"
```

---

### Task 11: Create VenueMenu Page (`pages/VenueMenu.tsx`)

Level 4 — shows menu items for a specific venue, grouped by restaurant.

**Files:**
- Create: `src/pages/VenueMenu.tsx`

**Step 1: Create VenueMenu page**

```typescript
// src/pages/VenueMenu.tsx
import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useParks, useMenuItems, useRestaurants } from '../lib/queries'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { RestaurantGroup } from '../components/menu/RestaurantGroup'
import { FilterBar } from '../components/filters/FilterBar'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
import { getParkEmoji } from '../components/resort/VenueCard'
import { getResortById } from '../lib/resort-config'
import type { Filters, MenuItemWithNutrition } from '../lib/types'

const defaultFilters: Filters = {
  search: '', maxCarbs: null, category: null,
  vegetarianOnly: false, hideFried: false, hideDrinks: false, sort: 'name',
}

function applyFilters(items: MenuItemWithNutrition[], filters: Filters): MenuItemWithNutrition[] {
  let result = items

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.description?.toLowerCase().includes(q)) ||
      (i.restaurant?.name.toLowerCase().includes(q))
    )
  }
  if (filters.maxCarbs != null) {
    result = result.filter(i => (i.nutritional_data?.[0]?.carbs ?? 0) <= filters.maxCarbs!)
  }
  if (filters.category) {
    result = result.filter(i => i.category === filters.category)
  }
  if (filters.vegetarianOnly) result = result.filter(i => i.is_vegetarian)
  if (filters.hideFried) result = result.filter(i => !i.is_fried)
  if (filters.hideDrinks) result = result.filter(i => i.category !== 'beverage')

  const sortFns: Record<string, (a: MenuItemWithNutrition, b: MenuItemWithNutrition) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    carbsAsc: (a, b) => (a.nutritional_data?.[0]?.carbs ?? 0) - (b.nutritional_data?.[0]?.carbs ?? 0),
    carbsDesc: (a, b) => (b.nutritional_data?.[0]?.carbs ?? 0) - (a.nutritional_data?.[0]?.carbs ?? 0),
    caloriesAsc: (a, b) => (a.nutritional_data?.[0]?.calories ?? 0) - (b.nutritional_data?.[0]?.calories ?? 0),
    caloriesDesc: (a, b) => (b.nutritional_data?.[0]?.calories ?? 0) - (a.nutritional_data?.[0]?.calories ?? 0),
  }
  result = [...result].sort(sortFns[filters.sort] || sortFns.name)

  return result
}

export default function VenueMenu() {
  const { resortId, categoryId, parkId } = useParams<{
    resortId: string; categoryId: string; parkId: string
  }>()
  const resort = getResortById(resortId || '')
  const category = resort?.categories.find(c => c.id === categoryId)
  const { data: parks } = useParks()
  const park = parks?.find(p => p.id === parkId)
  const { data: items, isLoading } = useMenuItems(parkId)
  const { data: restaurants } = useRestaurants(parkId)
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()

  const filtered = useMemo(() => applyFilters(items ?? [], filters), [items, filters])

  // Group filtered items by restaurant
  const groupedByRestaurant = useMemo(() => {
    const groups: Map<string, { name: string; land: string | null; items: MenuItemWithNutrition[] }> = new Map()
    for (const item of filtered) {
      const rName = item.restaurant?.name || 'Unknown'
      const rLand = item.restaurant?.land || null
      if (!groups.has(rName)) {
        groups.set(rName, { name: rName, land: rLand, items: [] })
      }
      groups.get(rName)!.items.push(item)
    }
    return [...groups.values()]
  }, [filtered])

  if (!resort || !category || !park) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🍽️</div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Venue not found</h2>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: resort.name, to: `/resort/${resort.id}` },
          { label: category.label, to: `/resort/${resort.id}/${category.id}` },
          { label: park.name },
        ]}
        accentColor={resort.theme.primary}
      />

      {/* Venue header */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">{getParkEmoji(park.name)}</span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{park.name}</h1>
          <p className="text-sm text-stone-600">
            {restaurants?.length ?? 0} restaurants · {filtered.length} items
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Restaurant groups */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-sm p-6 animate-pulse">
              <div className="h-5 bg-stone-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-stone-200 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByRestaurant.map((group, i) => (
            <RestaurantGroup
              key={group.name}
              restaurantName={group.name}
              land={group.land}
              items={group.items}
              defaultExpanded={i === 0}
              accentColor={resort.theme.primary}
              onAddToMeal={addItem}
              isFavorite={isFavorite}
              onToggleFavorite={toggle}
            />
          ))}
          {groupedByRestaurant.length === 0 && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🍽️</div>
              <h3 className="text-lg font-semibold text-stone-800">No items match your filters</h3>
              <p className="text-stone-600 mt-1">Try adjusting your filters or search terms.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/pages/VenueMenu.tsx
git commit -m "feat: add VenueMenu page with restaurant-grouped items and filtering"
```

---

### Task 12: Create Favorites Page (`pages/Favorites.tsx`)

Simple page showing favorited items. Uses the existing `useFavorites` hook and `useMenuItems`.

**Files:**
- Create: `src/pages/Favorites.tsx`

**Step 1: Create Favorites page**

```typescript
// src/pages/Favorites.tsx
import { useMemo } from 'react'
import { useMenuItems } from '../lib/queries'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'

export default function Favorites() {
  const { data: items, isLoading } = useMenuItems()
  const { addItem } = useMealCart()
  const { favorites, isFavorite, toggle } = useFavorites()

  const favoriteItems = useMemo(() => {
    if (!items) return []
    return items.filter(item => favorites.has(item.id))
  }, [items, favorites])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Favorites</h1>
        <p className="text-stone-600 mt-1">
          {favoriteItems.length} saved {favoriteItems.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white shadow-md overflow-hidden animate-pulse">
              <div className="h-32 bg-gradient-to-br from-stone-200 to-stone-300" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-stone-200 rounded w-3/4" />
                <div className="h-4 bg-stone-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : favoriteItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favoriteItems.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onAddToMeal={addItem}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggle}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">💛</div>
          <h3 className="text-xl font-semibold text-stone-800 mb-2">No favorites yet</h3>
          <p className="text-stone-600">Tap the heart on any menu item to save it here.</p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/pages/Favorites.tsx
git commit -m "feat: add Favorites page showing saved menu items"
```

---

### Task 13: Create More Menu Page (`pages/MoreMenu.tsx`)

Landing page for the "More" tab with links to Packing List, Diabetes Guide, and Park Advice.

**Files:**
- Create: `src/pages/MoreMenu.tsx`

**Step 1: Create MoreMenu page**

```typescript
// src/pages/MoreMenu.tsx
import { Link } from 'react-router-dom'

const menuItems = [
  {
    to: '/packing',
    icon: '🎒',
    label: 'Packing List',
    description: 'Diabetes essentials for park days',
  },
  {
    to: '/guide',
    icon: '📖',
    label: 'Diabetes Guide',
    description: 'Type 1 & Type 2 education',
  },
  {
    to: '/advice',
    icon: '🎯',
    label: 'Park Day Tips',
    description: 'Managing diabetes at theme parks',
  },
]

export default function MoreMenu() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-stone-900">More</h1>

      <div className="space-y-3">
        {menuItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-stone-200 shadow-sm hover:shadow-md transition-all"
          >
            <span className="text-3xl">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-stone-900">{item.label}</h3>
              <p className="text-sm text-stone-600">{item.description}</p>
            </div>
            <svg className="w-5 h-5 text-stone-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/pages/MoreMenu.tsx
git commit -m "feat: add MoreMenu page with links to guides and tools"
```

---

### Task 14: Update Routes and Bottom Navigation

Wire up all new pages in App.tsx and update the bottom nav in Layout.tsx.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Layout.tsx`

**Step 1: Update App.tsx routes**

Replace the entire contents of `src/App.tsx` with:

```typescript
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import Home from './pages/Home'
import Browse from './pages/Browse'
import ResortDetail from './pages/ResortDetail'
import VenueList from './pages/VenueList'
import VenueMenu from './pages/VenueMenu'
import Favorites from './pages/Favorites'
import MoreMenu from './pages/MoreMenu'
import InsulinHelper from './pages/InsulinHelper'
import PackingList from './pages/PackingList'
import DiabetesGuide from './pages/DiabetesGuide'
import ParkAdvice from './pages/ParkAdvice'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/resort/:resortId" element={<ResortDetail />} />
        <Route path="/resort/:resortId/:categoryId" element={<VenueList />} />
        <Route path="/resort/:resortId/:categoryId/:parkId" element={<VenueMenu />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/more" element={<MoreMenu />} />
        <Route path="/insulin" element={<InsulinHelper />} />
        <Route path="/packing" element={<PackingList />} />
        <Route path="/guide" element={<DiabetesGuide />} />
        <Route path="/advice" element={<ParkAdvice />} />
      </Route>
    </Routes>
  )
}
```

**Step 2: Update Layout.tsx bottom navigation**

In `src/components/layout/Layout.tsx`, update the bottom nav section. The key changes:
- "Parks" tab becomes "Home" with a castle icon
- Favorites button becomes a real Link to `/favorites`
- "More" tab links to `/more` instead of `/guide`
- Update `isActive` for the resort routes

Replace the entire file contents with:

```typescript
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Header } from './Header'
import { MealCart } from '../meal-tracker/MealCart'

export function Layout() {
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname.startsWith('/resort')
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <MealCart />

      {/* Bottom navigation for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
        <div className="grid grid-cols-5 h-16">
          {/* Home */}
          <Link
            to="/"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            <svg className="w-6 h-6" fill={isActive('/') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs font-medium">Home</span>
          </Link>

          {/* Browse */}
          <Link
            to="/browse"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/browse') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs font-medium">Browse</span>
          </Link>

          {/* Insulin */}
          <Link
            to="/insulin"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/insulin') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            <svg className="w-6 h-6" fill={isActive('/insulin') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span className="text-xs font-medium">Insulin</span>
          </Link>

          {/* Favorites */}
          <Link
            to="/favorites"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/favorites') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            <svg
              className="w-6 h-6"
              fill={isActive('/favorites') ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span className="text-xs font-medium">Favorites</span>
          </Link>

          {/* More */}
          <Link
            to="/more"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/more') || isActive('/guide') || isActive('/packing') || isActive('/advice') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="6" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="12" cy="18" r="2"/>
            </svg>
            <span className="text-xs font-medium">More</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
```

**Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Test the full flow in dev**

Run: `npm run dev`

Test:
1. Home page shows resort hero cards (WDW, Disneyland, Universal, Cruise, SeaWorld, Aulani)
2. Click WDW → see category cards (Theme Parks, Resort Hotels, Disney Springs, Seasonal)
3. Click Theme Parks → see 4 venue cards (MK, EPCOT, HS, AK)
4. Click Magic Kingdom → see menu items grouped by restaurant with filter bar
5. Bottom nav tabs all work: Home, Browse, Insulin, Favorites, More
6. Breadcrumbs at every level link back correctly
7. Global Browse page still works unchanged at `/browse`

**Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Layout.tsx
git commit -m "feat: wire up resort hierarchy routes and update bottom navigation"
```

---

### Task 15: Clean Up Old Park Page

The old `pages/Park.tsx` is no longer referenced by any route. Remove it.

**Files:**
- Delete: `src/pages/Park.tsx`

**Step 1: Delete the file**

```bash
rm src/pages/Park.tsx
```

**Step 2: Verify no remaining imports**

Run: `npm run build`
Expected: Build succeeds. If there are import errors referencing Park.tsx, remove those imports.

**Step 3: Commit**

```bash
git add -u src/pages/Park.tsx
git commit -m "chore: remove unused Park page (replaced by resort hierarchy)"
```

---

### Task 16: Visual Polish and Final Testing

Final pass to ensure consistent styling, fix any issues found during testing.

**Files:**
- May modify any of the new files based on testing

**Step 1: Run the dev server and test every route**

Run: `npm run dev`

Check each route:
- `/` — Resort cards render with correct gradients and counts
- `/resort/wdw` — All 4 WDW categories show up
- `/resort/wdw/theme-parks` — 4 parks show with restaurants loaded
- `/resort/wdw/theme-parks/<parkId>` — Items grouped by restaurant, filters work
- `/browse` — Unchanged, still works with park pills
- `/favorites` — Shows empty state or favorited items
- `/more` — Shows 3 links (Packing, Guide, Advice)
- `/insulin`, `/packing`, `/guide`, `/advice` — All still work

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with 0 errors.

**Step 3: Fix any visual issues found during testing**

Common things to check:
- Resort cards look correct on mobile (single column) vs desktop (2-column)
- Category cards align in 2-column grid
- Breadcrumb doesn't wrap awkwardly on mobile
- Filter bar sticky positioning works on VenueMenu page
- Restaurant group collapse/expand animations are smooth
- Bottom nav active states highlight correctly for `/resort/*` paths

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: visual polish and testing fixes for resort hierarchy UI"
```

---

## Summary of All Files

**New files (10):**
- `src/lib/resort-config.ts`
- `src/components/ui/Breadcrumb.tsx`
- `src/components/resort/ResortCard.tsx`
- `src/components/resort/CategoryCard.tsx`
- `src/components/resort/VenueCard.tsx`
- `src/components/menu/RestaurantGroup.tsx`
- `src/pages/ResortDetail.tsx`
- `src/pages/VenueList.tsx`
- `src/pages/VenueMenu.tsx`
- `src/pages/Favorites.tsx`
- `src/pages/MoreMenu.tsx`

**Modified files (3):**
- `src/App.tsx` — New routes
- `src/components/layout/Layout.tsx` — Updated bottom nav
- `src/pages/Home.tsx` — Rewritten with resort cards
- `src/lib/queries.ts` — New count hooks

**Deleted files (1):**
- `src/pages/Park.tsx`

**Unchanged files:** `Browse.tsx`, `FilterBar.tsx`, `MenuItemCard.tsx`, `NutritionBadge.tsx`, `MealCart.tsx`, `Header.tsx`, `InsulinHelper.tsx`, `PackingList.tsx`, `DiabetesGuide.tsx`, `ParkAdvice.tsx`, all hooks, all lib files except queries.ts
