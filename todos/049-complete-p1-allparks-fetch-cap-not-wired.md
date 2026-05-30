---
status: complete
priority: p1
issue_id: 049
tags: [code-review, performance]
dependencies: []
---

# All-Parks fetch ignored the documented 3,000-item cap

## Problem Statement

useMenuItems called fetchMenuItemsOffline(parkId) with no options, so the internal cap defaulted to Infinity. The documented 3,000-item cap existed in code but was passed by no caller, so the "All Parks" path paginated the entire ~9,261-row joined corpus over ~10 sequential requests.

## Resolution

useMenuItems now passes `parkId ? {} : { limit: 3000 }` — per-park views stay unbounded, the all-parks path is capped. src/lib/queries.ts:34. Verified: lint/tsc/tests green.

## Work Log

- 2026-05-30 — Implemented and verified (lint clean, tsc pass, 184/184 tests).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 049)
