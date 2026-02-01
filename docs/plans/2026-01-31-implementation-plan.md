# DiabetesGuide Consolidated App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a consolidated React + TypeScript + Supabase app that merges three existing repos into one multi-park diabetes nutrition guide with meal tracking, insulin calculator, packing checklist, and diabetes education.

**Architecture:** Static SPA (Vite) deployed to Vercel. Supabase PostgreSQL for menu/nutrition data (read-only via anon key). localStorage for favorites, meal cart, and preferences. No auth.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS v2, TanStack React Query v5, React Router v7, Tailwind CSS v4

---

### Task 1: Scaffold Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.env.example`

**Step 1: Initialize Vite project**

```bash
cd C:\Users\medpe\DiabetesGuide
npm create vite@latest . -- --template react-ts
```

Select "Ignore files and continue" if prompted about existing files.

**Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @tanstack/react-query react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Configure Tailwind**

Replace `src/index.css` with:
```css
@import "tailwindcss";
```

Update `vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 4: Create `.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 5: Create `.gitignore` additions**

Add to `.gitignore`:
```
.env
.env.local
```

**Step 6: Verify it builds**

```bash
npm run build
```

Expected: Clean build with no errors.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TypeScript + Tailwind project"
```

---

### Task 2: Supabase schema migration SQL

**Files:**
- Create: `supabase/migrations/00001_initial_schema.sql`

**Step 1: Write the migration**

```sql
-- Enums
CREATE TYPE menu_category AS ENUM ('entree', 'snack', 'beverage', 'dessert', 'side');
CREATE TYPE nutrition_source AS ENUM ('official', 'crowdsourced', 'api_lookup');
CREATE TYPE allergen_severity AS ENUM ('contains', 'may_contain');

-- Parks
CREATE TABLE parks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  first_aid_locations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restaurants
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id UUID NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  land TEXT,
  cuisine_type TEXT,
  hours JSONB,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menu items
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  category menu_category NOT NULL DEFAULT 'entree',
  is_seasonal BOOLEAN DEFAULT FALSE,
  is_fried BOOLEAN DEFAULT FALSE,
  is_vegetarian BOOLEAN DEFAULT FALSE,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nutritional data
CREATE TABLE nutritional_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  calories INTEGER,
  carbs INTEGER,
  fat INTEGER,
  sugar INTEGER,
  protein INTEGER,
  fiber INTEGER,
  sodium INTEGER,
  cholesterol INTEGER,
  source nutrition_source NOT NULL DEFAULT 'official',
  confidence_score INTEGER DEFAULT 50 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allergens
CREATE TABLE allergens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  allergen_type TEXT NOT NULL,
  severity allergen_severity NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_restaurants_park_id ON restaurants(park_id);
CREATE INDEX idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category);
CREATE INDEX idx_nutritional_data_menu_item_id ON nutritional_data(menu_item_id);
CREATE INDEX idx_allergens_menu_item_id ON allergens(menu_item_id);

-- RLS: read-only for anonymous
ALTER TABLE parks ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutritional_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read parks" ON parks FOR SELECT USING (true);
CREATE POLICY "Public read restaurants" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Public read menu_items" ON menu_items FOR SELECT USING (true);
CREATE POLICY "Public read nutritional_data" ON nutritional_data FOR SELECT USING (true);
CREATE POLICY "Public read allergens" ON allergens FOR SELECT USING (true);
```

**Step 2: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase schema migration"
```

---

### Task 3: Seed script — import data.json into Supabase

**Files:**
- Create: `scripts/seed.ts`
- Copy: `data/source.json` (copy from `/tmp/disney-diabetes-guide/data.json`)

**Step 1: Install tsx for running TypeScript scripts**

```bash
npm install -D tsx
```

**Step 2: Copy source data**

```bash
mkdir -p data
cp /tmp/disney-diabetes-guide/data.json data/source.json
```

**Step 3: Write the seed script**

