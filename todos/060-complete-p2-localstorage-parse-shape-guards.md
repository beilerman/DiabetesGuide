---
status: complete
priority: p2
issue_id: 060
tags: [code-review, robustness]
dependencies: []
---

# localStorage reads trusted JSON.parse shape without guards

## Problem Statement

getRecentSearches, useFavorites (new Set(JSON.parse(...))), and PackingList trusted parsed shapes — a corrupted value could render [object Object] chips or throw. useMealCart/useTripPlan already did exemplary unknown→sanitize parsing.

## Resolution

Fixed as part of 050: useFavorites array/element-guards the parsed value; usePreferences sanitizes per-field (type + finite + non-negative carb goal). Covered by the new hook tests. (Search.tsx/PackingList.tsx left as a follow-up — lower blast radius, crashes already contained by try/catch.)

## Work Log

- 2026-05-30 — Implemented and verified (lint clean, tsc pass, 184/184 tests).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 060)
