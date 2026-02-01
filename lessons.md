# DiabetesGuide - Project Lessons & Notes

## Project Overview

Consolidated three existing repos (`disney-diabetes-guide`, `wdwdiabetes`, `park-nutrition-mvp`) into a single React + TypeScript app backed by Supabase PostgreSQL. Deployed to Vercel as a static SPA.

## Source Repos

| Repo | What it had | What we used |
|------|-------------|-------------|
| `disney-diabetes-guide` | Static HTML/JS, `data.json` (241 menu items across 4 Disney parks, ~65 restaurants), `park-advice.html` | Menu data for seeding, park advice content |
| `wdwdiabetes` | JS app with insulin calculator, packing checklist, meal tracker, accessibility controls, `supabase-schema.sql` | Insulin calculation formula, checklist logic, T1/T2 education content |
| `park-nutrition-mvp` | Full React+TS+Supabase app with migrations, types, queries | Schema design patterns (UUID PKs, RLS policies), TypeScript interfaces, React Query hook patterns |

## Tech Stack

- React 19 + TypeScript + Vite
- Supabase (PostgreSQL) - read-only via anon key, RLS policies
- TanStack React Query v5 - data fetching with 5-min stale time
- React Router v7 - client-side routing
- Tailwind CSS v4 (using `@tailwindcss/vite` plugin, import via `@import "tailwindcss"`)
- Vercel deployment (static SPA with rewrite rule for client-side routing)

## Key Architecture Decisions

- **No auth** - favorites, meal cart, preferences all in localStorage
- **Multi-park expandable** - schema supports Disney + Universal + others
- **Offline-tolerant** - React Query cache keeps app usable if connection drops
- **Client-side filtering** - filters applied in-memory via `useMemo`, not on every Supabase query

## Database Schema

5 tables: `parks`, `restaurants`, `menu_items`, `nutritional_data`, `allergens`
- All use UUID primary keys via `gen_random_uuid()`
- 3 custom enums: `menu_category`, `nutrition_source`, `allergen_severity`
- RLS enabled on all tables with public SELECT policies only
- Indexes on all foreign keys + `menu_items.category`

## Data Migration

- `data/source.json` contains the original 241 items
- `scripts/seed.ts` parses it and inserts into Supabase (requires `SUPABASE_SERVICE_ROLE_KEY`)
- Category inference: drinks -> beverage, dessert keywords -> dessert, < 300 cal -> snack, else -> entree
- Extended nutrition fields (sugar, protein, fiber, sodium, cholesterol) left null for future backfill
- Confidence score set to 70 for all imported items (source: official)

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `dg_meal_cart` | Array of MealItem objects |
| `dg_favorites` | Array of menu item UUIDs |
| `dg_preferences` | `{ highContrast, fontScale, carbGoal }` |
| `dg_checklist` | Object mapping checklist item text to boolean |

## Insulin Calculator Formula

```
carbBolus = carbs / ICR
correction = (bloodGlucose - targetGlucose) / correctionFactor
baseDose = carbBolus + correction
activityAdjustment = moderate: 25%, high: 50%
suggestedDose = max(0, baseDose * (1 - adjustment))
```

Always displayed with "Educational tool only - not medical advice" disclaimer.

## Routing

| Path | Page |
|------|------|
| `/` | Home (park selector grid) |
| `/park/:id` | Park detail (restaurants grouped by land) |
| `/browse` | Full menu browser with filters |
| `/insulin` | Insulin Helper calculator |
| `/packing` | Packing Checklist |
| `/guide` | T1/T2 Diabetes Guide |
| `/advice` | Park day advice |

## Gotchas & Patterns

- Tailwind v4 uses `@import "tailwindcss"` in CSS, not the old `@tailwind` directives
- `@tailwindcss/vite` plugin replaces the old PostCSS-based approach
- Supabase nested selects use the syntax: `restaurant:restaurants (*, park:parks (*))`
- When filtering by nested relation in Supabase, the filter applies at the join level, so you may need client-side post-filtering (see `useMenuItems`)
- `useSearchParams` from react-router-dom is used to pass carbs from meal tracker to insulin helper via URL params
- High contrast mode toggles a `.high-contrast` class on `document.body`

## Remaining Setup (Manual)

1. Create Supabase project at supabase.com
2. Run `supabase/migrations/00001_initial_schema.sql` in SQL editor
3. Copy URL + anon key to `.env.local`
4. Add service role key for seeding
5. Run `npm run seed`
6. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel env vars
7. Deploy to Vercel (push to main or run `vercel`)