Create `scripts/seed.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

interface RawItem {
  land: string
  restaurant: string
  name: string
  description: string
  calories: number
  carbs: number
  fat: number
  type: 'food' | 'drink'
  vegetarian: boolean
  isFried: boolean
}

interface RawPark {
  id: string
  name: string
  subtitle?: string
  lands: string[]
  menuItems: RawItem[]
}

function inferCategory(item: RawItem): string {
  if (item.type === 'drink') return 'beverage'
  const n = item.name.toLowerCase()
  if (/cookie|cake|churro|brownie|sundae|ice cream|mousse|pudding|crisp/.test(n)) return 'dessert'
  if (/fries|coleslaw|corn|rice|beans|salad|fruit|side/.test(n)) return 'side'
  if (item.calories < 300) return 'snack'
  return 'entree'
}

async function seed() {
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../data/source.json'), 'utf-8'))
  const parks: RawPark[] = raw.parks

  let parkCount = 0
  let restCount = 0
  let itemCount = 0

  for (const park of parks) {
    // Insert park
    const { data: parkRow, error: parkErr } = await supabase
      .from('parks')
      .insert({ name: park.name, location: 'Walt Disney World', timezone: 'America/New_York' })
      .select('id')
      .single()
    if (parkErr) { console.error('Park insert error:', parkErr); continue }
    parkCount++

    // Group items by restaurant+land
    const restMap = new Map<string, { land: string; restaurant: string; items: RawItem[] }>()
    for (const item of park.menuItems) {
      const key = `${item.land}|||${item.restaurant}`
      if (!restMap.has(key)) restMap.set(key, { land: item.land, restaurant: item.restaurant, items: [] })
      restMap.get(key)!.items.push(item)
    }

    for (const [, rest] of restMap) {
      // Insert restaurant
      const { data: restRow, error: restErr } = await supabase
        .from('restaurants')
        .insert({ park_id: parkRow.id, name: rest.restaurant, land: rest.land })
        .select('id')
        .single()
      if (restErr) { console.error('Restaurant insert error:', restErr); continue }
      restCount++

      for (const item of rest.items) {
        // Insert menu item
        const { data: menuRow, error: menuErr } = await supabase
          .from('menu_items')
          .insert({
            restaurant_id: restRow.id,
            name: item.name,
            description: item.description || null,
            category: inferCategory(item),
            is_fried: item.isFried,
            is_vegetarian: item.vegetarian,
          })
          .select('id')
          .single()
        if (menuErr) { console.error('Menu item insert error:', menuErr); continue }

        // Insert nutritional data
        const { error: nutErr } = await supabase
          .from('nutritional_data')
          .insert({
            menu_item_id: menuRow.id,
            calories: item.calories,
            carbs: item.carbs,
            fat: item.fat,
            source: 'official',
            confidence_score: 70,
          })
        if (nutErr) console.error('Nutrition insert error:', nutErr)

        itemCount++
      }
    }
  }

  console.log(`Seeded: ${parkCount} parks, ${restCount} restaurants, ${itemCount} menu items`)
}

seed().catch(console.error)
```

**Step 4: Add script to package.json**

Add to `scripts` in `package.json`:
```json
"seed": "tsx scripts/seed.ts"
```

**Step 5: Commit**

```bash
git add scripts/ data/source.json package.json package-lock.json
git commit -m "feat: add seed script to import data.json into Supabase"
```

---

### Task 4: TypeScript types and Supabase client

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/types.ts`

**Step 1: Create Supabase client**

Create `src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 2: Create types**

Create `src/lib/types.ts`:
```ts
export interface Park {
  id: string
  name: string
  location: string
  timezone: string
  first_aid_locations: FirstAidLocation[]
  created_at: string
}

export interface FirstAidLocation {
  name: string
  description: string
  land?: string
}

export interface Restaurant {
  id: string
  park_id: string
  name: string
  land: string | null
  cuisine_type: string | null
  hours: Record<string, string> | null
  lat: number | null
  lon: number | null
  created_at: string
}

export interface MenuItem {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  price: number | null
  category: 'entree' | 'snack' | 'beverage' | 'dessert' | 'side'
  is_seasonal: boolean
  is_fried: boolean
  is_vegetarian: boolean
  photo_url: string | null
  created_at: string
}

export interface NutritionalData {
  id: string
  menu_item_id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  cholesterol: number | null
  source: 'official' | 'crowdsourced' | 'api_lookup'
  confidence_score: number
  created_at: string
}

export interface Allergen {
  id: string
  menu_item_id: string
  allergen_type: string
  severity: 'contains' | 'may_contain'
  created_at: string
}

export interface MenuItemWithNutrition extends MenuItem {
  nutritional_data: NutritionalData[]
  allergens: Allergen[]
  restaurant?: Restaurant & { park?: Park }
}

export interface MealItem {
  id: string
  name: string
  carbs: number
  calories: number
  fat: number
}

export interface Filters {
  search: string
  maxCarbs: number | null
  category: MenuItem['category'] | null
  vegetarianOnly: boolean
  hideFried: boolean
  hideDrinks: boolean
  sort: 'name' | 'carbsAsc' | 'carbsDesc' | 'caloriesAsc' | 'caloriesDesc'
}
```

**Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: add Supabase client and TypeScript types"
```

---

### Task 5: React Query hooks for Supabase data

**Files:**
- Create: `src/lib/queries.ts`

**Step 1: Write query hooks**

Create `src/lib/queries.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Park, Restaurant, MenuItemWithNutrition } from './types'

function escapeSearch(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&').replace(/[,().'"]/g, '')
}

export function useParks() {
  return useQuery({
    queryKey: ['parks'],
    queryFn: async (): Promise<Park[]> => {
      const { data, error } = await supabase
        .from('parks')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Park[]
    },
  })
}

export function useRestaurants(parkId: string | undefined) {
  return useQuery({
    queryKey: ['restaurants', parkId],
    queryFn: async (): Promise<Restaurant[]> => {
      if (!parkId) return []
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('park_id', parkId)
        .order('land, name')
      if (error) throw error
      return data as Restaurant[]
    },
    enabled: !!parkId,
  })
}

export function useMenuItems(parkId?: string) {
  return useQuery({
    queryKey: ['menuItems', parkId],
    queryFn: async (): Promise<MenuItemWithNutrition[]> => {
      let query = supabase
        .from('menu_items')
        .select(`
          *,
          nutritional_data (*),
          allergens (*),
          restaurant:restaurants (*, park:parks (*))
        `)
        .order('name')

      if (parkId) {
        query = query.eq('restaurant.park_id', parkId)
      }

      const { data, error } = await query.limit(500)
      if (error) throw error
      return (data as MenuItemWithNutrition[]).filter(
        item => !parkId || item.restaurant?.park_id === parkId
      )
    },
    enabled: true,
  })
}

export function useSearch(searchQuery: string) {
  return useQuery({
    queryKey: ['search', searchQuery],
    queryFn: async (): Promise<MenuItemWithNutrition[]> => {
      if (!searchQuery.trim()) return []
      const escaped = escapeSearch(searchQuery.trim())
      const { data, error } = await supabase
        .from('menu_items')
        .select(`
          *,
          nutritional_data (*),
          allergens (*),
          restaurant:restaurants (*, park:parks (*))
        `)
        .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
        .order('name')
        .limit(50)
      if (error) throw error
      return data as MenuItemWithNutrition[]
    },
    enabled: searchQuery.trim().length > 1,
  })
}
```

**Step 2: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: add React Query hooks for Supabase data"
```

---

### Task 6: localStorage hooks — meal cart, favorites, preferences

**Files:**
- Create: `src/hooks/useMealCart.ts`, `src/hooks/useFavorites.ts`, `src/hooks/usePreferences.ts`

**Step 1: Create useMealCart hook**

Create `src/hooks/useMealCart.ts`:
```ts
import { useState, useCallback, useEffect } from 'react'
import type { MealItem } from '../lib/types'

const STORAGE_KEY = 'dg_meal_cart'

function load(): MealItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

export function useMealCart() {
  const [items, setItems] = useState<MealItem[]>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((item: MealItem) => {
    setItems(prev => [...prev, item])
  }, [])

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const totals = items.reduce(
    (acc, i) => ({
      carbs: acc.carbs + i.carbs,
      calories: acc.calories + i.calories,
      fat: acc.fat + i.fat,
    }),
    { carbs: 0, calories: 0, fat: 0 }
  )

  return { items, addItem, removeItem, clear, totals }
}
```

**Step 2: Create useFavorites hook**

Create `src/hooks/useFavorites.ts`:
```ts
import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'dg_favorites'

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch { return new Set() }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]))
  }, [favorites])

  const toggle = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites])

  return { favorites, toggle, isFavorite }
}
```

**Step 3: Create usePreferences hook**

Create `src/hooks/usePreferences.ts`:
```ts
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
```

**Step 4: Commit**

