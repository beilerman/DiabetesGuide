---
status: complete
priority: p2
issue_id: 016
tags: [code-review, data-integrity, migrations]
dependencies: []
---

# migrate-constraints CHECK constraints never validated against live data

## Problem Statement
`scripts/audit/migrate-constraints.ts` proposes five CHECK constraints (`chk_fiber_lte_carbs`, `chk_sugar_lte_carbs`, `chk_calories_range`, `chk_sodium_range`, `chk_macros_non_negative`) but has never been validated against the live 17,333-row `nutritional_data` table. A naive `ALTER TABLE ... ADD CONSTRAINT` does a full-table scan under `ACCESS EXCLUSIVE` lock and will hard-fail mid-migration if any row violates a rule, leaving the schema half-applied.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/audit/migrate-constraints.ts` — emits `ALTER TABLE ... ADD CONSTRAINT` SQL without a `NOT VALID` step or pre-check query.
- **Severity rationale:** P2 because the script is not auto-applied; risk only materializes when a human runs it against prod.

## Proposed Solutions

### Option A — NOT VALID then VALIDATE (recommended)
- **What:** Emit `ADD CONSTRAINT ... NOT VALID` first, then a separate `VALIDATE CONSTRAINT` step that can be retried. Precede with the pre-check query from the Go/No-Go checklist.
- **Pros:** No long ACCESS EXCLUSIVE lock during the initial add.
- **Pros:** Validation step can run online and is restartable.
- **Cons:** Two-step migration; needs runbook update.
- **Cons:** Constraint isn't enforced for pre-existing rows until VALIDATE completes.
- **Effort:** Small
- **Risk:** Low

### Option B — Run pre-check, fix data, then add constraints normally
- **What:** Execute the violation-count query before applying; if non-zero, fix data first with targeted scripts. Then apply constraints in one shot.
- **Pros:** Constraints are fully enforced immediately after the migration.
- **Pros:** Forces data quality fixes before locking the schema.
- **Cons:** Longer human loop; not safe for unattended runs.
- **Cons:** Full-table scan still happens under ACCESS EXCLUSIVE.
- **Effort:** Medium
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\audit\migrate-constraints.ts`, future `supabase/migrations/00004_constraints.sql`
- **Components/modules:** schema constraint migration
- **DB / schema impact:** Yes — adds CHECK constraints on `nutritional_data`

## Acceptance Criteria
- [ ] Pre-check SQL from Go/No-Go step 8 runs cleanly and returns 0 before constraints applied
- [ ] Constraints applied with `NOT VALID` then `VALIDATE CONSTRAINT`
- [ ] Runbook entry documents the two-step process
- [ ] Manual rollback step documented

## Work Log
- **2026-05-28** Option A. Rewrote the CHECK constraints section of `scripts/audit/migrate-constraints.ts` SQL into three explicit steps: (1) a single-query violation count for each rule (operator stops here if any count > 0), (2) `ADD CONSTRAINT ... NOT VALID` for catalog-only adds without table scan, (3) `ALTER TABLE ... VALIDATE CONSTRAINT` per rule under `SHARE UPDATE EXCLUSIVE` instead of `ACCESS EXCLUSIVE`. Inline comment documents lock semantics and rollback. Companion runbook policy added at `supabase/migrations/README.md` (also covers P2-027 CONCURRENTLY guidance).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 017
