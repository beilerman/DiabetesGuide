# DiabetesGuide

DiabetesGuide is a mobile-first theme-park nutrition guide for people planning meals with diabetes. It combines park, restaurant, and menu-item nutrition data with local favorites, trip planning, and an educational carb and correction estimator.

## Tech Stack

- React 19, TypeScript, Vite, React Router
- TanStack Query for catalog fetching and cache state
- Supabase Postgres as the read-only catalog source
- Tailwind CSS v4 for the interface
- Vitest and Testing Library for unit and component tests
- Playwright for route-level browser checks

## Local Development

Create a local environment file with the public Supabase values:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Then run:

```bash
npm install
npm run dev
```

## Verification

Use the focused commands while working, then run the full set before opening a PR:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

The Playwright suite starts a production preview server and uses mocked catalog responses where a test should not depend on live Supabase data.

## Task 1 Notes

The resort section routes, such as `/resort/wdw/theme-parks`, are client-rendered SPA routes. Venue card counts are loaded per card through TanStack Query, so cards must stay in a loading skeleton until both restaurant and menu item counts are resolved. Count failures render an inline recovery message instead of misleading zero-count cards.

## Task 2 Notes

Primary navigation metadata lives in `src/lib/nav.ts`. The desktop header and mobile bottom navigation both consume that shared source, while the bottom navigation remains mobile-only via the `md:hidden` breakpoint.

## Task 3 Notes

The search page only shows the `Searching...` status during an initial pending catalog request or a deferred query transition. Background refetches with already-resolved results do not keep the status visible, and the result count uses `aria-live="polite"`.

## Task 4 Notes

Catalog counts now distinguish menu items, restaurants, and destinations in the home hero. Browse explains the All Parks preview limit with a tooltip on `loaded preview items`, and visible resort/browse terminology uses `destinations` for parks, hotels, ships, and grouped properties.

## Task 5 Notes

Hidden carb-estimator output now uses `HiddenDoseExplainer` on both `/insulin` and `/meal`. The explainer lists active safety triggers and links to `/data-sources#estimator-safety`, where the estimator guardrails are documented.

## Task 6 Notes

Item detail pages show one Sodium metric in the nutrition grid, display the catalog update date next to the grade badge, and expose a grade-specific explanation that links to `/data-sources#grade-rubric`.

## Task 7 Notes

Search grade chips are multi-select filter toggles backed by the `?grade=` query string. The grade explanation is a separate link to `/data-sources#grade-rubric` so the chips are filters, not decoration.

## Task 8 Notes

The desktop header uses `ContrastToggle`, which persists high contrast through `dg_preferences`, exposes `aria-pressed`, and shows `Contrast: on` while active. Settings uses the same preference hook, so both controls stay synchronized.

## Task 9 Notes

The packing checklist stores checked items in `dg_checklist`, grouped by the active profile combination such as `t1`, `t1-child`, or `t1-pump-cgm`. The page shows per-section progress, a reset action for the current profile, and a print/export control backed by the print stylesheet.

## Task 10 Notes

Trip planning now stores versioned trip backups in `dg.trips.v1`, with an active trip plus a trips array. The `/plan` page creates named date-range trips, records selected parks, supports favorite and Meal Builder item assignment into trip days, and exposes JSON export/import for local backup.
