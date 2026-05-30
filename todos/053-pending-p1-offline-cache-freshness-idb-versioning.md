---
status: pending
priority: p1
issue_id: 053
tags: [code-review, architecture, offline]
dependencies: []
---

# Three uncoordinated caches + unversioned IndexedDB can serve stale carb counts

## Problem Statement

React Query (5-min), best-effort IndexedDB (never invalidated/aged; getLastSync written but never read for staleness), and the Workbox supabase-api cache (24h NetworkFirst) sit on the same data with independent TTLs. IndexedDB schema is DB_VERSION=1 with a create-only upgrade fn, so a type-shape change leaves old PWA rows with missing fields. A nutrition tool feeding insulin decisions can show an indefinitely-stale carb count with no freshness signal.

## Progress (partial — 2026-05-30)

**Done — IndexedDB schema versioning (the data-shape integrity risk).**
Added `DATA_SCHEMA_VERSION` (independent of the structural idb `DB_VERSION`) +
`ensureSchemaVersion()` in `src/lib/offline-db.ts`, wired into the db open path.
On open, if the persisted data-shape version doesn't match the code's, the data
stores (parks/restaurants/menu_items) are dropped and re-fetched; `lastSync` is
preserved. This closes the "returning PWA user served rows with missing/renamed
fields" hole. Bump `DATA_SCHEMA_VERSION` whenever the cached value shapes or the
`by-park` index path change. Covered by `offline-schema-version.test.ts` (4
tests). The structural index-path concern is mitigated transitively — a path
change is a shape change, so it bumps the version and clears.

## Remaining (needs a decision — left intentionally)

1. **Freshness signal.** `getLastSync` is read by `useOfflineStatus`/
   `OfflineBanner` but only to print "last synced X"; there's no "data may be
   stale" treatment when the cached snapshot is old. Low-risk additive UI —
   could flag e.g. > 7 days. (Note: also fix finding 056's lastSync read race
   when touching this.)
2. **Triple-cache coordination.** The Workbox `supabase-api` runtime rule (24h
   NetworkFirst on `/rest/`) double-caches the same payload the IndexedDB layer
   already persists, with a conflicting TTL. Deciding the source of truth
   (recommend: IndexedDB durable store; narrow/remove the SW `/rest/` rule)
   changes offline behavior materially — wants an explicit call, not a
   drive-by. See `vite.config.ts` VitePWA config.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 053)
