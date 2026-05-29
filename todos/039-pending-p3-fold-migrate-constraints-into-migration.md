---
status: pending
priority: p3
issue_id: 039
tags: [code-review, simplicity, data-integrity]
dependencies: []
---

# Fold migrate-constraints.ts into a real migration

## Problem Statement
`scripts/audit/migrate-constraints.ts` is 307 LOC that mostly `console.log`s SQL for CHECK constraints (`chk_fiber_lte_carbs`, etc.) instead of applying them via the migrations pipeline. This bypasses Supabase migration discipline and leaves applied state ambiguous. Folding the SQL into `supabase/migrations/00004_constraints.sql` makes it auditable and idempotent.

## Findings
- **Source agent:** code-simplicity-reviewer
- **Evidence:** `scripts/audit/migrate-constraints.ts` (~307 LOC) — emits SQL but does not apply consistently via `apply_migration`.
- **Severity rationale:** P3 — process/hygiene; correctness handled by P2-06 (NOT VALID / VALIDATE pattern).

## Proposed Solutions

### Option A — Create 00004_constraints.sql (recommended)
- **What:** Convert the script's SQL into a real migration. Use `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` as recommended by P2-06. Delete the script once the migration applies cleanly.
- **Pros:**
  - Single source of truth in `supabase/migrations/`.
  - Replays on fresh DBs.
  - Resolves P2-06 ergonomic concerns.
- **Cons:**
  - Requires pre-check that all existing rows pass constraints (Go/No-Go item 8).
  - Locks during ADD CONSTRAINT phase (mitigated by NOT VALID).
- **Effort:** Medium
- **Risk:** Medium (data validation step required first)

### Option B — Keep as script
- **What:** Leave `migrate-constraints.ts` and run as needed.
- **Pros:**
  - No DDL coordination.
  - Familiar workflow.
- **Cons:**
  - Migration state diverges from `supabase/migrations/` directory.
  - 307 LOC of mostly-printed SQL.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\scripts\audit\migrate-constraints.ts`
  - `C:\Users\medpe\diabetesguide\supabase\migrations\00004_constraints.sql` (new)
- **Components/modules:** Audit, Supabase migrations
- **DB / schema impact:** Adds CHECK constraints on `nutritional_data`.

## Acceptance Criteria
- [ ] Pre-check query from Go/No-Go item 8 returns 0.
- [ ] `00004_constraints.sql` written with `NOT VALID` + `VALIDATE CONSTRAINT`.
- [ ] Migration applied successfully in dev branch first.
- [ ] `migrate-constraints.ts` deleted.

## Work Log
- **2026-05-28** Deferred. P2-016 has already converted the SQL in `migrate-constraints.ts` to the recommended `NOT VALID` + `VALIDATE CONSTRAINT` pattern, so the ergonomic concern (lock-time) is addressed in-place. Folding the SQL into `supabase/migrations/00004_constraints.sql` is still the right end-state, but requires a Go/No-Go gate (run the pre-check violations query → ensure 0 → apply migration → verify) that's safer done as its own focused change. Recommended next step: run the pre-check on prod, fix any violations using `audit:autofix`, then create the migration and delete the script.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: P2-06, P2-07
