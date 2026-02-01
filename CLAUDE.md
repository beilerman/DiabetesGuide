# DiabetesGuide - Claude Code Memory

## Project Overview

Theme park diabetes food guide — a mobile-first React SPA that helps people with diabetes find and track nutritional info for food at Orlando theme parks. Consolidated from three earlier repos (`disney-diabetes-guide`, `wdwdiabetes`, `park-nutrition-mvp`).

**Live URL:** Deployed on Vercel (static SPA)
**Repo:** https://github.com/beilerman/DiabetesGuide

## Tech Stack

- React 19 + TypeScript + Vite
- Supabase PostgreSQL (read-only via anon key, RLS policies, no auth)
- TanStack React Query v5 (5-min stale time)
- React Router v7
- Tailwind CSS v4 (`@tailwindcss/vite` plugin, `@import "tailwindcss"` in CSS)
- Vercel deployment with `vercel.json` rewrite for client-side routing

## Supabase Instance

- **Project URL:** `https://rcrzdpzwcbekgqgiwqcp.supabase.co`
- **Anon key:** In `.env.local` as `VITE_SUPABASE_ANON_KEY`
- **Service role key:** In `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` (for scripts only)
- **USDA API key:** In `.env.local` as `USDA_API_KEY`

## Database Schema

5 tables, all UUID PKs via `gen_random_uuid()`, RLS enabled with public SELECT only.

| Table | Key Columns | Notes |
|-------|------------|-------|
| `parks` | name, location, timezone, first_aid_locations (JSONB) | 12 parks total |
| `restaurants` | park_id (FK), name, land, cuisine_type, hours (JSONB), lat/lon | ~167 restaurants |
| `menu_items` | restaurant_id (FK), name, description, price, category (enum), is_seasonal, is_fried, is_vegetarian | 818 items |
| `nutritional_data` | menu_item_id (FK), calories/carbs/fat/sugar/protein/fiber/sodium/cholesterol (all INTEGER), source (enum), confidence_score | One row per item |
| `allergens` | menu_item_id (FK), allergen_type (TEXT), severity (enum: contains/may_contain) | ~800 records |

**Enums:** `menu_category` (entree/snack/beverage/dessert/side), `nutrition_source` (official/crowdsourced/api_lookup), `allergen_severity` (contains/may_contain)

**Indexes:** On all FKs + `menu_items.category`

## Data Pipeline

### Data Sources (11 JSON files in `data/parks/`)

| File | Items | Parks |
|------|-------|-------|
| `source.json` (original) | 241 | 4 Disney World parks |
| `magic-kingdom-extra.json` | 21 | Magic Kingdom supplements |
| `epcot-extra.json` | 23 | EPCOT supplements |
| `hollywood-studios-extra.json` | 18 | Hollywood Studios supplements |
| `animal-kingdom-extra.json` | 20 | Animal Kingdom supplements |
| `universal-studios.json` | 30 | Universal Studios Florida |
| `islands-of-adventure.json` | 33 | Islands of Adventure |
| `volcano-bay.json` | 21 | Volcano Bay |
| `seaworld-orlando.json` | 25 | SeaWorld Orlando |
| `busch-gardens-tampa.json` | 26 | Busch Gardens Tampa |
| `disney-resorts.json` | 175 | Resort hotel restaurants (29 restaurants) |
| `disney-seasonal.json` | 184 | Festival/event items (71 booths) |

### Scripts (all in `scripts/`, run with `npx tsx`)

| Script | Purpose | Env Vars Needed |
|--------|---------|----------------|
| `seed.ts` | Initial seed from `data/source.json` | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `import-all.ts` | Import all `data/parks/*.json`, deduplicates by name | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `enrich-nutrition.ts` | USDA FoodData Central API lookup by item name | + USDA_API_KEY |
| `enrich-from-descriptions.ts` | Description-based USDA lookup for items with park-specific names | + USDA_API_KEY |
| `enrich-allergens.ts` | Keyword-based allergen inference from names/descriptions | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `adjust-portions.ts` | Apply theme park portion size multipliers to nutrition data | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `get-unmatched.ts` | List items missing nutrition data | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |

### Data Pipeline Execution Order

```bash
# 1. Initial seed (241 items)
npx tsx scripts/seed.ts

# 2. Import all park data (adds ~577 more items, deduplicates)
npx tsx scripts/import-all.ts

# 3. USDA nutrition enrichment - direct name match
npx tsx scripts/enrich-nutrition.ts

# 4. Description-based enrichment for remaining unmatched items
npx tsx scripts/enrich-from-descriptions.ts

# 5. Allergen inference
npx tsx scripts/enrich-allergens.ts

# 6. Portion size adjustment
npx tsx scripts/adjust-portions.ts
```

## USDA API Gotchas