```bash
git add src/hooks/
git commit -m "feat: add localStorage hooks for meal cart, favorites, preferences"
```

---

### Task 7: App shell — routing, layout, providers

**Files:**
- Modify: `src/main.tsx`, `src/App.tsx`
- Create: `src/components/layout/Header.tsx`, `src/components/layout/Layout.tsx`
- Create: `src/pages/Home.tsx` (placeholder)

**Step 1: Set up main.tsx with providers**

Replace `src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
```

**Step 2: Set up App.tsx with routes**

Replace `src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import Home from './pages/Home'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
      </Route>
    </Routes>
  )
}
```

**Step 3: Create Layout component**

Create `src/components/layout/Layout.tsx`:
```tsx
import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
```

**Step 4: Create Header component**

Create `src/components/layout/Header.tsx`:
```tsx
import { Link } from 'react-router-dom'

export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold text-blue-600">
          DiabetesGuide
        </Link>
        <div className="flex gap-4 text-sm">
          <Link to="/browse" className="hover:text-blue-600">Browse</Link>
          <Link to="/insulin" className="hover:text-blue-600">Insulin Helper</Link>
          <Link to="/packing" className="hover:text-blue-600">Packing List</Link>
          <Link to="/guide" className="hover:text-blue-600">Diabetes Guide</Link>
        </div>
      </nav>
    </header>
  )
}
```

**Step 5: Create placeholder Home page**

Create `src/pages/Home.tsx`:
```tsx
import { useParks } from '../lib/queries'

export default function Home() {
  const { data: parks, isLoading, error } = useParks()

  if (isLoading) return <p>Loading parks...</p>
  if (error) return <p className="text-red-600">Failed to load parks.</p>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Choose a Park</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {parks?.map(park => (
          <Link key={park.id} to={`/park/${park.id}`}
            className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition">
            <h2 className="text-lg font-semibold">{park.name}</h2>
            <p className="text-sm text-gray-500">{park.location}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

Add missing import at top of Home.tsx:
```tsx
import { Link } from 'react-router-dom'
```

**Step 6: Verify build**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add src/
git commit -m "feat: add app shell with routing, layout, and home page"
```

---

### Task 8: Browse page — menu items with filters

**Files:**
- Create: `src/pages/Browse.tsx`
- Create: `src/components/filters/FilterBar.tsx`
- Create: `src/components/menu/MenuItemCard.tsx`
- Create: `src/components/menu/NutritionBadge.tsx`
- Modify: `src/App.tsx` (add route)

**Step 1: Create NutritionBadge component**

Create `src/components/menu/NutritionBadge.tsx`:
```tsx
export function carbColor(carbs: number): string {
  if (carbs <= 15) return 'bg-green-100 text-green-800'
  if (carbs <= 45) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

export function NutritionBadge({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  if (value == null) return null
  return (
    <span className="text-sm">
      <span className="font-medium">{label}:</span> {value}{unit}
    </span>
  )
}
```

**Step 2: Create MenuItemCard component**

Create `src/components/menu/MenuItemCard.tsx`:
```tsx
import type { MenuItemWithNutrition, MealItem } from '../../lib/types'
import { carbColor } from './NutritionBadge'

interface Props {
  item: MenuItemWithNutrition
  onAddToMeal: (item: MealItem) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}

export function MenuItemCard({ item, onAddToMeal, isFavorite, onToggleFavorite }: Props) {
  const nd = item.nutritional_data?.[0]
  const carbs = nd?.carbs ?? 0
  const calories = nd?.calories ?? 0
  const fat = nd?.fat ?? 0

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{item.name}</h3>
          {item.restaurant && (
            <p className="text-xs text-gray-500">{item.restaurant.name} — {item.restaurant.land}</p>
          )}
        </div>
        <button
          onClick={() => onToggleFavorite(item.id)}
          className="text-xl"
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      </div>

      {item.description && (
        <p className="mt-1 text-sm text-gray-600">{item.description}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${carbColor(carbs)}`}>
          {carbs}g carbs
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{calories} kcal</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{fat}g fat</span>
        {item.is_vegetarian && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Vegetarian</span>}
        {item.is_fried && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">Fried</span>}
      </div>

      <button
        className="mt-3 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
        onClick={() => onAddToMeal({ id: item.id, name: item.name, carbs, calories, fat })}
      >
        Add to Meal
      </button>
    </div>
  )
}
```

**Step 3: Create FilterBar component**

Create `src/components/filters/FilterBar.tsx`:
```tsx
import type { Filters } from '../../lib/types'

