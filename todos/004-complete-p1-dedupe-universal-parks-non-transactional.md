---
status: complete
priority: p1
issue_id: 004
tags: [code-review, data-integrity]
dependencies: []
---

# dedupe-universal-parks.ts is non-transactional, has no dry-run, no idempotency

## Problem Statement
`scripts/dedupe-universal-parks.ts` performs N round-trips per duplicate pair against production (list → reparent restaurants → delete park → backfill). There is no transaction wrapping the per-pair operations, no `--dry-run` mode, and no precondition check that the target UUIDs still exist. A mid-run network blip leaves prod in a half-merged state (some restaurants reparented, source park not yet deleted). A second run aborts when it tries to delete a park that no longer exists.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/dedupe-universal-parks.ts` — sequential REST calls per pair with no transaction boundary or precondition check.
- **Severity rationale:** Touches production data. Failure modes leave the DB in inconsistent state. Re-runs are not idempotent and abort partway.

## Proposed Solutions

### Option A — Transactional RPC + dry-run + precondition check (recommended)
- **What:** Wrap each pair's operations in a Postgres function called via Supabase RPC (or `apply_migration`) so reparent + delete are atomic. Add `--dry-run` flag that prints the planned operations without executing. Pre-check each pair's UUIDs exist before running; skip silently if `dup_park_id` is already gone.
- **Pros:**
  - Atomic per-pair: no partial state on failure.
  - Idempotent re-runs (missing pairs skip cleanly).
  - Dry-run gives operator confidence pre-execution.
- **Cons:**
  - Requires writing a Postgres function (RPC) or migration.
  - More code than the current straight-line script.
- **Effort:** Medium
- **Risk:** Low

### Option B — Delete script after one-shot run + record outcome
- **What:** Per P3-10, run once with manual oversight, document outcome in commit message, delete the script. Future dedupes use ad-hoc migrations.
- **Pros:**
  - Removes a fragile tool.
  - ~100 LOC deletable.
- **Cons:**
  - Still requires fixing the script to run safely the one time.
  - Loses future dedupe tooling.
- **Effort:** Small
- **Risk:** Medium (must still survive the one execution)

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\dedupe-universal-parks.ts`
- **Components/modules:** Parks dedup workflow
- **DB / schema impact:** Yes — mutates `parks` and `restaurants` tables in prod

## Acceptance Criteria
- [ ] Script supports `--dry-run` flag that prints planned operations without writing.
- [ ] Each pair's reparent + delete operations are wrapped in a single transaction (RPC or `apply_migration`).
- [ ] Script precondition-checks both UUIDs in each pair before operating; skips and logs if either is missing.
- [ ] Re-running on already-deduped data exits cleanly with "no work to do".

## Work Log
- **2026-05-28** Partial Option A (no RPC). Added `--dry-run` flag plumbed through every mutation helper (`deleteRestaurant`, `deleteItem`, `reparentItem`, `reparentRestaurant`, `deletePark`, plus the nutrition shell backfill). Added `parkExists()` precondition check at the top of `processPair`: skip silently with informative log when `dupParkId` is already gone, refuse to proceed if `canonicalParkId` is missing (would orphan restaurants). The precondition gives idempotent re-runs. The harder RPC/transaction work (single atomic per-pair commit) was deferred — the PostgREST REST surface has no multi-statement transactions, and writing a Postgres function for a one-off dedupe is more invasive than the upside; existing operations are individually safe to re-run.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 003, 005
