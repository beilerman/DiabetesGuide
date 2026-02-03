# Resort Hierarchy UI Redesign

## Problem

The current Home page shows 24 parks in flat collapsible lists grouped by location. Parks, hotels, cruise ships, and water parks are mixed together. Clicking a park leads to a sparse restaurant list, then a jump to Browse where park context gets lost. There is no clear hierarchy of Resort > Venue Type > Location > Food.

## Design

### Navigation Architecture (4 levels)

```
Level 1 — Home: Resort Selection
  ├── Walt Disney World
  ├── Disneyland Resort
  ├── Universal Orlando Resort
  ├── Disney Cruise Line
  ├── SeaWorld / Busch Gardens
  └── Aulani

Level 2 — Resort Detail: Category Cards
  Example (Walt Disney World):
  ├── Theme Parks (4 parks)
  ├── Resort Hotels (29 restaurants)
  ├── Disney Springs (54 restaurants)
  └── Seasonal & Festivals (71 booths)

Level 3 — Venue List
  Example (WDW → Theme Parks):
  ├── Magic Kingdom
  ├── EPCOT
  ├── Hollywood Studios
  └── Animal Kingdom

Level 4 — Menu Items (filtered)
  Items ONLY from the selected venue
  Grouped by restaurant, collapsible sections
  Full filter bar (search, carbs, category, sort)
```

Breadcrumb navigation at every level: `Walt Disney World > Theme Parks > Magic Kingdom`

### Level 1: Home Screen — Resort Cards

Vertical stack of hero cards, one per row on mobile (2-column grid on desktop). Each card is full-width, ~180px tall, with a themed gradient background.

```
┌─────────────────────────────────────────┐
│                                         │
│  🏰  Walt Disney World                 │
│      Orlando, Florida                   │
│                                         │
│  4 Parks · 29 Hotels · 847 items        │
│                                         │
└─────────────────────────────────────────┘
```

Themed gradients per resort (CSS only, no photos):

| Resort | Gradient | Icon |
|--------|----------|------|
| Walt Disney World | purple-800 → blue-600 | 🏰 |
| Disneyland Resort | blue-800 → pink-600 | 🎆 |
| Universal Orlando | emerald-900 → green-500 | 🌍 |
| Disney Cruise Line | navy → sky-500 | 🚢 |
| SeaWorld / Busch Gardens | teal-700 → cyan-500 | 🐬 |
| Aulani | orange-700 → fuchsia-400 | 🌺 |

Cards have subtle scale animation on press (0.98 transform). Below the resort cards: existing quick actions row (Low Carb Picks, Browse All, Insulin Helper).

### Level 2: Resort Detail — Category Cards

Resort name as header with gradient banner. 2-column grid of category cards (~140px tall) with icon, label, and item counts.

```
┌──────────────────────┐  ┌──────────────────────┐
│  🎢 Theme Parks      │  │  🏨 Resort Hotels    │
│  4 parks · 302 items │  │  29 venues · 175 items│
└──────────────────────┘  └──────────────────────┘
┌──────────────────────┐  ┌──────────────────────┐
│  🛍️ Disney Springs   │  │  🎪 Seasonal         │
│  54 spots · 281 items│  │  71 booths · 184 items│
└──────────────────────┘  └──────────────────────┘
```

Cards inherit the resort's color palette with `--accent` tint backgrounds.

Category mapping per resort:

| Resort | Categories |
|--------|-----------|
| Walt Disney World | Theme Parks, Resort Hotels, Disney Springs, Seasonal & Festivals |
| Disneyland Resort | Theme Parks, Downtown Disney |
| Universal Orlando | Theme Parks, CityWalk |
| Disney Cruise Line | Ships (each ship is a venue) |
| SeaWorld / Busch Gardens | Parks (each park is a venue) |
| Aulani | Dining (single venue) |

### Level 3: Venue List

Breadcrumb + category title + count header. Venue cards in a vertical list with horizontal layout: icon/emoji left, details right.

```
┌─────────────────────────────────────────┐
│  🏰  Magic Kingdom                      │
│      Adventureland, Fantasyland + 4 more│
│      23 restaurants · 89 items          │
│                                    →    │
└─────────────────────────────────────────┘
```

Each card shows: venue emoji, name, lands preview (first 2-3 from `restaurants.land`), restaurant + item counts, right chevron.

Left border accent stripe in the resort's `--primary` color.

For Resort Hotels, cards show individual restaurants instead of parks.

### Level 4: Menu Items

The existing Browse page scoped to a single venue. Changes from current Browse:

- **Removed:** park selector pill row (scope is already set by navigation)
- **Added:** breadcrumb navigation
- **Added:** restaurant grouping with collapsible sections (first expanded, rest collapsed)
- **Added:** land name on each restaurant header
- **Kept:** FilterBar, MenuItemCard, MealCart, all existing functionality