interface Props {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FilterBar({ filters, onChange }: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
      <input
        type="text"
        placeholder="Search..."
        value={filters.search}
        onChange={e => set('search', e.target.value)}
        className="rounded-lg border px-3 py-1.5 text-sm"
      />
      <label className="flex items-center gap-1 text-sm">
        Max carbs:
        <input
          type="number"
          value={filters.maxCarbs ?? ''}
          onChange={e => set('maxCarbs', e.target.value ? Number(e.target.value) : null)}
          className="w-16 rounded border px-2 py-1"
          placeholder="Any"
        />
      </label>
      <select
        value={filters.category ?? ''}
        onChange={e => set('category', e.target.value || null as any)}
        className="rounded-lg border px-2 py-1.5 text-sm"
      >
        <option value="">All categories</option>
        <option value="entree">Entree</option>
        <option value="snack">Snack</option>
        <option value="beverage">Beverage</option>
        <option value="dessert">Dessert</option>
        <option value="side">Side</option>
      </select>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={filters.vegetarianOnly} onChange={e => set('vegetarianOnly', e.target.checked)} />
        Vegetarian
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={filters.hideFried} onChange={e => set('hideFried', e.target.checked)} />
        Hide fried
      </label>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={filters.hideDrinks} onChange={e => set('hideDrinks', e.target.checked)} />
        Hide drinks
      </label>
      <select
        value={filters.sort}
        onChange={e => set('sort', e.target.value as Filters['sort'])}
        className="rounded-lg border px-2 py-1.5 text-sm"
      >
        <option value="name">Sort: Name</option>
        <option value="carbsAsc">Carbs (low→high)</option>
        <option value="carbsDesc">Carbs (high→low)</option>
        <option value="caloriesAsc">Calories (low→high)</option>
        <option value="caloriesDesc">Calories (high→low)</option>
      </select>
    </div>
  )
}
```

**Step 4: Create Browse page**

Create `src/pages/Browse.tsx`:
```tsx
import { useState, useMemo } from 'react'
import { useMenuItems, useParks } from '../lib/queries'
import { FilterBar } from '../components/filters/FilterBar'
import { MenuItemCard } from '../components/menu/MenuItemCard'
import { useMealCart } from '../hooks/useMealCart'
import { useFavorites } from '../hooks/useFavorites'
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

export default function Browse() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [parkId, setParkId] = useState<string | undefined>()
  const { data: parks } = useParks()
  const { data: items, isLoading } = useMenuItems(parkId)
  const { addItem } = useMealCart()
  const { isFavorite, toggle } = useFavorites()

  const filtered = useMemo(() => applyFilters(items ?? [], filters), [items, filters])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Browse Menu</h1>
      <div className="mb-4">
        <select
          value={parkId ?? ''}
          onChange={e => setParkId(e.target.value || undefined)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">All Parks</option>
          {parks?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <FilterBar filters={filters} onChange={setFilters} />
      {isLoading ? (
        <p className="mt-4">Loading...</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <MenuItemCard
              key={item.id}
              item={item}
              onAddToMeal={addItem}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggle}
            />
          ))}
          {filtered.length === 0 && <p className="text-gray-500">No items match your filters.</p>}
        </div>
      )}
    </div>
  )
}
```

**Step 5: Add route to App.tsx**

Add `Browse` import and route in `src/App.tsx`:
```tsx
import Browse from './pages/Browse'
// Inside Routes, add:
<Route path="/browse" element={<Browse />} />
```

**Step 6: Verify build**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add src/
git commit -m "feat: add Browse page with filters and menu item cards"
```

---

### Task 9: Park detail page

**Files:**
- Create: `src/pages/Park.tsx`
- Modify: `src/App.tsx` (add route)

**Step 1: Create Park page**

