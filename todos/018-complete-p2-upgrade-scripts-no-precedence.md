---
status: complete
priority: p2
issue_id: 018
tags: [code-review, data-integrity, scripts]
dependencies: []
---

# upgrade-chain / upgrade-verified scripts have no run-order precedence

## Problem Statement
`upgrade-chain-nutrition.ts` (confidence=90) and `upgrade-verified-nutrition.ts` (confidence=95) both overwrite `nutritional_data` without preserving precedence. If `chain` runs after `verified`, it can stomp the more accurate verified data with chain-published-PDF values. The correct order is undocumented anywhere in the repo.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/upgrade-chain-nutrition.ts`, `scripts/upgrade-verified-nutrition.ts` — neither script checks `confidence_score` before overwriting.
- **Severity rationale:** P2 — easy to mis-run, but recoverable by re-running `verified` after `chain`.

## Proposed Solutions

### Option A — Guard overwrites by confidence_score (recommended)
- **What:** Each upgrade script reads current `confidence_score` and only writes when its target score is strictly greater. Documents the precedence in the script header.
- **Pros:** Order-independent; safe to re-run in any sequence.
- **Pros:** Self-documenting via comparison.
- **Cons:** Requires reading the existing row before writing.
- **Cons:** Slightly slower per-row.
- **Effort:** Small
- **Risk:** Low

### Option B — Document run order in runbook only
- **What:** Add a step in `docs/operations/runbook.md` mandating `verified` before `chain`. No code changes.
- **Pros:** Zero code risk.
- **Pros:** Fastest to ship.
- **Cons:** Relies on humans following the runbook.
- **Cons:** No safety net for re-runs after partial failures.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\upgrade-chain-nutrition.ts`, `C:\Users\medpe\diabetesguide\scripts\upgrade-verified-nutrition.ts`, optional `docs/operations/runbook.md`
- **Components/modules:** nutrition upgrade pipeline
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Both upgrade scripts skip writes when current `confidence_score >= target`
- [ ] Run order documented in script headers and runbook
- [ ] Dry-run on a sample row demonstrates the skip path

## Work Log
- **2026-05-28** Option A. Both `scripts/upgrade-chain-nutrition.ts` (target 90) and `scripts/upgrade-verified-nutrition.ts` (target 95) now declare a `TARGET_CONFIDENCE` constant and skip rows whose current `confidence_score >= target`. Pulled `confidence_score` into both SELECTs. The scripts are now commutative — whichever runs first owns the rows it claims, and the other cleanly skips them. Renamed counters from "alreadyOfficial" / "skippedAlreadyOfficial" to confidence-aware variants, and updated their summary logs to reflect the precedence semantics.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 025
