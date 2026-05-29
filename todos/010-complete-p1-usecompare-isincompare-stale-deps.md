---
status: complete
priority: p1
issue_id: 010
tags: [code-review, typescript, performance]
dependencies: []
---

# useCompare.isInCompare dep array changed [items] → [] freezes the callback

## Problem Statement
`src/hooks/useCompare.ts:95-97` declares `isInCompare` with an empty dependency array (`useCallback(..., [])`). The function body reads module-level `sharedItems` rather than the React state `items`, so the callback is frozen across renders. Consumers using `isInCompare` inside `useMemo`/`useEffect` will not re-fire when compare state changes — they hold a stale reference. The previous version had a different bug (closed over the wrong variable). Both versions are broken.

## Findings
- **Source agent:** kieran-typescript-reviewer (also flagged by learnings-researcher — regression to a previously-fixed bug)
- **Evidence:** `src/hooks/useCompare.ts:95-97` — `useCallback((id) => sharedItems.some(...), [])` with empty deps, reading module scope.
- **Severity rationale:** Silent UI staleness. Compare UI may show wrong checked state. Hard to detect in casual testing.

## Proposed Solutions

### Option A — Read state, list state in deps (recommended)
- **What:** Change body to read `items` (the hook's state) and set dep array to `[items]`. The callback re-creates when items change; consumers see fresh reference.
- **Pros:**
  - Idiomatic React; satisfies exhaustive-deps lint.
  - Same render frequency as before — no perf regression.
  - Fixes both the old bug and the new bug.
- **Cons:**
  - Slightly more callback re-creation than `[]`, but that's intentional.
  - None substantive.
- **Effort:** Small
- **Risk:** Low

### Option B — Move hook into a Context
- **What:** Promote `useCompare` to `CompareContext` so all consumers share the same state instance via React Context. Eliminates the module-level `sharedItems` workaround.
- **Pros:**
  - Cleanest state model.
  - No risk of multiple `useCompare` instances diverging.
  - Resolves the architectural smell that led to `sharedItems` in the first place.
- **Cons:**
  - Larger refactor; touches every consumer.
  - Provider must be wired into the app tree.
- **Effort:** Medium
- **Risk:** Medium

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\src\hooks\useCompare.ts` (lines 95-97)
- **Components/modules:** Compare flow — `ComparisonModal`, any component using `isInCompare`
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] `isInCompare` body reads React state (`items`) and dep array is `[items]` (or equivalent context-based fix).
- [ ] `useMemo`/`useEffect` consumers of `isInCompare` re-fire when compare state changes (manual test: add/remove item, observe consumer re-render).
- [ ] ESLint `react-hooks/exhaustive-deps` passes.
- [ ] Regression test added that asserts `isInCompare` returns updated value after compare state mutation.

## Work Log
- **2026-05-28** Option A was already applied in the working tree before this session — `src/hooks/useCompare.ts:81-97` now reads `items` state in all four callbacks (`addToCompare`, `removeFromCompare`, `clearCompare`, `isInCompare`) and lists `[items]` (or `[]` for `clearCompare` which reads nothing) in deps. Added a `__resetCompareState()` test helper plus `src/hooks/__tests__/useCompare.test.tsx` with 2 regression tests: (a) `isInCompare` returns updated value after add/remove, (b) callback identity changes when items change so memoized consumers re-fire. Both pass.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: (none — but flagged by learnings-researcher as a regression of a previously-fixed bug)
