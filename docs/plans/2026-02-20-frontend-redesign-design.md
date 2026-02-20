# DiabetesGuide Frontend Redesign — Design Document

**Date:** 2026-02-20
**Status:** Approved
**Approach:** Park Explorer (immersive, park-identity-forward)

## Decisions

- **Scope:** Full vision (all 10 design goals from brief)
- **Visual direction:** Theme-park themed — each resort gets its own color palette and visual identity
- **Offline:** Critical — full PWA with IndexedDB caching of all 9,000+ items
- **User accounts:** None — localStorage + IndexedDB, zero friction, optional export/import
- **Glycemic scoring:** Letter grades A-F, weighted composite from net carbs (40%), sugar ratio (20%), protein ratio (15%), fiber (15%), calorie density (10%)

## 1. Information Architecture & Navigation

### Route Structure (3 levels max)

```
/ (Home — park picker)
├── /park/:parkId (park landing — lands, restaurants, search)
│   └── Inline restaurant sections with food cards
├── /search (global search across all parks)
├── /meal (meal builder + insulin calculator)
├── /plan (trip planner + favorites)
├── /compare (side-by-side, up to 3 items — modal overlay)
└── /more
    ├── /packing
    ├── /guide
    └── /advice
```

### Bottom Nav (5 tabs)

1. **Parks** — Home/park picker
2. **Search** — Global fuzzy search
3. **Meal** — Meal builder + integrated insulin calculator
4. **Plan** — Trip planner + favorites
5. **More** — Packing, guide, advice, settings

### Key Changes from Current

- Kill resort/category intermediate pages — users think in parks, not categories
- Merge insulin helper into meal builder — dose calculation in context
- Global search accessible from every page via header search icon
- Compare is a floating action (comparison tray), not a page
- Flatten from 4-5 clicks to food → 2 clicks max

### Park Landing Page

- Park header with themed gradient + pattern overlay
- "Diabetes-Friendly Picks" banner — top 10 items by grade, horizontal carousel
- Land sections (expandable) → restaurants → food cards
- Sticky search/filter bar scoped to park

## 2. Food Item Card

### Collapsed State (at-a-glance)

```
┌─────────────────────────────────────┐
│ [A]  Pulled Pork Platter        ♥  │
│ grade                               │
│ Restaurant · Land                   │
│                                     │
│  48g        620       32g      28g  │
│  CARBS      CAL      FAT    PROTEIN │
│  ●●●○○      ●●●○     ●●○     ●●●○  │
│                                     │
│  Net carbs: 44g · Fiber: 4g         │
│  ⚠️ Diabetes annotation (1 line)    │
│                                     │
│ [+ Add to Meal]  [⇄ Compare]       │
└─────────────────────────────────────┘
```

### Visual Hierarchy (largest → smallest)

1. Letter grade (A-F) — 40px circular badge, park-themed accent ring
2. Carbs — 32px bold, leftmost in nutrition row
3. Item name — 18px semibold
4. Calories, Fat, Protein — 16px secondary
5. Net carbs + fiber — 14px
6. Diabetes annotation — 13px, colored tint
7. Restaurant + land — 13px muted

### Dot Meters

5-dot visual scale (●●●○○) below each macro. Scannable without reading numbers. Shows where item falls relative to food type.

### Expanded State (tap to open)

- Full nutrition grid: sugar, sodium, cholesterol, fiber, alcohol
- Allergen badges with icons
- Confidence indicator (USDA verified / AI estimated)
- Photo (lazy-loaded)
- Price, category, seasonal/fried/vegetarian badges
- "Lower carb at this restaurant:" — 1-2 inline alternatives

### Interactions

- Tap card → expand/collapse
- Tap heart → favorite (localStorage)
- Tap "Add to Meal" → adds to active meal, toast confirmation
- Tap "Compare" → adds to comparison tray (max 3)
- Long-press (mobile) → quick-action sheet

## 3. Diabetes Letter Grade System (A-F)

### Weighted Composite Score (0-100)

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Net carbs (carbs - fiber) | 40% | Primary insulin dosing input |
| Sugar-to-carb ratio | 20% | High ratio = rapid spike |
| Protein-to-carb ratio | 15% | Protein blunts postprandial rise |
| Fiber content | 15% | Slows absorption |
| Calorie density | 10% | T2/GLP-1 relevance |

### Factor Scoring

**Net carbs:** 0-15g=100, 16-30g=80, 31-45g=60, 46-60g=40, 61-80g=20, 80g+=0
**Sugar/carb ratio:** <20%=100, 20-40%=70, 40-60%=40, >60%=10
**Protein/carb ratio:** >1.0=100, 0.5-1.0=75, 0.25-0.5=50, <0.25=20
**Fiber:** 8g+=100, 5-7g=75, 2-4g=50, 0-1g=20
**Calorie density:** <300=100, 300-500=75, 500-700=50, >700=25

