---
status: complete
priority: p2
issue_id: 058
tags: [code-review, quality]
dependencies: []
---

# Traffic-light thresholds duplicated across nutrition-colors and MenuItemCard

## Problem Statement

The carb/sugar/calorie/sodium green/amber bands are encoded twice: nutrition-colors.ts (Tailwind classes) and MenuItemCard.tsx (*Dots color names). They agree today only by manual coincidence; tuning one file creates a silent traffic-light/dot mismatch on the same card.

## Resolution

Introduced `NUTRITION_BANDS` (numeric thresholds) + `nutritionLevel(metric, value)`
in `nutrition-colors.ts` as the single source of truth. The four `*Color`
class-returning functions now derive from it, and `MenuItemCard`'s four `*Dots`
functions delegate to it (`nutritionLevel('carbs', v)`, etc.). Exact boundary
semantics preserved: carbs green is inclusive (`<= 30`); sugar/calories/sodium
green is exclusive (`< 10/400/500`); amber ceiling inclusive for all. A future
threshold change now lives in one place and can't drift between the number badge
and the dot meter on the same card.

Added `src/components/menu/__tests__/nutrition-colors.test.ts` (9 tests): pins
each metric's boundary behavior, asserts the class functions agree with
`nutritionLevel`, and checks the bands match the documented CLAUDE.md spec.

## Work Log

- 2026-05-30 — Implemented + tested. Verified: lint clean, tsc pass, 193/193 tests.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 058)
