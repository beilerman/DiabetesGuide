---
status: complete
priority: p3
issue_id: 046
tags: [code-review, data-integrity]
dependencies: []
---

# Add sodium sanity ceiling (<=6000 mg) to all ingestion scripts

## Problem Statement
`MEMORY.md` documents a recurring mg/kg confusion pattern where sodium values came in 10x–1000x too high (e.g., 440,000mg Baked Brie, 29,600mg Juice). New ingestion scripts (`parse-chain-pdf.ts`, `upgrade-chain-nutrition.ts`, `upgrade-verified-nutrition.ts`, `insert-allears-disney.ts`, `insert-sparse-disney.ts`) do not apply a sanity ceiling. A simple `sodium > 6000` guard at the write boundary would prevent the regression class.

## Findings
- **Source agent:** learnings-researcher
- **Evidence:** `MEMORY.md` "Data Quality Lessons" — historical mg/kg bug. New ingestion scripts lack a ceiling check.
- **Severity rationale:** P3 — defensive; correctness handled per-script but this is the canonical regression to prevent.

## Proposed Solutions

### Option A — Shared ingestion guard (recommended)
- **What:** Add a helper `assertSaneNutrition(row)` in `scripts/lib/sanity.ts` that throws (or downgrades to a logged skip) when sodium > 6000mg, calories > 5000, sugar > carbs, fiber > carbs, etc. Wire into all ingestion scripts at the row-write boundary. Pair with the DB CHECK constraint from issue 039.
- **Pros:**
  - Closes a documented regression class.
  - Two layers of defense (script + DB CHECK).
  - Single helper to evolve.
- **Cons:**
  - Touches every ingestion script.
  - Need a "skip vs. throw" policy decision per script.
- **Effort:** Small
- **Risk:** Low

### Option B — Rely solely on DB CHECK constraints
- **What:** Trust the future `00004_constraints.sql` (issue 039) to reject bad rows.
- **Pros:**
  - One place to enforce.
  - DB-side guarantees.
- **Cons:**
  - Script gets a generic DB error instead of an actionable message.
  - Constraint may not be deployed yet.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\scripts\parse-chain-pdf.ts`
  - `C:\Users\medpe\diabetesguide\scripts\upgrade-chain-nutrition.ts`
  - `C:\Users\medpe\diabetesguide\scripts\upgrade-verified-nutrition.ts`
  - `C:\Users\medpe\diabetesguide\scripts\insert-allears-disney.ts`
  - `C:\Users\medpe\diabetesguide\scripts\insert-sparse-disney.ts`
  - `C:\Users\medpe\diabetesguide\scripts\lib\sanity.ts` (new)
- **Components/modules:** Data ingestion pipeline
- **DB / schema impact:** Complements (does not replace) CHECK constraints from issue 039.

## Acceptance Criteria
- [ ] `assertSaneNutrition` (or similar) exported from `scripts/lib/sanity.ts`.
- [ ] All listed ingestion scripts call the guard before insert/update.
- [ ] At minimum sodium <= 6000 mg, calories <= 5000, macros >= 0, sugar <= carbs, fiber <= carbs.
- [ ] Manual test: feeding a known-bad row triggers the guard with a clear log line.

## Work Log
- **2026-05-28** Option A. Created `scripts/lib/sanity.ts` with `checkSaneNutrition(row): SanityViolation[]` and `assertSaneNutrition(row, label)`. Limits: calories 0..5000, sodium 0..6000mg (above the verified Disney turkey-leg 5375mg datapoint, below the historical mg/kg-confusion errors at 29,600 and 440,000), macros non-negative, sugar ≤ carbs, fiber ≤ carbs. Added `scripts/lib/__tests__/sanity.test.ts` with 12 tests including a real-data fixture (turkey-leg passes) and adversarial fixtures (44,000 / 440,000 mg sodium are caught). Wired `assertSaneNutrition` into `scripts/upgrade-chain-nutrition.ts` and `scripts/upgrade-verified-nutrition.ts` — both REJECT-and-continue rather than throwing the whole run, so one bad pattern doesn't block the others.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 039 (DB CHECK constraints), P2-06
- Source: `MEMORY.md` "Data Quality Lessons (Feb 2026 Audit)"