- **Integer columns:** USDA returns floats — MUST `Math.round()` before inserting into INTEGER columns
- **Enum values:** Use `'api_lookup'` not `'usda_enriched'` — the `nutrition_source` enum only has `official`, `crowdsourced`, `api_lookup`
- **DataType filter:** Removing `dataType: 'Survey (FNDDS),Foundation,SR Legacy'` greatly increases match rate by including Branded foods
- **Rate limit:** 1000 requests/hour, use 200ms delay between requests
- **Theme park names:** Items like "Ronto Wrap" or "Blue Milk" won't match — use `enrich-from-descriptions.ts` which maps names to generic food terms
- **Nutrient IDs:** protein=1003, carbs=1005, fat=1004, calories=1008, sugar=2000, fiber=1079, sodium=1093, cholesterol=1253

## Portion Size Multipliers

Theme park portions are significantly larger than USDA standard servings. Key multipliers applied via `adjust-portions.ts`:

| Category | Multiplier | Evidence |
|----------|-----------|----------|
| Cupcakes | 2.5x | Lab-tested at 1,072 cal (TouringPlans) |
| Nachos/loaded | 2.2x | "PACKED with toppings" per reviews |
| Footlong hot dogs | 2.0x | Casey's Corner loaded dogs |
| Jumbo pretzels | 2.0x | Mickey pretzel ~10.7oz = ~1000 cal |
| Specialty desserts | 2.0x | Oversized with toppings |
| Burgers w/ fries | 1.8x | 1/3 lb+ patties, large fries |
| BBQ platters | 1.8x | "Feeds two people" |
| Sandwiches/wraps | 1.7x | Thick bread, generous fillings |
| Quick service entrees | 1.6x | "Takes up whole plate" |
| Festival booth items | 1.3x | Small plates, not full meals |
| Coffee/beer/wine | 1.0x | Standard servings |

**Specific verified items:** Turkey leg 1,093 cal (official), Totchos 552 cal (official), Mickey Pretzel 480 cal, Ohana Bread Pudding 1,055 cal

## App Architecture

### File Structure

```
src/
├── App.tsx                          # Routes
├── main.tsx                         # Entry point (React, QueryClient, Router)
├── index.css                        # Design system (CSS vars, animations, high contrast)
├── lib/
│   ├── supabase.ts                  # Supabase client (VITE_ env vars)
│   ├── types.ts                     # TypeScript interfaces
│   └── queries.ts                   # React Query hooks (useParks, useMenuItems, etc.)
├── hooks/
│   ├── useMealCart.ts               # localStorage meal tracking
│   ├── useFavorites.ts              # localStorage favorites (Set of UUIDs)
│   └── usePreferences.ts           # localStorage prefs (fontScale, highContrast, carbGoal)
├── components/
│   ├── layout/
│   │   ├── Layout.tsx               # Shell + bottom nav (mobile)
│   │   └── Header.tsx               # Top bar with logo + desktop nav
│   ├── menu/
│   │   ├── MenuItemCard.tsx         # Food card with nutrition badges
│   │   └── NutritionBadge.tsx       # Traffic light colored badges + NutritionRing
│   ├── filters/
│   │   └── FilterBar.tsx            # Sticky filter bar with chips, slider, pills
│   ├── meal-tracker/
│   │   └── MealCart.tsx             # Floating meal tracker with carb goal progress
│   └── ui/
│       └── AccessibilityControls.tsx # Font scale + high contrast toggle
├── pages/
│   ├── Home.tsx                     # Park grid with hero + quick actions
│   ├── Browse.tsx                   # Full menu browser with filters
│   ├── Park.tsx                     # Single park detail
│   ├── InsulinHelper.tsx            # Dose calculator
│   ├── PackingList.tsx              # Diabetes packing checklist
│   ├── DiabetesGuide.tsx            # T1/T2 education content
│   └── ParkAdvice.tsx               # Park day tips
└── data/
    ├── checklist.ts                 # Packing list items
    ├── education.ts                 # Diabetes education content
    └── park-advice.ts               # Park day advice content
```

### Key Patterns

