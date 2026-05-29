---
status: complete
priority: p3
issue_id: 033
tags: [code-review, agent-native]
dependencies: []
---

# Favorites pure primitives + exported storage key

## Problem Statement
`useFavorites` defines `addFavorite`/`removeFavorite` inside the hook and hardcodes the localStorage key (`dg_favorites`). Exporting pure primitives and the key constant from `src/lib/favorites.ts` would let scripts inspect/repair favorites and would centralize the storage contract.

## Findings
- **Source agent:** agent-native-reviewer
- **Evidence:** `src/hooks/useFavorites.ts` — reducer + storage key embedded in hook
- **Severity rationale:** P3 — hygiene only; behavior unchanged.

## Proposed Solutions

### Option A — Extract primitives (recommended)
- **What:** Create `src/lib/favorites.ts` exporting `FAVORITES_STORAGE_KEY`, `addFavorite(set, id)`, `removeFavorite(set, id)`, `toggleFavorite(set, id)` as pure functions over `Set<string>`.
- **Pros:**
  - Storage key has a single source of truth.
  - Pure reducers testable without React.
  - Aligns with agent-native pattern.
- **Cons:**
  - One additional module.
  - Minor refactor in hook.
- **Effort:** Small
- **Risk:** Low

### Option B — Leave inline
- **What:** Keep current hook.
- **Pros:**
  - Zero churn.
  - One file.
- **Cons:**
  - Storage key not exported.
  - Reducer entangled with React.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\hooks\useFavorites.ts`
  - `C:\Users\medpe\diabetesguide\src\lib\favorites.ts` (new)
  - `C:\Users\medpe\diabetesguide\src\lib\__tests__\favorites.test.ts` (new)
- **Components/modules:** useFavorites, MenuItemCard, Browse
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `FAVORITES_STORAGE_KEY` and pure primitives exported from `src/lib/favorites.ts`.
- [ ] Hook imports the lib; no duplicated literals.
- [ ] Vitest covers add/remove/toggle/idempotency.
- [ ] Existing favorites UI unchanged.

## Work Log
- **2026-05-28** Option A. Created `src/lib/favorites.ts` exporting `FAVORITES_STORAGE_KEY` (= `'dg_favorites'`), `addFavorite`, `removeFavorite`, `toggleFavorite` — all pure reducers over `ReadonlySet<string>`. `useFavorites` now imports the key constant and delegates `toggle` to `toggleFavorite`. Added `src/lib/__tests__/favorites.test.ts` (7 tests: storage-key canary, add/remove idempotency, toggle bidirectional, reference inequality for React).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 029, 030, 031, 032, 034