```
┌─ Cosmic Ray's Starlight Cafe ──────────┐
│  Adventureland · Quick Service          │
│  ▼ 8 items                              │
├─────────────────────────────────────────┤
│  [MenuItemCard]  [MenuItemCard]         │
│  [MenuItemCard]  [MenuItemCard]         │
└─────────────────────────────────────────┘
┌─ Be Our Guest Restaurant ──────────────┐
│  Fantasyland · Table Service            │
│  ▶ 14 items                  (collapsed)│
└─────────────────────────────────────────┘
```

### Global Browse & Search

The existing `/browse` route stays unchanged as a global "browse everything" experience. Accessible from:
- Home screen quick actions (Browse All, Low Carb Picks)
- Bottom nav Browse tab
- Search icon in header (auto-focuses search input)

### Bottom Navigation (Mobile)

| Tab | Icon | Destination |
|-----|------|-------------|
| Home | Castle | `/` |
| Browse | Search | `/browse` |
| Insulin | Calculator | `/insulin` |
| Favorites | Heart | `/favorites` |
| More | Dots | `/more` |

### Visual Theming System

Each resort gets CSS custom properties applied via React context:

```
Walt Disney World:  #6B21A8 → #2563EB (purple to blue)
Disneyland Resort:  #1E40AF → #DB2777 (blue to pink)
Universal Orlando:  #064E3B → #22C55E (emerald to green)
Disney Cruise Line: #1E3A5F → #0EA5E9 (navy to sky)
SeaWorld/Busch:     #0F766E → #06B6D4 (teal to cyan)
Aulani:             #C2410C → #E879F9 (orange to fuchsia)
```

Theme application by level:

| Level | Usage |
|-------|-------|
| Home | Full gradient on resort card backgrounds |
| Resort detail | Gradient banner behind title, accent tint on category cards |
| Venue list | Primary color as left border stripe |
| Menu items | Primary color on breadcrumb text and restaurant group headers |

Nutrition traffic light colors (green/amber/red) are never overridden by theming.

## Data Mapping

Static config file `lib/resort-config.ts` defines the hierarchy. No database changes needed.

```typescript
const RESORT_CONFIG = [
  {
    id: 'wdw',
    name: 'Walt Disney World',
    location: 'Orlando, Florida',
    icon: '🏰',
    theme: { primary: '#6B21A8', secondary: '#2563EB', accent: '#F5D0FE' },
    categories: [
      {
        id: 'theme-parks',
        label: 'Theme Parks',
        icon: '🎢',
        match: ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']
      },
      {
        id: 'hotels',
        label: 'Resort Hotels',
        icon: '🏨',
        match: ['Walt Disney World Resort Hotels']
      },
      {
        id: 'disney-springs',
        label: 'Disney Springs',
        icon: '🛍️',
        match: ['Disney Springs']
      },
      {
        id: 'seasonal',
        label: 'Seasonal & Festivals',
        icon: '🎪',
        filter: (item) => item.is_seasonal
      }
    ]
  },
  // ... other resorts
]
```

Item counts computed at render time from React Query data, grouped client-side.

## Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Home.tsx` (rewritten) | Resort hero cards + quick actions |
| `/resort/:resortId` | `ResortDetail.tsx` (new) | Category cards |
| `/resort/:resortId/:categoryId` | `VenueList.tsx` (new) | Venues in category |
| `/resort/:resortId/:categoryId/:parkId` | `VenueMenu.tsx` (new) | Scoped menu items |
| `/browse` | `Browse.tsx` (existing) | Global browse, unchanged |
| `/insulin` | `InsulinHelper.tsx` | Unchanged |
| `/favorites` | `Favorites.tsx` (new) | Saved items grid |
| `/more` | `MoreMenu.tsx` (new) | Links to packing, guide, advice |
| `/packing` | `PackingList.tsx` | Unchanged |
| `/guide` | `DiabetesGuide.tsx` | Unchanged |
| `/advice` | `ParkAdvice.tsx` | Unchanged |

## New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ResortCard` | `components/resort/` | Hero card on home |
| `CategoryCard` | `components/resort/` | Category card on resort detail |
| `VenueCard` | `components/resort/` | Venue card on venue list |
| `RestaurantGroup` | `components/menu/` | Collapsible restaurant section |
| `Breadcrumb` | `components/ui/` | Breadcrumb nav for hierarchy pages |
| `ResortThemeProvider` | `components/resort/` | React context for resort colors |

## Reused Unchanged

`MenuItemCard`, `NutritionBadge`, `FilterBar`, `MealCart`, `Layout` (minor nav update), `Header`