Create `src/pages/Park.tsx`:
```tsx
import { useParams, Link } from 'react-router-dom'
import { useParks, useRestaurants } from '../lib/queries'

export default function Park() {
  const { id } = useParams<{ id: string }>()
  const { data: parks } = useParks()
  const { data: restaurants, isLoading } = useRestaurants(id)

  const park = parks?.find(p => p.id === id)

  if (!park) return <p>Park not found.</p>

  // Group restaurants by land
  const byLand = (restaurants ?? []).reduce<Record<string, typeof restaurants>>((acc, r) => {
    const land = r.land || 'Other'
    if (!acc[land]) acc[land] = []
    acc[land]!.push(r)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-3xl font-bold">{park.name}</h1>
      <p className="text-gray-500 mb-6">{park.location}</p>

      {isLoading ? <p>Loading restaurants...</p> : (
        Object.entries(byLand).map(([land, rests]) => (
          <div key={land} className="mb-6">
            <h2 className="text-xl font-semibold mb-2">{land}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rests!.map(r => (
                <Link
                  key={r.id}
                  to={`/browse?park=${park.id}`}
                  className="rounded-lg border bg-white p-4 hover:shadow-sm transition"
                >
                  <h3 className="font-medium">{r.name}</h3>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
```

**Step 2: Add route**

Add to `src/App.tsx`:
```tsx
import Park from './pages/Park'
// <Route path="/park/:id" element={<Park />} />
```

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: add Park detail page grouped by land"
```

---

### Task 10: Meal tracker sidebar/drawer

**Files:**
- Create: `src/components/meal-tracker/MealCart.tsx`
- Modify: `src/components/layout/Layout.tsx` (add cart to layout)

**Step 1: Create MealCart component**

Create `src/components/meal-tracker/MealCart.tsx`:
```tsx
import { useMealCart } from '../../hooks/useMealCart'
import { usePreferences } from '../../hooks/usePreferences'
import { Link } from 'react-router-dom'

export function MealCart() {
  const { items, removeItem, clear, totals } = useMealCart()
  const { carbGoal } = usePreferences()
  const pct = carbGoal > 0 ? Math.min(100, Math.round((totals.carbs / carbGoal) * 100)) : 0

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 w-80 rounded-xl border bg-white p-4 shadow-lg z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Meal Tracker ({items.length})</h3>
        <button onClick={clear} className="text-xs text-red-600 hover:underline">Clear</button>
      </div>

      <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex justify-between">
            <span className="truncate">{item.name}</span>
            <div className="flex gap-2 shrink-0">
              <span className="text-gray-500">{item.carbs}g</span>
              <button onClick={() => removeItem(i)} className="text-red-500 text-xs">✕</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 text-sm font-medium">
        Carbs: {totals.carbs}g · Cal: {totals.calories} · Fat: {totals.fat}g
      </div>

      {carbGoal > 0 && (
        <div className="mt-1">
          <div className="h-2 rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{totals.carbs}/{carbGoal}g carb goal</p>
        </div>
      )}

      <Link
        to={`/insulin?carbs=${totals.carbs}`}
        className="mt-2 block text-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
      >
        Use in Insulin Helper
      </Link>
    </div>
  )
}
```

**Step 2: Add MealCart to Layout**

In `src/components/layout/Layout.tsx`, import and add `<MealCart />` after `<Outlet />`.

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: add floating meal tracker with carb goal progress"
```

---

### Task 11: Insulin Helper page

**Files:**
- Create: `src/pages/InsulinHelper.tsx`
- Modify: `src/App.tsx` (add route)

**Step 1: Create InsulinHelper page**

Create `src/pages/InsulinHelper.tsx` porting the calculation logic from wdwdiabetes `script.js` (the `insulinHelperCalc` function). Key inputs: blood glucose, target, carbs (auto-populated from URL param), ICR, correction factor, activity level. Outputs: carb bolus, correction dose, base dose, activity adjustment, suggested dose. Include educational disclaimer banner.

The core formula:
```ts
const carbBolus = carbs / icr
const correction = cf && bg > target ? (bg - target) / cf : cf && bg < target ? (bg - target) / cf : 0
const baseDose = carbBolus + correction
const adjPct = activity === 'mod' ? 0.25 : activity === 'high' ? 0.50 : 0
const suggested = Math.max(0, baseDose * (1 - adjPct))
```

**Step 2: Add route and commit**

```bash
git add src/
git commit -m "feat: add Insulin Helper calculator page"
```

---

### Task 12: Packing Checklist page

**Files:**
- Create: `src/pages/PackingList.tsx`
- Create: `src/data/checklist.ts` (static checklist data ported from wdwdiabetes `buildChecklist`)
- Modify: `src/App.tsx` (add route)