- **No auth** — everything in localStorage (`dg_meal_cart`, `dg_favorites`, `dg_preferences`, `dg_checklist`)
- **Client-side filtering** — `useMemo` in Browse.tsx, not Supabase queries (Supabase nested `.eq()` on joined tables doesn't work)
- **Supabase nested selects:** `restaurant:restaurants (*, park:parks (*))` syntax
- **URL params:** Meal tracker passes carbs to Insulin Helper via `?carbs=X`
- **ESM modules:** Scripts use `import { dirname } from 'path'; import { fileURLToPath } from 'url'; const __dirname = dirname(fileURLToPath(import.meta.url))` — no bare `__dirname`

### Routing

| Path | Page | Bottom Nav Tab |
|------|------|---------------|
| `/` | Home (park grid) | Parks |
| `/browse` | Menu browser (accepts `?park=UUID`) | Browse |
| `/park/:id` | Park detail | — |
| `/insulin` | Insulin calculator | Insulin |
| `/packing` | Packing checklist | More |
| `/guide` | Diabetes education | More |
| `/advice` | Park day tips | More |

## UI Design System

### Color Palette
- **Primary:** Teal (#0d9488 / teal-600) and Emerald (#059669)
- **Accent:** Amber (#f59e0b) for warnings/diabetes-related
- **Background:** Stone-50/Stone-100 (warm gray)
- **Cards:** White, rounded-2xl, subtle shadow

### Traffic Light Nutrition Colors
| Metric | Green (safe) | Amber (caution) | Red (limit) |
|--------|-------------|-----------------|-------------|
| Carbs | ≤30g | 31-60g | >60g |
| Sugar | <10g | 10-25g | >25g |
| Calories | <400 | 400-700 | >700 |
| Sodium | <500mg | 500-1000mg | >1000mg |

### Mobile Navigation
- Bottom tab bar (5 tabs) below md breakpoint — research shows 40% faster task completion vs hamburger
- 48px minimum touch targets throughout
- Sticky filter bar with backdrop blur

### Accessibility
- Focus-visible outlines (2px solid teal)
- High contrast mode (`.high-contrast` class on body)
- Adjustable font scale
- ARIA labels on all interactive elements
- Don't rely solely on color — icons + text labels alongside color coding

## Supabase Setup Gotchas

- **PostgREST schema cache:** After running migration SQL, you MUST run `NOTIFY pgrst, 'reload schema'` or changes won't be visible via the API
- **Partial migration:** If the SQL editor only executes part of the migration, columns will be missing. Drop everything and re-run the complete migration.
- **RLS policies:** All tables have `FOR SELECT USING (true)` — read-only public access via anon key
- **Service role key:** Only used by scripts, never exposed to client. The client uses `VITE_SUPABASE_ANON_KEY`.

## Vercel Deployment

- `vercel.json` has rewrite rule: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in Vercel dashboard
- Pushes to main auto-deploy

## Insulin Calculator Formula

```
carbBolus = carbs / ICR
correction = (bloodGlucose - targetGlucose) / correctionFactor
baseDose = carbBolus + correction
activityAdjustment = moderate: 25%, high: 50%
suggestedDose = max(0, baseDose * (1 - adjustment))
```

Always shown with "Educational tool only — not medical advice" disclaimer.

## Problems Encountered & Solutions

### USDA Enrichment Failed on First Run
**Problem:** All 459 items failed with two errors:
1. `invalid input syntax for type integer: "1.5"` — USDA API returns decimal floats but `nutritional_data` columns are INTEGER
2. `invalid input value for enum nutrition_source: "usda_enriched"` — script used a value not in the enum

**Solution:** Added `Math.round()` to all nutrient values before DB update, changed source to `'api_lookup'`.

### 237 Items Had No USDA Match
**Problem:** Theme-park-specific names like "Ronto Wrap", "Blue Milk", "Dole Whip" return zero results from USDA.

**Solution:** Built `enrich-from-descriptions.ts` that maps item names/descriptions to generic food terms (e.g., "Ronto Wrap" → "pulled pork sandwich", "Blue Milk" → "coconut rice milk smoothie"). Also removed the `dataType` filter which was restricting results to Survey/Foundation/SR Legacy — adding Branded foods fixed the remaining 133 items.

### Calories Underestimated After USDA Enrichment
**Problem:** USDA returns nutrition per standard serving (e.g., a cheeseburger = ~350 cal). Theme park portions are 1.5-2.5x larger (a Disney cheeseburger with fries = 900-1200 cal). Users reported values looked too low.

**Solution:** Researched actual portion sizes from disneyfoodblog.com, allears.net, touringplans.com (including one lab-tested cupcake at 1,072 cal). Built `data/portion-multipliers.json` with category multipliers and specific item overrides. Built `adjust-portions.ts` that classifies each item by food type and applies the appropriate multiplier to ALL nutrition fields (calories, carbs, fat, protein, sugar, fiber, sodium, cholesterol). Applied to 778 items.

### PostgREST Schema Cache Stale After Migration
**Problem:** After running migration SQL in Supabase SQL Editor, API calls failed with "column not found" errors for `land` and `is_fried`.

**Solution:** Must run `NOTIFY pgrst, 'reload schema'` after any DDL changes. In our case the migration had also only partially executed — had to DROP all tables/types and re-run the complete migration from scratch, then reload.

### Supabase Nested Filter Silently Ignored
**Problem:** `.eq('restaurant.park_id', parkId)` on a nested join is silently ignored by Supabase — it doesn't error, just returns all rows unfiltered.

**Solution:** Removed the broken server-side filter, kept the client-side `useMemo` filter which already handled this correctly.

## Known Issues / Future Work

- Supabase `.eq()` on nested joined tables is silently ignored — use client-side filtering
- Allergen data is inferred from keywords, not confirmed by parks — marked as `may_contain`
- Nutrition data is estimated from USDA matches with portion multipliers — not official park data
- No food photos (gradient placeholders currently used)
- Favorites page not yet implemented (bottom nav links to Browse)
- "More" page not yet implemented (settings, accessibility controls, packing list, guides)
- Could add Nutritionix API as fallback for items USDA can't match
