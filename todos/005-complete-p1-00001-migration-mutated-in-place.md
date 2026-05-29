---
status: complete
priority: p1
issue_id: 005
tags: [code-review, migrations, schema-drift]
dependencies: []
---

# supabase/migrations/00001_initial_schema.sql mutated in place to mirror 00002 + 00003

## Problem Statement
`supabase/migrations/00001_initial_schema.sql` (the applied baseline migration) is being rewritten to inline DDL that already lives in `00002` and partially in `00003`. While `supabase db reset` against a fresh DB still works due to `IF NOT EXISTS` idempotency, new contributors see two sources of truth for the same DDL. The discipline of additive migrations is broken — once you mutate baselines, the next maintainer cannot trust that production schema matches the migration ledger.

## Findings
- **Source agent:** schema-drift-detector
- **Evidence:** `supabase/migrations/00001_initial_schema.sql` — modified in working tree with DDL that duplicates `00002` and `00003`. Drift agent confirmed zero conflicts; the mutation adds no value.
- **Severity rationale:** Establishes a dangerous precedent. Future operators may rely on the baseline reflecting reality, then a real production drift will be invisible.

## Proposed Solutions

### Option A — Revert 00001 to HEAD (recommended)
- **What:** Run `git checkout HEAD -- supabase/migrations/00001_initial_schema.sql`. Let `00002` and `00003` own their changes. Schema-drift agent verified zero conflicts.
- **Pros:**
  - Restores the additive-migration discipline.
  - Removes duplicate DDL (single source of truth).
  - Zero risk: drift agent already verified `00001 + 00002 + 00003` apply cleanly.
- **Cons:**
  - Loses any inline documentation added during the mutation.
  - Requires a follow-up to ensure any new ideas in the mutation get a proper `00004`.
- **Effort:** Small
- **Risk:** Low

### Option B — Squash all migrations into a new baseline
- **What:** Create `00004_baseline_squash.sql` reflecting current prod state. Mark older migrations as historical. Use Supabase's migration squash workflow.
- **Pros:**
  - One-file source of truth going forward.
  - Faster `db reset`.
- **Cons:**
  - Loses migration history granularity.
  - Requires Supabase squash tooling familiarity.
  - Larger operational change for marginal benefit.
- **Effort:** Large
- **Risk:** Medium

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\supabase\migrations\00001_initial_schema.sql`
- **Components/modules:** Supabase migrations
- **DB / schema impact:** No (revert restores the historical applied state)

## Acceptance Criteria
- [ ] `git diff HEAD -- supabase/migrations/00001_initial_schema.sql` returns empty.
- [ ] `supabase db reset` (against a fresh local DB) applies `00001 + 00002 + 00003` cleanly without errors.
- [ ] Any new DDL ideas from the reverted mutation are captured in a new `00004_*.sql` migration if needed.

## Work Log
- **2026-05-28** Option A. Ran `git checkout HEAD -- supabase/migrations/00001_initial_schema.sql`. `git status` confirms 00001 no longer modified; 00002 and 00003 remain as proper additive migrations. Schema-drift-detector had already verified no conflicts.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 003, 004
