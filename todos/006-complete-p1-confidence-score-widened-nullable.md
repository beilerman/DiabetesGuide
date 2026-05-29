---
status: complete
priority: p1
issue_id: 006
tags: [code-review, typescript, data-integrity]
dependencies: []
---

# confidence_score widened to number | null is a silent breaking change

## Problem Statement
`src/lib/types.ts:56` widened `confidence_score` from `number` to `number | null`. Existing comparisons like `nd.confidence_score >= 80` now evaluate `null >= 80 → false` (accidentally correct in most places), but `nd.confidence_score + 0` evaluates to `0` and `Math.round(null)` evaluates to `0`. This silently corrupts rollups in audit scripts (averaging in zeros instead of skipping nulls). TypeScript does not flag the change at the call sites because the inferred result type is still `number`.

## Findings
- **Source agent:** kieran-typescript-reviewer
- **Evidence:** `src/lib/types.ts:56` — `confidence_score: number | null`. Required call-site audits: `src/components/menu/MenuItemCard.tsx:312` (already guarded), `scripts/audit/*`, `src/lib/confidence.ts`.
- **Severity rationale:** Silent data corruption in audit rollups. No runtime error, no TS error — only manifests as wrong averages and bad audit reports.

## Proposed Solutions

### Option A — Audit all reads + add null guards at boundary (recommended)
- **What:** Grep every read of `confidence_score` across `src/` and `scripts/`. Add `!= null` guards before arithmetic, or default to `0` only at the point of arithmetic with a comment explaining intent. Add a unit test for the audit rollup function that asserts nulls are skipped, not zeroed.
- **Pros:**
  - Preserves the meaningful distinction between "unknown confidence" and "zero confidence."
  - Catches all consumers in one pass.
  - Test prevents regression.
- **Cons:**
  - Touches many files (audit scripts + components).
  - Requires careful per-site judgement (skip vs default).
- **Effort:** Medium
- **Risk:** Low

### Option B — Revert the widening
- **What:** Change `confidence_score` back to `number` and ensure all DB rows have a non-null value (set a default of 0 or 50 for legacy rows). Keeps the type narrow.
- **Pros:**
  - No call-site changes needed.
  - Simpler type model.
- **Cons:**
  - Loses the ability to represent "unknown confidence."
  - Requires a DB migration to backfill nulls.
  - May misrepresent rows that genuinely lack confidence data.
- **Effort:** Medium
- **Risk:** Medium

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\src\lib\types.ts`, `src\components\menu\MenuItemCard.tsx`, `src\lib\confidence.ts`, `scripts\audit\*.ts`
- **Components/modules:** Confidence scoring, audit rollups
- **DB / schema impact:** Possibly — depends on whether nulls actually exist in `nutritional_data.confidence_score`

## Acceptance Criteria
- [ ] All reads of `confidence_score` audited; each arithmetic or comparison either uses `!= null` guard or has a comment justifying the coercion.
- [ ] Audit-rollup test added that confirms null values are skipped (not averaged as zero).
- [ ] `npm run typecheck` passes.
- [ ] Production audit reports run pre- and post-fix produce expected (not zero-skewed) averages.

## Work Log
- **2026-05-28** Audited every `confidence_score` read in `src/` and `scripts/`. Found one **real bug** at `scripts/audit/external.ts:134`: `parkRows.reduce((sum, r) => sum + (r.confidence_score ?? 0), 0) / parkRows.length` averages with `?? 0`, which silently zero-counts any future null leak and would drag park-confidence averages down. Added `averageIgnoringNulls()` helper to `scripts/audit/utils.ts` that drops nulls from both numerator and denominator and returns `null` when nothing is defined. Replaced the buggy reduce. Added `scripts/audit/__tests__/utils.test.ts` with 6 tests covering the null-skipping invariant. All other sites I checked — `NutritionConfidence.tsx`, `MenuItemCard.tsx`, `comprehensive.ts`, `completeness.ts` — already gate on `!= null` correctly. `accuracy.ts:25` uses `?? 0` intentionally to downgrade empty-shell rows into the low-confidence bucket (comment retained).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: (none)
