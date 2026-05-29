---
status: complete
priority: p3
issue_id: 029
tags: [code-review, agent-native]
dependencies: []
---

# Extract findBetterChoices() to src/lib/recommendations.ts

## Problem Statement
The `findBetterChoices()` recommendation logic currently lives inside `BetterChoices.tsx`, coupling pure data math to a React component. Extracting it to a pure module makes it reusable by scripts/agents, easier to test in isolation, and consistent with `src/lib/insulin.ts` and `src/lib/confidence.ts` (the project's agent-native gold standard).

## Findings
- **Source agent:** agent-native-reviewer
- **Evidence:** `src/components/menu/BetterChoices.tsx` — recommendation algorithm embedded in component
- **Severity rationale:** P3 — hygiene/architecture, no correctness risk; existing UI continues to work.

## Proposed Solutions

### Option A — Extract pure function (recommended)
- **What:** Create `src/lib/recommendations.ts` exporting `findBetterChoices(items, target, opts)` as a pure function. Component imports it and renders only.
- **Pros:**
  - Matches `insulin.ts`/`confidence.ts` pattern (the "what's working" examples in the review).
  - Enables a co-located vitest file (`src/lib/__tests__/recommendations.test.ts`).
  - Scripts and future agents can call it directly without React.
- **Cons:**
  - Touches a working component (small refactor risk).
  - Adds one file/import indirection.
- **Effort:** Small
- **Risk:** Low

### Option B — Leave in component
- **What:** Keep logic embedded in `BetterChoices.tsx`.
- **Pros:**
  - Zero churn.
  - No new files.
- **Cons:**
  - Can't unit-test without rendering React.
  - Inaccessible to scripts/agents.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\components\menu\BetterChoices.tsx`
  - `C:\Users\medpe\diabetesguide\src\lib\recommendations.ts` (new)
  - `C:\Users\medpe\diabetesguide\src\lib\__tests__\recommendations.test.ts` (new)
- **Components/modules:** BetterChoices, recommendations lib
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `findBetterChoices` exported from `src/lib/recommendations.ts` as a pure function.
- [ ] `BetterChoices.tsx` imports the lib and contains no recommendation math.
- [ ] At least 3 vitest cases (happy path, tie-break, empty input).
- [ ] `npm run build` and `npm test` pass.

## Work Log
- **2026-05-28** Option A. Created `src/lib/recommendations.ts` exporting `findBetterChoices(currentItem, siblings, opts)` plus a `scoreMenuItem` helper. `BetterChoices.tsx` now imports and renders only — no math left. Added `src/lib/__tests__/recommendations.test.ts` (5 tests: top-N selection, current-item exclusion, no-better empty case, missing nutrition data, custom limit). All pass.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 030, 031, 032, 033, 034
