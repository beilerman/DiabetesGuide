---
status: complete
priority: p2
issue_id: 014
tags: [code-review, typescript, audit]
dependencies: []
---

# audit/external runStaleSelect returns unknown[] with silent branch divergence

## Problem Statement
`scripts/audit/external.ts:170-191` defines `runStaleSelect` with return type `unknown[] | null` and reassigns it across legacy and current branches. Because the branches return shape-different rows, downstream consumers paper over the divergence with casts; a column rename in one branch silently breaks reporting without surfacing a TS error.

## Findings
- **Source agent:** kieran-typescript-reviewer
- **Evidence:** `scripts/audit/external.ts:170-191` — function returns `unknown[] | null`; both branches need explicit row types.
- **Severity rationale:** P2 — code compiles; risk is silent divergence on future column renames.

## Proposed Solutions

### Option A — Type both branches explicitly (recommended)
- **What:** Define `LegacyRow` and `CurrentRow` interfaces, narrow `runStaleSelect` return via discriminated union or two functions.
- **Pros:** Compile-time catch for column drift.
- **Pros:** Self-documenting; future contributors see the contract.
- **Cons:** Slightly more code.
- **Cons:** Need to keep types in sync with `select(...)` column strings.
- **Effort:** Small
- **Risk:** Low

### Option B — Delete the legacy branch
- **What:** Drop the legacy selection path entirely; assume current schema.
- **Pros:** Simplest possible code.
- **Pros:** Removes the branch-divergence class.
- **Cons:** Breaks audits run against pre-migration snapshots.
- **Cons:** Loses backwards compatibility we may need during migration window.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\audit\external.ts`
- **Components/modules:** external/stale-select audit
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] `runStaleSelect` no longer returns `unknown[]`; branches have explicit row types
- [ ] `npx tsc --noEmit` passes
- [ ] Audit script run produces identical output before/after change

## Work Log
- **2026-05-28** Option A. Introduced `CurrentSelectRow` and `LegacySelectRow` interfaces matching the two `select(...)` strings. Made `runStaleSelect<T>` generic so each call site specifies the expected row shape. Rewrote `fetchStaleRows` to early-return the typed result instead of reassigning `data`/`error` across branches. `npx tsc -b --noEmit` clean. Audit test still passes (no semantic change).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