### Grade Mapping

| Score | Grade | Color | Hex |
|-------|-------|-------|-----|
| 85-100 | A | Green | #16a34a |
| 70-84 | B | Lime | #65a30d |
| 55-69 | C | Yellow | #ca8a04 |
| 40-54 | D | Orange | #ea580c |
| 0-39 | F | Red | #dc2626 |

### Special Cases

- Alcoholic beverages: -15 point penalty
- Zero-calorie items: automatic A
- Null nutrition: "?" grade in gray
- All colors pass WCAG AA on white (600 shades, white text on colored badge)

## 4. Search & Filter Flow

### Global Search (full-screen overlay)

- Fuzzy matching via Fuse.js (~6KB) against pre-built in-memory index
- Instant results (<5ms for 9,000 items), 100ms debounce
- Compact list rows (grade + name + carbs + restaurant + park) — 6-8 visible per screen
- Tap row → full card
- Recent searches (last 5) shown when input empty
- Auto-scopes to current park when opened from within a park page

### Filter Chips

| Filter | Type |
|--------|------|
| Park | Dropdown |
| Grade | Multi-toggle (A, B, C, D, F) |
| Max Carbs | Presets (<15g, <30g, <45g, <60g) + slider |
| Category | Pills (Entree, Snack, Beverage, Dessert, Side) |
| Dietary | Toggles (Vegetarian, Not Fried, Alcohol-Free) |
| Allergen-free | Toggles (No Dairy, No Gluten, No Nuts, No Shellfish) |
| Sort | Dropdown (Carbs, Grade, Calories, Name) |

### Key Additions vs Current

- Grade filter (most important new filter)
- Allergen-free filters (global exclude)
- Compact result rows (not full cards)
- Park dropdown (scales to 40+ parks vs current pill bar)
- Active filter count badge + clear all

## 5. Meal Builder & Insulin Calculator

### Unified Meal Tab (`/meal`)

Three sections in one scrollable page:

**Section 1 — Item list:** Added items with grade, name, carbs, restaurant, remove button.

**Section 2 — Meal totals:** Running sum of carbs/cal/fat/protein. Net carbs. Composite meal grade. Carb goal progress bar (green → amber → red).

**Section 3 — Insulin calculator (inline):**
- Carbs auto-populated from meal total (editable)
- ICR, CF, target glucose persist in localStorage
- Activity level: None/Moderate/High
- Transparent dose breakdown
- Medical disclaimer always visible

### Multiple Named Meals

- Users name meals ("EPCOT Lunch")
- Tab/swipe between meals
- Saved meals appear in Plan tab
- "Save to Plan" bridges to trip planning

### Key Changes

- Insulin calculator integrated (not separate page)
- Carbs auto-flow from meal → calculator
- Net carbs shown (not just total)
- Meal gets composite grade
- No more floating cart widget — dedicated tab is cleaner

## 6. Park Theming System

### Theme Config Per Resort

```typescript
interface ParkTheme {
  gradient: string      // Hero/header gradient
  primary: string       // Accent color
  secondary: string     // Lighter tint
  surface: string       // Card background tint
  icon: string          // Emoji
  pattern: 'castle' | 'globe' | 'coaster' | 'nature' | 'mountains' | 'none'
}
```

### Resort Themes

| Resort | Primary | Pattern |
|--------|---------|---------|
| Walt Disney World | #6366f1 (indigo) | castle |
| Disneyland Resort | #e11d48 (rose) | castle |
| Universal Orlando | #f59e0b (amber) | globe |
| SeaWorld / Busch Gardens | #0891b2 (cyan) | nature |
| Dollywood | #b45309 (amber-dark) | mountains |
| Kings Island | #dc2626 (red) | coaster |
| Disney Cruise Line | #1d4ed8 (blue) | none |
| EPCOT Festivals | #0d9488 (teal) | globe |

### Where Theming Applies

- Park landing page header (gradient + pattern overlay)
- Food card left border (3px accent stripe)
- Filter bar active states
- Bottom nav active tab tint
- Grade badge outer ring
- "Diabetes-Friendly Picks" banner background

### Where Theming Does NOT Apply

- Grade colors (A-F) — globally consistent
- Traffic light nutrition colors — clinical, not decorative
- Text/readability — always stone-900 on white
- Meal builder / insulin calculator — clinical, stays neutral
- Search overlay — global, park-neutral

### Implementation

- All themes in `src/lib/park-themes.ts`
- `useCurrentTheme()` hook resolves from route
- CSS variables set at park-page level, children inherit
- Default neutral theme for unconfigured parks

## 7. Comparison View

### Comparison Tray (persistent bottom bar)

Slides up when first item added to compare. Shows item names, count (max 3), "Compare" button. Persistent across navigation.

