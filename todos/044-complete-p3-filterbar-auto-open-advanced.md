---
status: complete
priority: p3
issue_id: 044
tags: [code-review, ux]
dependencies: []
---

# FilterBar: auto-open advanced panel when advancedActiveCount > 0

## Problem Statement
`FilterBar.tsx` starts the advanced panel collapsed. When a user lands on a URL-shared filter state with advanced filters active, those filters apply silently — invisible until the user knows to expand the panel. Auto-opening when `advancedActiveCount > 0` makes the active state discoverable.

## Findings
- **Source agent:** kieran-typescript-reviewer / performance-oracle (UX subset)
- **Evidence:** `src/components/filters/FilterBar.tsx:21` — initial `useState(false)` ignores `advancedActiveCount`.
- **Severity rationale:** P3 — UX nit; filters still function, just hidden.

## Proposed Solutions

### Option A — Initialize from advancedActiveCount (recommended)
- **What:** Initialize `open` state with `useState(() => advancedActiveCount > 0)`. Optionally re-sync via effect when URL/state changes.
- **Pros:**
  - Shared filter URLs surface their active state.
  - One-line change.
  - No regression risk in default flow.
- **Cons:**
  - Slight initial-render shift if filters are active on first load.
  - Needs a tiny effect if `advancedActiveCount` can change post-mount without user toggling.
- **Effort:** Small
- **Risk:** Low

### Option B — Add a "(N active)" badge but keep collapsed
- **What:** Show a count badge on the collapsed toggle.
- **Pros:**
  - Discoverable without auto-expanding.
  - Less layout shift.
- **Cons:**
  - Still requires a click to inspect.
  - More UI work than Option A.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\components\filters\FilterBar.tsx`
- **Components/modules:** FilterBar (used by Browse, Search)
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] When URL contains active advanced filters, the panel renders open on first paint.
- [ ] Without active advanced filters, panel remains closed by default.
- [ ] `npm test` (filters tests) passes.
- [ ] Manual check: shared URL with carbs<=30 + vegetarian=true loads with panel open.

## Work Log
- **2026-05-28** Option A. Replaced `useState(false)` with a lazy initializer that returns `true` when any advanced filter is already active on mount (`maxCarbs`, `category`, `hideFried`, `hideAlcohol`, `allergenFree.length > 0`, `sort !== 'name'`). Now a shared/restored URL with advanced filters opens the panel automatically so the user can see what's been applied.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: none
