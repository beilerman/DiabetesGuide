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
