---
status: complete
priority: p3
issue_id: 034
tags: [code-review, agent-native]
dependencies: []
---

# Extract recent-search primitives to src/lib/recent-searches.ts

## Problem Statement
Recent-search history (add/dedupe/trim/clear) is implemented inline in `Search.tsx`. Lifting it into a pure module makes it testable, lets scripts share the same dedup/normalization rules, and removes view-layer concerns from `Search.tsx`.

## Findings
- **Source agent:** agent-native-reviewer
- **Evidence:** `src/pages/Search.tsx` — recent-search reducer inlined in component
- **Severity rationale:** P3 — hygiene/parity; no correctness risk.

## Proposed Solutions

### Option A — Extract pure module (recommended)
- **What:** Create `src/lib/recent-searches.ts` exporting `RECENT_SEARCHES_STORAGE_KEY`, `addRecentSearch(list, query, {maxLen})`, `clearRecentSearches()`, plus normalization helper.
- **Pros:**
  - Testable in isolation (case-folding, dedupe, max length).
  - Consistent storage key constant pattern with favorites.
  - Search.tsx becomes presentational.
- **Cons:**
  - Small refactor.
  - New module + test.
- **Effort:** Small
- **Risk:** Low

### Option B — Leave in Search.tsx
- **What:** Keep recent-search logic embedded.
- **Pros:**
  - Zero churn.
  - Co-located with single consumer.
- **Cons:**
  - Untestable in isolation.
  - Cannot reuse from scripts/agents.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\pages\Search.tsx`
  - `C:\Users\medpe\diabetesguide\src\lib\recent-searches.ts` (new)
  - `C:\Users\medpe\diabetesguide\src\lib\__tests__\recent-searches.test.ts` (new)
- **Components/modules:** Search page
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] Pure functions + storage key exported from `src/lib/recent-searches.ts`.
- [ ] `Search.tsx` uses the lib, no local reducer.
- [ ] Vitest covers normalize/dedupe/maxLen/clear.
- [ ] Build + tests pass.

## Work Log
- **2026-05-28** Option A. Created `src/lib/recent-searches.ts` exporting `RECENT_SEARCHES_STORAGE_KEY`, `DEFAULT_MAX_RECENT_SEARCHES`, `normalizeQuery`, `addRecentSearch(list, query, {maxLen})`, `clearRecentSearches()`. `Search.tsx` now uses the lib and the inline reducer is gone. The casing the user typed is preserved in the visible list (only dedupe is case-insensitive), matching prior behaviour. Added 9 tests covering all branches.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 029, 030, 031, 032, 033
