---
status: pending
priority: p3
issue_id: 065
tags: [code-review, race, safety]
dependencies: []
---

# ?carbs= deep-link into InsulinHelper read only at mount; re-link feeds stale carbs

## Problem Statement

initialCarbs = Number(searchParams.get('carbs')) seeds useState, whose initializer runs once. If the user is already on /insulin and the MealCart link fires again with a new ?carbs=, the URL updates in place but carbs state is untouched — the diabetic computes a bolus against the old value. (Distinct from 026 value-clamp.) Sync via an effect watching searchParams or drive the calculator inline as Meal.tsx does.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 065)
