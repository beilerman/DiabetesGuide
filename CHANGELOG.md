# Changelog

## Unreleased

### Fixed

- Prevented resort section venue cards from showing `0 restaurants | 0 items` while per-card catalog counts are still loading.
- Added an inline "Counts unavailable — try refreshing" recovery state when restaurant or item-count requests fail.
- Reconciled top and bottom navigation labels through shared `NAV_ITEMS`, keeping the bottom bar mobile-only.
- Fixed the search status so `Searching...` clears after results resolve and added an `aria-live` result-count announcement.

### Tests

- Added component coverage for loaded, loading, and failed venue-count states.
- Added Playwright coverage for `/resort/wdw/theme-parks` to ensure loaded venue cards do not show zero-count placeholders.
- Added navigation metadata, header, and bottom navigation coverage for shared labels and active states.
- Added unit and Playwright coverage for search pending-state cleanup and inline filter placement.
