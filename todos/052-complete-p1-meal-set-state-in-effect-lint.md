---
status: complete
priority: p1
issue_id: 052
tags: [code-review, quality, ci]
dependencies: []
---

# npm run lint red: set-state-in-effect in the dosing page

## Problem Statement

ESLint failed (exit 1) on the only repo lint error: a useEffect in Meal.tsx calling setCarbOverride(null) to clear a stale override. The logic was already redundant — activeCarbOverride is derived correctly, so a stale override can never reach effectiveCarbs.

## Resolution

Removed the dead effect; replaced with an explanatory comment. Lint now clean. src/pages/Meal.tsx.

## Work Log

- 2026-05-30 — Implemented and verified (lint clean, tsc pass, 184/184 tests).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 052)
