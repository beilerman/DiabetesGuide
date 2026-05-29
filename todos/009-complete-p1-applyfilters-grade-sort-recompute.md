---
status: complete
priority: p1
issue_id: 009
tags: [code-review, performance]
dependencies: []
---

# applyFilters grade sort recomputes computeScore O(n log n) times

## Problem Statement
`src/lib/filters.ts:117-119` calls `computeScore(item)` from inside the sort comparator. JavaScript `Array.prototype.sort` invokes the comparator approximately `n log n` times, meaning each item's score is recomputed ~13× for n=9000. Total: ~117,000 score computations instead of 9,000. Estimated 80-150ms wasted on `/browse?sort=grade` — and Home links straight to this view, so this is the first interaction many users hit. Same anti-pattern likely applies to `carbsAsc/Desc/caloriesAsc/Desc` sorts.

## Findings
- **Source agent:** performance-oracle
- **Evidence:** `src/lib/filters.ts:117-119` — `items.sort((a, b) => computeScore(b) - computeScore(a))` (and similar for other sort modes).
- **Severity rationale:** First-paint perf hit on the most-trafficked page. Mobile users on lower-end devices feel this directly.

## Proposed Solutions

### Option A — Pre-compute scores into a Map, sort against Map lookups (recommended)
- **What:** Before sorting, build `const scores = new Map(items.map(i => [i.id, computeScore(i)]))`. Then sort with `(a, b) => scores.get(b.id)! - scores.get(a.id)!`. Apply the same pattern to `carbsAsc`, `carbsDesc`, `caloriesAsc`, `caloriesDesc` (anywhere a derived value is read inside the comparator).
- **Pros:**
  - Reduces n log n × cost(computeScore) to n × cost + n log n × Map.get.
  - Minimal code change (~5 LOC).
  - Pattern reusable across sort modes.
- **Cons:**
  - Map allocation per filter call (still cheap relative to current cost).
  - Slightly more code than the inline approach.
- **Effort:** Small
- **Risk:** Low

### Option B — Decorate-sort-undecorate (Schwartzian transform)
- **What:** Map items to `[score, item]` tuples, sort by tuple[0], map back to items.
- **Pros:**
  - Classic well-known idiom.
  - Same complexity win as Option A.
- **Cons:**
  - Two extra array allocations.
  - Slightly less readable than Map approach.
- **Effort:** Small
- **Risk:** Low

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\src\lib\filters.ts` (lines 117-119 and other sort modes)
- **Components/modules:** `applyFilters` used by `Browse`, `Search`, `Home` quick-links
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] `applyFilters` no longer calls `computeScore` (or any other derived getter) from inside a sort comparator.
- [ ] Existing tests in `src/lib/__tests__/filters.test.ts` still pass.
- [ ] Manual perf check: `/browse?sort=grade` with 9000 items renders measurably faster (target: shave ≥50ms; verify via DevTools Performance recording).
- [ ] Same fix applied to `carbsAsc/Desc/caloriesAsc/Desc` if they share the anti-pattern.

## Work Log
- **2026-05-28** Option A was already applied in the working tree before this session — `src/lib/filters.ts:109-127` now pre-computes scores into a Map for `grade` sort and pre-computes carbs/calories into a Map for the four nutrition-derived sort modes. Verified by re-reading the diff vs HEAD and confirming the old inline `sortFns[filters.sort]` block was replaced. `src/lib/__tests__/filters.test.ts` (6 tests) still passes.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: (none)
