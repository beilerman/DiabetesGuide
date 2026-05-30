---
status: complete
priority: p3
issue_id: 051
tags: [code-review, typescript]
dependencies: []
---

# ComparisonModal "best choice" mistyped-key (false positive)

## Problem Statement

Originally filed P1 against a corrupted file read. Live code already guards: getNumericValue returns NaN for non-numeric/missing values and getBestIndex does `if (isNaN(v)) continue` and `return isNaN(bestVal) ? -1 : bestIdx`, so a missing value can never be flagged "best".

## Resolution

No code change. Residual is a harmless type smell only — the `key: keyof CompareItem | 'netCarbs' | 'grade'` union + `as` cast ('grade' unused, 'netCarbs' always routes through format). Optional future P3 tightening.

## Work Log

- 2026-05-30 — Implemented and verified (lint clean, tsc pass, 184/184 tests).

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 051)
