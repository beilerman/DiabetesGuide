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

### Tests

- Added component coverage for loaded, loading, and failed venue-count states.
- Added Playwright coverage for `/resort/wdw/theme-parks` to ensure loaded venue cards do not show zero-count placeholders.
- Added navigation metadata, header, and bottom navigation coverage for shared labels and active states.
- Added unit and Playwright coverage for search pending-state cleanup and inline filter placement.
- Added Browse summary and Playwright coverage for catalog count terminology and preview-limit copy.
- Added unit and Playwright coverage for hidden-dose explainer triggers and methodology links.
- Added unit and Playwright coverage for item detail grade context, updated date, and concise Sodium rendering.
