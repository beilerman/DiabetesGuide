---
status: pending
priority: p3
issue_id: 038
tags: [code-review, simplicity]
dependencies: []
---

# Delete one-shot data migration scripts after they run

## Problem Statement
Four scripts are one-time data migrations whose outputs already live in Supabase: `insert-allears-disney.ts`, `insert-sparse-disney.ts`, `dedupe-universal-parks.ts`, `verify-post-migration.ts`. Once each has executed successfully against prod, the script is dead weight; the git log is the artifact. Several also carry open P1/P2 findings (P1-03, P1-04, P2-09, P2-10).

## Findings
- **Source agent:** code-simplicity-reviewer
- **Evidence:** `scripts/insert-allears-disney.ts`, `scripts/insert-sparse-disney.ts`, `scripts/dedupe-universal-parks.ts`, `scripts/audit/verify-post-migration.ts`.
- **Severity rationale:** P3 — cleanup contingent on successful run; not blocking.

## Proposed Solutions

### Option A — Delete after successful run (recommended)
- **What:** For each script, after it has been run against prod and verified (and any P1/P2 fixes applied), `git rm` the file. Note the prod run date in the commit message.
- **Pros:**
  - Removes "did this already run?" ambiguity.
  - Closes P1-03 / P1-04 / P2-09 / P2-10 surface area.
  - Git history retains the script and the commit that ran it.
- **Cons:**
  - Cannot rerun without git checkout.
  - Need to confirm each script's prod state before deletion.
- **Effort:** Small (per script)
- **Risk:** Low (after prod verification)

### Option B — Keep as "documentation"
- **What:** Leave all four in place forever.
- **Pros:**
  - Visible record of past migrations.
  - Re-runnable if data drift occurs.
- **Cons:**
  - Open findings stay open.
  - Confusion about whether to re-run.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\scripts\insert-allears-disney.ts`
  - `C:\Users\medpe\diabetesguide\scripts\insert-sparse-disney.ts`
  - `C:\Users\medpe\diabetesguide\scripts\dedupe-universal-parks.ts`
  - `C:\Users\medpe\diabetesguide\scripts\audit\verify-post-migration.ts`
- **Components/modules:** Audit + data ingestion
- **DB / schema impact:** Indirect — verify prod state matches expected before delete.

## Acceptance Criteria
- [ ] Each script's prod execution confirmed (date noted in deletion commit).
- [ ] `git log -- <path>` reviewed.
- [ ] Files removed; package.json scripts updated if referenced.
- [ ] Any related P1/P2 (e.g., P1-03, P1-04) closed or de-scoped.

## Work Log
- **2026-05-28** Deferred. Three of the four listed scripts (`insert-allears-disney.ts`, `insert-sparse-disney.ts`, `dedupe-universal-parks.ts`) have meaningful logic that was just hardened under P1-004 / P2-013 / P2-019, so deletion now would lose the in-progress safety improvements. `verify-post-migration.ts` was repaired under P1-003 and is now usable rather than misleading — keep it for the next migration. Reasonable to revisit after the next prod migration confirms each script is once-and-done.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: P1-03, P1-04, P2-09, P2-10
