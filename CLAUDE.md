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
| `parks` | name, location, timezone, first_aid_locations (JSONB) | 24 parks total |
| `restaurants` | park_id (FK), name, land, cuisine_type, hours (JSONB), lat/lon | ~355 restaurants |
| `menu_items` | restaurant_id (FK), name, description, price, category (enum), is_seasonal, is_fried, is_vegetarian | ~1551 items |
| `nutritional_data` | menu_item_id (FK), calories/carbs/fat/sugar/protein/fiber/sodium/cholesterol (all INTEGER), source (enum), confidence_score | One row per item |
| `allergens` | menu_item_id (FK), allergen_type (TEXT), severity (enum: contains/may_contain) | ~1098 records |

**Enums:** `menu_category` (entree/snack/beverage/dessert/side), `nutrition_source` (official/crowdsourced/api_lookup), `allergen_severity` (contains/may_contain)

**Indexes:** On all FKs + `menu_items.category`

## Data Pipeline

### Data Sources (13 JSON files in `data/parks/`)

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
| `additional-dining-1.json` | ~50 | Disney Springs, resort dining, snack carts |
| `additional-dining-2.json` | ~112 | Victoria & Albert's, CityWalk, Disney Springs bakeries, more parks |
| `disney-springs.json` | 281 | Disney Springs (54 restaurants across Marketplace, Landing, Town Center, West Side) |
| `downtown-disney.json` | 231 | Downtown Disney District at Disneyland Resort (21 restaurants). Note: major renovation renamed Catal→Paseo, Uva Bar→Centrico, Tortilla Jo's→Arthur & Sons (coming), La Brea→Porto's (coming) |

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
| `fix-data-anomalies.ts` | Fix surface-level data issues (sugar>carbs, wrong categories, wrong vegetarian flags, extreme values) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `fix-false-positives.ts` | Correct items incorrectly modified by fix-data-anomalies (Coffee Cake Cookie, BBQ Jackfruit, DOLE Whip) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `audit-dump.ts` | Export all ~1042 items with nutrition to `audit-dump.json` for analysis | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `audit-nutrition.ts` | 3-pass automated audit (internal consistency, external plausibility, systematic patterns) | None (reads `audit-dump.json`) |
| `fix-audit-findings.ts` | Fix systemic issues found by audit (over-multiplied items, missing micros, low protein) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| `fix-remaining.ts` | Targeted fixes for 15 specific items still flagged after bulk fixes | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |

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

# 7. Data quality fixes (run after enrichment + portion adjustment)
npx tsx scripts/fix-data-anomalies.ts
npx tsx scripts/fix-false-positives.ts

