# Changelog

## Unreleased

### Fixed

- Prevented resort section venue cards from showing `0 restaurants | 0 items` while per-card catalog counts are still loading.
- Added an inline "Counts unavailable — try refreshing" recovery state when restaurant or item-count requests fail.

### Tests

- Added component coverage for loaded, loading, and failed venue-count states.
- Added Playwright coverage for `/resort/wdw/theme-parks` to ensure loaded venue cards do not show zero-count placeholders.
