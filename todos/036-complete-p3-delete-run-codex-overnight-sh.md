---
status: complete
priority: p3
issue_id: 036
tags: [code-review, simplicity]
dependencies: [035]
---

# Delete scripts/run-codex-overnight.sh

## Problem Statement
`scripts/run-codex-overnight.sh` is a wrapper that invokes `estimate-nutrition-codex.ts`. Since the codex variant is slated for deletion (P3-07 / issue 035), this shell script becomes a dead reference. Removing both together keeps the cleanup atomic.

## Findings
- **Source agent:** code-simplicity-reviewer
- **Evidence:** `scripts/run-codex-overnight.sh` — calls `estimate-nutrition-codex.ts` (orphan).
- **Severity rationale:** P3 — single-line dependent dead script.

## Proposed Solutions

### Option A — Delete with codex variant (recommended)
- **What:** `git rm scripts/run-codex-overnight.sh` as part of the same commit (or immediately after) as issue 035.
- **Pros:**
  - Removes broken reference.
  - Keeps cleanup atomic.
  - One less shell file on Windows (cross-platform burden).
- **Cons:**
  - History only; cannot rerun overnight job without recreating it.
  - Loses any nightly cron documentation embedded in the script.
- **Effort:** Small
- **Risk:** Low

### Option B — Keep, repoint at active script
- **What:** Rewrite the shell wrapper to call `scripts/sync/estimate-nutrition.ts`.
- **Pros:**
  - Preserves "overnight" entry point.
  - Cron continuity if anyone uses it.
- **Cons:**
  - Speculative: nobody uses this on a schedule today.
  - Shell scripts add Windows portability cost.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\scripts\run-codex-overnight.sh`
- **Components/modules:** None (orphan)
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `git log -- scripts/run-codex-overnight.sh` confirms no recent meaningful history.
- [ ] File deleted; no other shell/docs reference it.
- [ ] Commit links to issue 035 cleanup.

## Work Log
- **2026-05-28** Auto-resolved by P1-007. `scripts/run-codex-overnight.sh` was deleted alongside its sole consumer `estimate-nutrition-codex.ts` in the P1 batch.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 035