# 8. Audit (export → analyze → fix)
npx tsx scripts/audit-dump.ts
npx tsx scripts/audit-nutrition.ts       # reads audit-dump.json, writes audit-report.json
npx tsx scripts/fix-audit-findings.ts
npx tsx scripts/fix-remaining.ts
```

**Total corrections applied:** 864 fixes across all data quality scripts (573 original + 291 from Disney Springs/Downtown Disney batch).

## Data Quality & Audit

### The Over-Multiplication Problem

The biggest systemic data issue: `adjust-portions.ts` applied 1.5-2.5x multipliers to ALL items, but many USDA matches already returned full-portion values. Items that were already correctly sized got doubled. The audit scripts detect and fix this by defining maximum plausible calorie ranges per food type and dividing all macros proportionally when items exceed the range.

### Audit Architecture (3-pass in `audit-nutrition.ts`)

**Pass 1 — Internal consistency:** Caloric math (estimated cal from P*4+C*4+F*9 vs stated), macro ratio plausibility (fried items >25% fat, desserts >35% carbs, meat >20% protein), sodium-calorie ratio, sugar/fiber must be ≤ carbs.

**Pass 2 — External plausibility:** 27 food type profiles with expected calorie/macro ranges (burger 500-1400, pizza 400-1200, churro 200-600, etc.). Items outside range get flagged.

**Pass 3 — Systematic patterns:** Round number clustering, duplicate nutrition profiles, category ranking violations (e.g., a "dessert" with 0g sugar), missing data patterns by park.

### Fix Categories (in `fix-audit-findings.ts`)

| Fix | What it does | Count |
|-----|-------------|-------|
| Over-multiplied | Divides macros proportionally for 26 food types exceeding max range | ~180 |
| Fiber > carbs | Sets fiber to 10% of carbs (impossible for fiber to exceed carbs) | ~10 |
| Alcohol drinks | Reduces calorie gap >500 that can't be explained by alcohol (7 cal/g) | ~5 |
| Under-valued | Fixes items clearly too low (Garden Burger 104→450, Pretzel Dog 73→550) | ~10 |
| Low protein meat | Estimates 20% of cal from protein for meat dishes with <15g protein | ~30 |
| Missing micros | Fills sugar/protein/sodium/fiber for items with all nulls, estimated by food type | ~70 |

### Known Audit False Positives

The audit regex matches words within compound names — these are NOT data errors:
- "beer" matches Butterbeer, Beer-battered Onion Rings
- "coffee" matches Coffee Cake Cookie, Coffee-rubbed Rib-Eye
- "wine" matches Red Wine-braised Beef Cheeks
- "water" matches Twin Cold Water Lobster Tails
- "cocktail" matches Shrimp Cocktail

Alcoholic drinks legitimately show caloric math gaps because the P*4+C*4+F*9 formula doesn't account for alcohol calories (7 cal/g). A standard drink has ~100 cal from alcohol alone.

### Confidence Scores

| Score | Meaning |
|-------|---------|
| 70 | Original import data (source: official) |
| 50-60 | Good USDA match (source: api_lookup) |
| 40-45 | Fixed by audit scripts (data was corrected) |
| 30 | Estimated micros (sugar/protein/sodium filled from food type heuristics) |

### Data Quality Regex Gotchas

When writing regex for food item names, beware of substring matches:
- `/coffee/i` matches "Coffee Cake Cookie" — must anchor or exclude compound words
- `/crisp/i` in category inference matches "Crispy Chicken" — the `inferCategory` function incorrectly categorized savory "Crispy" items as desserts
- Vegetarian detection must exclude plant-based terms: "jackfruit", "beyond", "impossible" contain no meat despite descriptions mentioning food terms
- DOLE Whip is vegetarian despite some flavors having "float" in the name

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

### Data Anomaly Fix Script Caused False Positives
**Problem:** `fix-data-anomalies.ts` had regex patterns that over-matched:
1. Plain coffee detection (`/^(brewed )?coffee/i`) matched "Coffee Cake Cookie" and "Coffee-rubbed Rib-Eye Beef Puff", zeroing their nutrition data
2. Vegetarian fix un-flagged BBQ Jackfruit Sandwich (jackfruit is plant-based) and DOLE Whip items

**Solution:** Built `fix-false-positives.ts` to restore correct values for these 5 items. Lesson: always test regex against the full item list before applying bulk updates.

### additional-dining-2.json Had Wrong Format
**Problem:** The file used `lands` as an array of objects with `landId` references instead of the flat `land`/`restaurant` strings expected by `import-all.ts`.

**Solution:** Transformed to flat format matching the import schema. Split a single generic park entry into 12 actual parks.

### Windows Environment Variables in Scripts
**Problem:** `$env:VAR="value"` (PowerShell) and `set VAR=value` (CMD) don't work in bash. `node -e` with `require('@supabase/supabase-js')` fails because CJS can't find the ESM module.

**Solution:** Use inline bash syntax: `SUPABASE_URL="..." npx tsx scripts/script.ts`. Always write proper `.ts` files and run with `npx tsx` rather than inline `node -e`.

### Loading .env.local in Bash
**Problem:** `source .env.local` doesn't work because the `KEY=value` format without `export` doesn't set environment variables for child processes.

**Solution:** Use `export $(grep -v '^#' .env.local | xargs)` to load all variables from `.env.local` into the current shell session.

### inferLocation() Pattern Ordering Bug
**Problem:** `inferLocation()` in `import-all.ts` mapped "Downtown Disney District" to "Walt Disney World" because the general `/disney/` regex matched before the specific `/downtown disney|disneyland/` pattern.

**Solution:** The specific `/downtown disney|disneyland/` pattern MUST come before the general `/disney/` pattern. Order matters — more specific patterns first:
```typescript
if (/downtown disney|disneyland/.test(n)) return 'Disneyland Resort'
if (/disney|magic kingdom|epcot|hollywood studios|animal kingdom/.test(n)) return 'Walt Disney World'
```
**Lesson:** When adding new parks to `inferLocation()`, always check if the new name substring-matches an existing broader pattern.

## Chain Restaurant Nutrition Sources

Several chain restaurants at Disney Springs and Downtown Disney publish official nutrition data that could replace USDA estimates:

| Chain | Source | Parks Present |
|-------|--------|--------------|
| Earl of Sandwich | Official PDF on website | Disney Springs |
| Blaze Pizza | Official website nutrition page | Disney Springs, Downtown Disney |
| Chicken Guy! | Official website | Disney Springs |
| Wetzel's Pretzels | Official PDF | Disney Springs, Downtown Disney |
| Jamba | Official website | Disney Springs, Downtown Disney |
| Starbucks | Official website | Both (already widely available) |
| Sprinkles | Official website | Disney Springs |
| Salt & Straw | No published data | Disney Springs |
| Din Tai Fung | No published data | Downtown Disney |

These could be used to upgrade `confidence_score` from 50-60 (USDA estimate) to 85-90 (chain official).

## Known Issues / Future Work

- Supabase `.eq()` on nested joined tables is silently ignored — use client-side filtering
- Allergen data is inferred from keywords, not confirmed by parks — marked as `may_contain`
- Nutrition data is estimated from USDA matches with portion multipliers — not official park data
- ~342 audit flags remain (43 HIGH, mostly alcoholic drinks and regex false positives — see `audit-report.json`)
- No food photos (gradient placeholders currently used)
- Favorites page not yet implemented (bottom nav links to Browse)
- "More" page not yet implemented (settings, accessibility controls, packing list, guides)
- Could replace USDA estimates with chain-official nutrition data for 9+ chains (see Chain Restaurant Nutrition Sources above)
- Could add Nutritionix API as fallback for items USDA can't match
- Some parks have sparse data coverage (Walt Disney World Parks had 100% missing sugar/protein/sodium, now estimated)
- `inferCategory` in `seed.ts` has a "crisp" substring match that miscategorizes "Crispy" savory items as desserts — fixed in DB but the seed script still has the bug
