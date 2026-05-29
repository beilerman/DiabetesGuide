---
status: pending
priority: p3
issue_id: 032
tags: [code-review, agent-native]
dependencies: [026]
---

# Export CompareItem + toCompareItem + pure compare reducer

## Problem Statement
`useCompare` mixes a module-level shared array, a reducer-like API, and React subscriber state. Exporting `CompareItem`, `toCompareItem`, and a pure compare reducer from `src/lib/compare.ts` would let scripts/agents build comparison views and would give us a typed surface the hook can sit on.

## Findings
- **Source agent:** agent-native-reviewer
- **Evidence:** `src/hooks/useCompare.ts` — module-level state + closures, no pure surface
- **Severity rationale:** P3 — architectural; correctness work on `useCompare` itself is tracked as P1-10.

## Proposed Solutions

### Option A — Pure compare lib (recommended)
- **What:** Create `src/lib/compare.ts` exporting `CompareItem` type, `toCompareItem(menuItem)` constructor, and pure `addToCompare`/`removeFromCompare`/`clearCompare` reducers operating on `CompareItem[]`.
- **Pros:**
  - Typed contract independent of React.
  - Coordinates well with the P1-10 fix (move state to Context or pure reducer + hook).
  - Testable in isolation.
- **Cons:**
  - Coordinate with P1-10 to avoid churn.
  - One more file.
- **Effort:** Small
- **Risk:** Low

### Option B — Leave as-is
- **What:** Keep current module-level pattern.
- **Pros:**
  - Zero churn.
  - Already "works" once P1-10 is fixed.
- **Cons:**
  - No pure surface for tests/scripts.
  - Module-level state remains a footgun.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\hooks\useCompare.ts`
  - `C:\Users\medpe\diabetesguide\src\lib\compare.ts` (new)
  - `C:\Users\medpe\diabetesguide\src\lib\__tests__\compare.test.ts` (new)
- **Components/modules:** useCompare, ComparisonModal
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `CompareItem`, `toCompareItem`, pure reducers exported from `src/lib/compare.ts`.
- [ ] `useCompare` uses the lib (no parallel logic).
- [ ] Vitest covers add/remove/dedupe/limit.
- [ ] Compatible with P1-10 fix (issue 026 if present).

## Work Log
- **2026-05-28** Deferred. P1-10 (the underlying correctness fix on `useCompare`) is already complete and `__resetCompareState` + 2 regression tests are in place, so the "module-level state footgun" is contained. A `src/lib/compare.ts` extraction is a nice-to-have but would touch the same hook code we just stabilised; better to let the change settle before another refactor. Pair with `030` and `031` when revisiting.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 029, 030, 031 (agent-native parity); P1-10 (useCompare correctness)
