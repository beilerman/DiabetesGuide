# Changelog

## Unreleased

### Fixed

- Prevented resort section venue cards from showing `0 restaurants | 0 items` while per-card catalog counts are still loading.
- Added an inline "Counts unavailable — try refreshing" recovery state when restaurant or item-count requests fail.
- Reconciled top and bottom navigation labels through shared `NAV_ITEMS`, keeping the bottom bar mobile-only.
- Fixed the search status so `Searching...` clears after results resolve and added an `aria-live` result-count announcement.
- Clarified catalog counts as menu items, restaurants, and destinations, with an All Parks preview tooltip on Browse.
- Added a shared hidden-dose explainer for the insulin and meal estimators, linked to estimator safety methodology.
- Removed duplicate Sodium output from item detail pages and added grade/rubric context plus visible freshness.
- Converted Search grade chips into URL-backed filter toggles with a separate grade-rubric link.
- Added a reusable header contrast toggle with visible active-state text and stronger high-contrast palette overrides.
- Added profile-scoped packing checklist persistence, section progress, reset confirmation, and print/export styling.
- Reworked Trip Plan into named date-range trips with selected parks, Meal Builder/favorite assignment, and JSON backup under `dg.trips.v1`.
- Added focus-moving home destination jump links and a scroll-triggered Back to top action.
- Made the home catalog badge and quick-filter chip row responsive with a scroll affordance and 44px chip targets.
- Added route-aware skip links for Search/Browse and corrected item-detail contrast issues caught by axe.

### Tests

- Added component coverage for loaded, loading, and failed venue-count states.
- Added Playwright coverage for `/resort/wdw/theme-parks` to ensure loaded venue cards do not show zero-count placeholders.
- Added navigation metadata, header, and bottom navigation coverage for shared labels and active states.
- Added unit and Playwright coverage for search pending-state cleanup and inline filter placement.
- Added Browse summary and Playwright coverage for catalog count terminology and preview-limit copy.
- Added unit and Playwright coverage for hidden-dose explainer triggers and methodology links.
- Added unit and Playwright coverage for item detail grade context, updated date, and concise Sodium rendering.
- Added unit and Playwright coverage for Search grade querystring hydration and updates.
- Increased the Vitest timeout for route-heavy component tests so the full suite remains stable under parallel load.
- Added unit and Playwright coverage for high-contrast header state, persistence, and Settings synchronization.
- Added unit and Playwright coverage for packing checklist profile persistence, progress, reset, and print/export.
- Added unit and Playwright coverage for trip creation, versioned storage, JSON export/import, and selected parks.
- Added unit and Playwright coverage for home anchor focus movement and Back to top visibility.
- Added unit and Playwright coverage for home hero badge placement and quick-filter chip responsiveness.
- Added a CI axe-core gate for serious/critical accessibility violations across core public routes.
