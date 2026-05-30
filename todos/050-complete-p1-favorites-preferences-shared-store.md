---
status: complete
priority: p1
issue_id: 050
tags: [code-review, race, data]
dependencies: []
---

# useFavorites/usePreferences lost writes across mounted instances

## Problem Statement

Both hooks used a private useState(load) per call site with a write-on-change effect — no shared store, no storage listener. Multiple components mount each hook at once, so a later toggle from a stale instance silently reverted the user’s favorites or carbGoal; two highContrast instances also fought over the body class.

## Resolution

Both converted to the module-level shared-store + listener-set pattern (matching useMealCart) with cross-tab `storage` sync; DOM effects centralized in the shared setter. Added useFavorites.test.tsx + usePreferences.test.tsx including multi-instance lost-write regression tests. Verified: 184/184 tests.

## Work Log

- 2026-05-30 — Implemented and verified (lint clean, tsc pass, 184/184 tests).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 050)
