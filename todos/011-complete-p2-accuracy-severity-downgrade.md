---
status: complete
priority: p2
issue_id: 011
tags: [code-review, data-integrity, audit]
dependencies: []
---

# Accuracy audit unconditionally downgrades MEDIUM to LOW severity

## Problem Statement
`scripts/audit/accuracy.ts:226` collapses MEDIUM-severity accuracy findings to LOW for every nutrition source, hiding real problems on `source: 'official'` rows that should remain MEDIUM. The accompanying test at `scripts/audit/__tests__/accuracy.test.ts:67` now locks the regression in, so the daily audit understates the risk profile of official-source data.

## Findings
- **Source agent:** kieran-typescript-reviewer
- **Evidence:** `scripts/audit/accuracy.ts:226` — severity reassigned to `LOW` regardless of source; test at `scripts/audit/__tests__/accuracy.test.ts:67` asserts the downgrade for `source: 'official'`.
- **Severity rationale:** P2, not P1, because audit reports are advisory; no data is corrupted, but the daily report mis-prioritises real issues.

## Proposed Solutions

### Option A — Branch on source (recommended)
- **What:** Keep MEDIUM severity when `source === 'official'`; downgrade only for `crowdsourced` / `api_lookup`.
- **Pros:** Restores prior signal quality; trivial change; aligns with how official data is treated elsewhere.
- **Pros:** Test update is one line, easy to review.
- **Cons:** Reintroduces a small branch in scoring logic.
- **Cons:** Requires updating the accuracy.test.ts expectation.
- **Effort:** Small
- **Risk:** Low

### Option B — Always keep MEDIUM
- **What:** Remove the downgrade entirely; let MEDIUM stand for all sources.
- **Pros:** Simplest code path.
- **Pros:** No source-conditional logic to maintain.
- **Cons:** Inflates LOW->MEDIUM count for noisy crowdsourced/api_lookup rows.
- **Cons:** May spike daily-audit MEDIUM counts and trigger graduation regressions.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\audit\accuracy.ts`, `C:\Users\medpe\diabetesguide\scripts\audit\__tests__\accuracy.test.ts`
- **Components/modules:** audit accuracy scorer
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] `accuracy.ts` keeps MEDIUM severity for rows with `source === 'official'`
- [ ] Existing test updated to assert MEDIUM is preserved for official source
- [ ] New test asserts LOW for `crowdsourced`/`api_lookup` so downgrade still applies there
- [ ] Daily audit run shows expected delta in MEDIUM count vs prior run

## Work Log
- **2026-05-28** Option A. Replaced the unconditional `severity = 'LOW'` at `scripts/audit/accuracy.ts` medium-band with `severity = n.source === 'official' ? 'MEDIUM' : 'LOW'`. Updated `scripts/audit/__tests__/accuracy.test.ts` line 67 to expect MEDIUM for `source: 'official'`. Added a complementary test confirming LOW is preserved for `source: 'api_lookup'` at confidence 70 (calories 600, deviation 42.9%, in medium band but under the HIGH 50% floor). 8/8 accuracy tests pass.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 028
