---
status: complete
priority: p2
issue_id: 015
tags: [code-review, ui, state-management]
dependencies: []
---

# Meal page carbOverride retains stale value when activeMealId is null

## Problem Statement
`src/pages/Meal.tsx:43` keys `carbOverride` by `mealId`, but the prior `useEffect` that reset the override on `activeMealId` change was removed in this changeset. With no active meal selected the page can render a stale override carried from a previous session, sending the wrong carb value into the Insulin Helper deep link.

## Findings
- **Source agent:** kieran-typescript-reviewer
- **Evidence:** `src/pages/Meal.tsx:43` — `carbOverride` map persists; no reset path when `activeMealId` is `undefined`.
- **Severity rationale:** P2 — affects only the no-meal-selected state; insulin numbers are still gated by the educational-only disclaimer.

## Proposed Solutions

### Option A — Explicit fallback when no active meal (recommended)
- **What:** When `!activeMealId`, render carbs from `mealItems.reduce(sum)` and skip the override lookup; clear stale entries from the override map on meal switch.
- **Pros:** Predictable; matches the pre-changeset behaviour.
- **Pros:** No new state shape.
- **Cons:** Adds a small branch in the render path.
- **Cons:** Requires a cleanup pass for the override map keyed by deleted meals.
- **Effort:** Small
- **Risk:** Low

### Option B — Reintroduce the useEffect reset
- **What:** Restore the deleted `useEffect` that zeroed out `carbOverride[activeMealId]` on switch.
- **Pros:** Smallest diff, restores prior behaviour exactly.
- **Pros:** Easy to reason about.
- **Cons:** `useEffect` for derived state is the React-anti-pattern path.
- **Cons:** Doesn't fix the underlying "stale entries persist" hazard.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\src\pages\Meal.tsx`
- **Components/modules:** Meal page, Insulin Helper deep link
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] With no active meal, carb display matches `mealItems.reduce(sum)`
- [ ] Switching active meal does not bleed override values across meals
- [ ] Insulin Helper deep link `?carbs=` reflects the active meal's value

## Work Log
- **2026-05-28** Option A. Added the `activeMealId && ...` guard to the `activeCarbOverride` derivation so `undefined === undefined` cannot resurface a stale override when no meal is selected. Added a `useEffect` that clears `carbOverride` whenever its `mealId` no longer matches `activeMealId` — covers meal switch, meal deletion, and the transient no-meal state. The Insulin Helper deep-link `?carbs=X` now reflects the active meal's effective carb total without bleed-through.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