**Step 1: Create checklist data**

Port the `buildChecklist` function from wdwdiabetes `script.js` into `src/data/checklist.ts` as a TypeScript function that takes `{ t1, t2, pump, cgm, child }` options and returns string arrays by section.

**Step 2: Create PackingList page**

Checkboxes for T1/T2/pump/CGM/child options, trip length input, dynamically generated checklist. Check state persists in localStorage.

**Step 3: Add route and commit**

```bash
git add src/
git commit -m "feat: add Packing Checklist page"
```

---

### Task 13: Diabetes Guide page (T1/T2 education)

**Files:**
- Create: `src/pages/DiabetesGuide.tsx`
- Create: `src/data/education.ts` (static content for T1/T2 guides)
- Modify: `src/App.tsx` (add route)

**Step 1: Create education data**

Port diabetes education content from wdwdiabetes index.html (Type 1 and Type 2 sections) into `src/data/education.ts` as structured data.

**Step 2: Create DiabetesGuide page**

Tabbed interface: Type 1 | Type 2. Each tab shows evidence-based recommendations for managing diabetes at theme parks.

**Step 3: Add route and commit**

```bash
git add src/
git commit -m "feat: add Diabetes Guide page with T1/T2 education"
```

---

### Task 14: Park Advice page

**Files:**
- Create: `src/pages/ParkAdvice.tsx`
- Create: `src/data/park-advice.ts`
- Modify: `src/App.tsx` (add route)

**Step 1: Port content from `park-advice.html`**

Read `/tmp/disney-diabetes-guide/park-advice.html` and port the content into structured TypeScript data in `src/data/park-advice.ts`.

**Step 2: Create ParkAdvice page**

Renders the advice content with clear section headings.

**Step 3: Add route and commit**

```bash
git add src/
git commit -m "feat: add Park Advice page"
```

---

### Task 15: Accessibility controls

**Files:**
- Create: `src/components/ui/AccessibilityControls.tsx`
- Modify: `src/components/layout/Header.tsx` (add controls)
- Modify: `src/index.css` (add high-contrast CSS)

**Step 1: Create AccessibilityControls**

Font size A-/A+ buttons, high contrast toggle. Uses `usePreferences` hook.

**Step 2: Add high-contrast CSS**

In `src/index.css`, add:
```css
.high-contrast {
  --bg: #000;
  --fg: #fff;
  --border: #fff;
}
.high-contrast body { background: #000; color: #fff; }
.high-contrast .bg-white { background: #111 !important; color: #fff !important; }
.high-contrast .border { border-color: #555 !important; }
```

**Step 3: Add to Header and commit**

```bash
git add src/
git commit -m "feat: add accessibility controls (font size, high contrast)"
```

---

### Task 16: Mobile nav + responsive polish

**Files:**
- Modify: `src/components/layout/Header.tsx` (hamburger menu for mobile)
- Modify various components for responsive breakpoints

**Step 1: Add mobile hamburger menu to Header**

Toggle mobile nav drawer on small screens. Hide desktop nav links behind hamburger.

**Step 2: Verify responsive layout at 375px, 768px, 1024px widths**

**Step 3: Commit**

```bash
git add src/
git commit -m "feat: add mobile navigation and responsive polish"
```

---

### Task 17: Vercel deployment config

**Files:**
- Create: `vercel.json`

**Step 1: Create vercel.json**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

This ensures client-side routing works (all paths serve index.html).

**Step 2: Verify final build**

```bash
npm run build
```

**Step 3: Commit and push**

```bash
git add vercel.json
git commit -m "feat: add Vercel config for SPA routing"
git push -u origin main
```

---

### Task 18: Create Supabase project and seed data

**Step 1: Create Supabase project**

Go to https://supabase.com, create a new project. Copy the URL and anon key.

**Step 2: Run migration**

In Supabase SQL editor, paste and run contents of `supabase/migrations/00001_initial_schema.sql`.

**Step 3: Create `.env.local` and seed**

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase URL, anon key, and service role key
npm run seed
```

Expected output: `Seeded: 4 parks, ~65 restaurants, 241 menu items`

**Step 4: Set Vercel env vars**

In Vercel dashboard, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**Step 5: Deploy**

Push to main triggers Vercel deploy, or run `vercel` CLI.
