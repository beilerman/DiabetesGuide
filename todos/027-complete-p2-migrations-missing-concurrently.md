---
status: complete
priority: p2
issue_id: 027
tags: [code-review, migrations, performance]
dependencies: []
---

# Unique index creation in 00002 / 00003 lacks CONCURRENTLY

## Problem Statement
Migrations `00002` and `00003` create unique indexes without `CREATE UNIQUE INDEX CONCURRENTLY`, taking an `ACCESS EXCLUSIVE` lock on `parks`, `menu_items`, and `nutritional_data` for the duration. At current row counts (≤18k) this is sub-second and survivable, but pattern is wrong for future growth and should be flagged in the runbook.

## Findings
- **Source agent:** schema-drift-detector
- **Evidence:** `supabase/migrations/00002_*.sql`, `supabase/migrations/00003_*.sql` — `CREATE UNIQUE INDEX` without `CONCURRENTLY`.
- **Severity rationale:** P2 — operationally tolerable today; documentation + future-proofing only.

## Proposed Solutions

### Option A — Document in runbook (recommended for now)
- **What:** Add a runbook entry noting that future index migrations on tables >100k rows MUST use `CREATE INDEX CONCURRENTLY`. Leave 00002/00003 as-is since they're already applied.
- **Pros:** Zero risk to applied migrations.
- **Pros:** Future contributors guided away from the footgun.
- **Cons:** No code-level enforcement.
- **Cons:** Easy to forget at migration-authoring time.
- **Effort:** Small
- **Risk:** Low

### Option B — Add a migration-lint script
- **What:** Pre-commit hook that fails when a new migration contains `CREATE INDEX` without `CONCURRENTLY` and the target table exceeds a threshold.
- **Pros:** Enforces the rule automatically.
- **Pros:** Catches the pattern before review.
- **Cons:** Lint script + threshold definition is non-trivial.
- **Cons:** False positives on small tables.
- **Effort:** Medium
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\supabase\migrations\00002_*.sql`, `C:\Users\medpe\diabetesguide\supabase\migrations\00003_*.sql`, future `docs/operations/runbook.md`
- **Components/modules:** Migration policy
- **DB / schema impact:** No (advisory)

## Acceptance Criteria
- [ ] Runbook documents the `CONCURRENTLY` policy with a row-count threshold
- [ ] At least one example of the correct pattern shown in the runbook
- [ ] Migration-author checklist updated

## Work Log
- **2026-05-28** Option A (documentation). Added `supabase/migrations/README.md` documenting the `CREATE INDEX CONCURRENTLY` policy for tables ≥100k rows, the NOT VALID + VALIDATE constraint pattern (overlaps with P2-016), correct vs incorrect SQL examples, and known caveats (`CONCURRENTLY` can't run inside a transaction; failed builds leave an INVALID index that must be dropped). Existing 00001/00002/00003 left as-is — they were applied at sub-100k row counts where the policy doesn't bite.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
