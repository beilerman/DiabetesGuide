---
status: pending
priority: p3
issue_id: 062
tags: [code-review, data, scripts]
dependencies: []
---

# adjust-portions.ts fetches without pagination; only first ~1000 items adjusted

## Problem Statement

Unlike its siblings, adjust-portions.ts reads all menu_items with a nested join and no .range() pagination, relying on the implicit PostgREST 1000-row default. With ~9,261 items it silently processes only the first ~1000, making its effect non-deterministic relative to catalog size. Use the canonical fetchAllItems() helper. (Distinct from 041 idempotency.)

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 062)
