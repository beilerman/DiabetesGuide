---
status: complete
priority: p3
issue_id: 061
tags: [code-review, performance]
dependencies: []
---

# ParkDetail By-Land grouping did O(n·m) restaurants.find per item

## Problem Statement

The land-grouping loop ran restaurants.find(r => r.id === item.restaurant_id) per item — a linear scan re-run whenever filtered/restaurants changed.

## Resolution

Builds a Map<id, Restaurant> once (useMemo on restaurants) and looks up O(1); grouping is now O(n). src/pages/ParkDetail.tsx. Verified: lint/tsc/tests green.

## Work Log

- 2026-05-30 — Implemented and verified (lint clean, tsc pass, 184/184 tests).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 061)
