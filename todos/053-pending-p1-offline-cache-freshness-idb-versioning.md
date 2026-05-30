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

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 053)
