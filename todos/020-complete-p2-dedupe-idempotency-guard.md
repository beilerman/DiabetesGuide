---
status: complete
priority: p2
issue_id: 020
tags: [code-review, data-integrity, scripts]
dependencies: []
---

# dedupe-universal-parks lacks idempotency guard on re-runs

## Problem Statement
`scripts/dedupe-universal-parks.ts` logs `console.error` on duplicate-shell insert but continues processing. On a second run after partial completion, pairs whose `dup_park_id` no longer exist cause noisy errors and may attempt reparenting against missing rows. The script needs a precondition check that skips already-merged pairs cleanly.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/dedupe-universal-parks.ts` — `console.error` on duplicate-shell insert; no `SELECT id FROM parks WHERE id = $dup_park_id` precondition.
- **Severity rationale:** P2 — second-run noise, not silent corruption, but blocks confident re-runs.

## Proposed Solutions

### Option A — Precondition-check each pair (recommended)
- **What:** Before processing pair `(keep_id, dup_id)`, query both IDs; if `dup_id` is gone, log "already merged" and `continue`.
- **Pros:** Safe to re-run without spurious errors.
- **Pros:** Single extra round-trip per pair (small N).
- **Cons:** Adds latency for fully-merged batches.
- **Cons:** Need to define exit code semantics for partial vs full runs.
- **Effort:** Small
- **Risk:** Low

### Option B — Combine with P1-04 transaction wrapping
- **What:** Wrap each pair in a transaction (already required by P1-04) and add the precondition check inside the same transaction.
- **Pros:** Solves both atomicity and idempotency in one PR.
- **Pros:** Single mental model for the script.
- **Cons:** Larger blast radius if the script is needed before the transaction work lands.
- **Cons:** Couples two unrelated changes.
- **Effort:** Medium
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\dedupe-universal-parks.ts`
- **Components/modules:** Universal parks dedupe script
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Second run on an already-deduped dataset produces no errors and exits 0
- [ ] Skipped-pair log line is structured (pair ids + reason)
- [ ] `--dry-run` (from P1-04) interacts correctly with skip path

## Work Log
- **2026-05-28** Auto-resolved by P1-004 work. `scripts/dedupe-universal-parks.ts` now precondition-checks both `dupParkId` and `canonicalParkId` via `parkExists()` at the top of `processPair`; missing dup → "already deduped, skipping"; missing canonical → refuses to proceed. Pairs with `--dry-run` flag also added in P1-004. Re-running on already-merged data exits cleanly with structured per-pair log lines.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 019 (P1-04 wraps the same script in a transaction)
