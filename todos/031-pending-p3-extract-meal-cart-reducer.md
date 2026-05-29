---
status: pending
priority: p3
issue_id: 031
tags: [code-review, agent-native]
dependencies: []
---

# Extract meal-cart reducer to src/lib/meal-cart.ts

## Problem Statement
`useMealCart` couples cart reducer (add/remove/update/clear, totals computation) with localStorage and React state. Pure primitives in `src/lib/meal-cart.ts` would let scripts and tests exercise the cart math without React or storage, matching the agent-native pattern.

## Findings
- **Source agent:** agent-native-reviewer
- **Evidence:** `src/hooks/useMealCart.ts` — reducer + storage + state combined
- **Severity rationale:** P3 — hygiene; no behavioral change.

## Proposed Solutions

### Option A — Extract pure reducer + storage adapter (recommended)
- **What:** Move pure reducer (`addItem`, `removeItem`, `updateQty`, `clear`, `computeTotals`) to `src/lib/meal-cart.ts`. Hook composes reducer + `useLocalStorage`.
- **Pros:**
  - Cart totals unit-testable without React.
  - Easier to swap storage layer (e.g., Supabase) later.
  - Consistent with `insulin.ts` extraction style.
- **Cons:**
  - Two-file structure.
  - Small refactor effort.
- **Effort:** Small
- **Risk:** Low

### Option B — Leave inside hook
- **What:** Keep cart logic in `useMealCart`.
- **Pros:**
  - Zero churn.
  - Single import.
- **Cons:**
  - Reducer math entangled with React.
  - Hard to test edge cases (duplicate items, qty 0).
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\hooks\useMealCart.ts`
  - `C:\Users\medpe\diabetesguide\src\lib\meal-cart.ts` (new)
  - `C:\Users\medpe\diabetesguide\src\lib\__tests__\meal-cart.test.ts` (new)
- **Components/modules:** useMealCart, Meal.tsx, MealCart component
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] Pure reducer and `computeTotals` exported from `src/lib/meal-cart.ts`.
- [ ] Hook delegates to pure reducer.
- [ ] >=4 vitest cases (add, dup-merge, remove, totals).
- [ ] Build + tests pass; cart UI behaves identically.

## Work Log
- **2026-05-28** Deferred. `useMealCart` already has 8 tests in `src/hooks/__tests__/useMealCart.test.tsx` (the existing exemplar of the project's testing pattern) and a `__resetMealCartState` test helper, so the "untestable in isolation" rationale is weakest here. Reducer extraction would still pay off architecturally — `Meal.tsx` could compute totals from the lib without going through the hook — but the immediate quality gain is small. Pair with `030` and `032` next time the hooks layer is reorganised.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 029, 030, 032, 033, 034