### Full Comparison (modal overlay)

Column layout — each item is a column, metrics are rows.

**Three sections:**
1. **Diabetes Impact** (first): Carbs, Net carbs, Sugar, Fiber
2. **Macros**: Calories, Protein, Fat
3. **Other**: Sodium, Allergens, Price

**Best-in-category highlighting:** Dot marker (●) on the best value per row.

Grade badges at top as largest visual element. "Add to Meal" buttons per item at bottom.

**Mobile:** 2 items = 50/50, 3 items = 33/33/33 with truncated names.

## 8. Diabetes Annotations & Better Choices

### Computed Annotations (deterministic from nutrition data)

| Condition | Annotation |
|-----------|-----------|
| Sugar > 60% of carbs | "High simple sugar — expect rapid glucose spike" |
| Sugar > 40% AND carbs > 40g | "Moderate sugar with high carbs — bolus early" |
| Protein/carb > 0.8 | "Strong protein — may blunt postprandial rise" |
| Fiber > 6g | "Good fiber content — slower carb absorption" |
| Carbs < 15g AND cal < 200 | "Minimal glucose impact — may not need bolus" |
| Alcohol > 0g | "Contains alcohol — may cause delayed hypoglycemia" |
| Fat > 40g AND carbs > 40g | "High fat may delay carb absorption — consider extended bolus" |
| Beverage AND sugar > 25g | "Liquid sugar — fastest possible glucose spike" |

Priority-ordered: only top match shows on collapsed card. All show when expanded. Toggleable globally in Settings.

### Better Choices (3 surfaces)

1. **Restaurant filter pill:** "Diabetes-Friendly" → shows Grade A+B only. Falls back to best available if none.
2. **Park landing carousel:** "Diabetes-Friendly Picks" — top 10 items by grade, horizontally scrollable.
3. **Per-card inline:** "Lower carb at this restaurant:" — 1-2 better alternatives from same restaurant.

## 9. Trip Planning & Favorites

### Plan Tab — Two Modes

**Favorites tab:** Grid of hearted items. Sort by recently added, grade, carbs, park. "Add all to Day X" button.

**Trip Plan tab:**
- Setup: resort, days, park-per-day, carb goal/meal, meals/day
- Day view: park name, meal slots (Breakfast/Lunch/Dinner/Snacks)
- Each meal slot: item list with carbs, total vs goal progress bar
- Day total + trip summary with averages

### Connection to Meal Builder

- Tapping a meal slot makes it the active meal in the Meal tab
- Adding items in Meal tab saves back to trip plan
- Insulin calculator works on active meal

### Export

- PDF generation via jsPDF (~25KB): day-by-day meals with carb totals, insulin notes
- JSON export/import for backup

### Storage

- `dg_trip_plan` in localStorage
- Structure: `{ resort, days: [{ park, meals: [{ name, items }] }], carbGoalPerMeal, mealsPerDay }`

## 10. Offline / PWA Architecture

### Strategy

Cache everything on first visit (~3MB total), sync deltas on reconnect.

### Service Worker Lifecycle

1. **First visit:** Load app shell, fetch all data, cache to IndexedDB, toast "Offline ready"
2. **Subsequent online:** Serve cached data immediately, background delta sync via `updated_at` timestamp
3. **Offline:** Everything from IndexedDB. Banner: "Offline mode — cached data from [date]"
4. **Reconnect:** Auto-sync delta, banner disappears

### Storage Budget

| Asset | Storage | Size |
|-------|---------|------|
| App shell | Cache API | ~150KB |
| Items + nutrition + allergens | IndexedDB | ~2.5MB |
| Park/restaurant metadata | IndexedDB | ~50KB |
| User data | localStorage | ~10KB |
| Search index | In-memory | ~200KB RAM |

### IndexedDB Schema

```
items:       { key: id, indexes: [parkId, restaurantId, category, grade] }
parks:       { key: id }
restaurants: { key: id, indexes: [parkId] }
metadata:    { key: 'lastSync', value: timestamp }
```

### React Query Integration

```typescript
async function fetchWithOfflineFallback(queryKey, supabaseQuery) {
  try {
    const data = await supabaseQuery()
    await writeToIndexedDB(queryKey, data)
    return data
  } catch {
    const cached = await readFromIndexedDB(queryKey)
    if (cached) return cached
    throw err
  }
}
```

### Database Change

Add `updated_at` column to relevant tables with auto-update trigger for delta sync.

### PWA Manifest

- Install prompt after 2nd visit
- Display: standalone
- Orientation: portrait
- Theme color: adapts to current park

### What Works Offline

Everything: browsing, search, filters, grades, annotations, meal builder, insulin calc, trip plan, favorites, comparison, packing checklist.

### What Doesn't

- Photos (too large to auto-cache; optional "download photos" toggle for future)
- First-ever visit (need one online load)
