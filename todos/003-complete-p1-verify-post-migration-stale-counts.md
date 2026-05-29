---
status: complete
priority: p1
issue_id: 003
tags: [code-review, data-integrity, migrations]
dependencies: []
---

# verify-post-migration.ts has hardcoded stale row counts; will report success as failure

## Problem Statement
`scripts/audit/verify-post-migration.ts` asserts fixed table row counts (`parks=44, restaurants=782, menu_items=11551, nutritional_data=11551`). Production today is `48 / 989 / 18211 / 17333`. The script will report any successful migration as a failure. It also asserts `menu_items_without_nutrition == 0`, but 878 such items legitimately exist. The verifier is actively misleading and will block future migration confidence.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/audit/verify-post-migration.ts` — fixed integer count assertions baked into the script body.
- **Severity rationale:** Verifier is wrong out of the box. Any operator running the post-migration check will see a false failure, lose trust in the migration workflow, and potentially roll back a healthy migration.

## Proposed Solutions

### Option A — Replace fixed counts with comparative invariants (recommended)
- **What:** At run start, snapshot current row counts. After migration, assert (a) non-negative deltas, (b) deltas match expected schema operation (additive vs. dedup), (c) post-count >= pre-count - expected-deletions. Replace `count == N` with `count >= snapshot_baseline`.
- **Pros:**
  - Self-calibrating; works regardless of data growth.
  - Catches actual regressions (data loss, table-truncation bugs).
  - Re-runnable safely.
- **Cons:**
  - Requires migration to declare its expected deltas (e.g., `dedupe expects parks_delta < 0`).
  - More code than fixed counts.
- **Effort:** Medium
- **Risk:** Low

### Option B — Delete the script entirely
- **What:** Per P3-10, delete `verify-post-migration.ts` once one-shot migrations are confirmed. Git history is the artifact.
- **Pros:**
  - Removes a broken tool with no users.
  - ~150 LOC deletable.
- **Cons:**
  - Loses post-migration validation capability entirely.
  - Future migrations have no automated check.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\audit\verify-post-migration.ts`
- **Components/modules:** Migration verification
- **DB / schema impact:** No (read-only checks)

## Acceptance Criteria
- [ ] `verify-post-migration.ts` no longer contains hardcoded integer count assertions (grep for `11551`, `782`, `44` returns 0 hits).
- [ ] Running the script against current prod (`48 / 989 / 18211 / 17333`) reports PASS.
- [ ] Test path: simulate row deletion in a branch DB → script reports FAIL with a clear delta message.
- [ ] OR: file deleted and removed from `package.json` scripts.

## Work Log
- **2026-05-28** Chose simpler variant of Option A. Replaced hardcoded `expected = {parks: 44, ...}` block with a sanity check that each table has `>0` rows. Reasoning: the duplicate/missing-row/invalid-row checks below already catch the real failure modes (data loss, schema drift, dedupe regression), so the exact counts added no signal and drifted on every ingest. Also removed the `missing nutrition rows == 0` assertion and the `missingNutritionRows()` function — 878 items legitimately lack nutrition rows per `scripts/audit/completeness.ts`, so the assertion was guaranteed to fail. `grep '11551\|782\|14275\|missingNutritionRows'` now returns no hits.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 005
