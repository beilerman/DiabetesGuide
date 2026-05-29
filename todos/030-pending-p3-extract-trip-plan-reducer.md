---
status: pending
priority: p3
issue_id: 030
tags: [code-review, agent-native]
dependencies: []
---

# Extract trip-plan reducer to src/lib/trip-plan.ts

## Problem Statement
The `useTripPlan` hook embeds reducer logic (slot management, day totals, item add/remove) directly in a React hook, making it inaccessible to scripts and harder to test. Pure primitives in `src/lib/trip-plan.ts` would align with the agent-native pattern established by `insulin.ts`/`confidence.ts`.

## Findings
- **Source agent:** agent-native-reviewer
- **Evidence:** `src/hooks/useTripPlan.ts` — reducer + math intertwined with React state
- **Severity rationale:** P3 — architectural hygiene; UI behavior unchanged.

## Proposed Solutions

### Option A — Extract pure reducer (recommended)
- **What:** Move `addItemToSlot`, `removeItemFromSlot`, `computeDayTotals`, and the trip-plan state shape into `src/lib/trip-plan.ts`. Hook becomes a thin wrapper over the pure reducer + `useState`/`useReducer`.
- **Pros:**
  - Trip math testable without React.
  - Reusable by future export/sharing scripts.
  - Matches agent-native pattern.
- **Cons:**
  - Small refactor across hook + consumers.
  - Two-file structure (lib + hook).
- **Effort:** Medium
- **Risk:** Low

### Option B — Leave embedded
- **What:** Keep reducer inside the hook.
- **Pros:**
  - Zero churn.
  - One file to read.
- **Cons:**
  - Reducer untestable in isolation.
  - Agents/scripts cannot reuse logic.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\hooks\useTripPlan.ts`
  - `C:\Users\medpe\diabetesguide\src\lib\trip-plan.ts` (new)
  - `C:\Users\medpe\diabetesguide\src\lib\__tests__\trip-plan.test.ts` (new)
- **Components/modules:** useTripPlan, Plan.tsx (consumer)
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] Pure functions exported from `src/lib/trip-plan.ts`.
- [ ] `useTripPlan` delegates to pure reducer.
- [ ] Vitest covers add/remove/totals (>= 4 cases).
- [ ] `Plan.tsx` UI behavior unchanged; build + tests pass.

## Work Log
- **2026-05-28** Deferred. `useTripPlan` is the largest of the three hook reducers (the diff stat in this branch shows +119 lines). The right cut — pure `tripPlanReducer(state, action)` + day-totals helpers — is a medium refactor that touches `useTripPlan.ts`, the existing `src/lib/__tests__/trip-plan.test.ts` (already 12 tests), and the consumer `Plan.tsx`. Lower priority than the BetterChoices/favorites/recent-searches extractions done in this batch because the trip-plan tests already exercise the reducer paths via the hook (so the testability gain is smaller). Pair with `031` (meal-cart) and `032` (compare) when revisiting the hook layer.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 029, 031, 032, 033, 034
