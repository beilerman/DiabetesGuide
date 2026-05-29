---
status: complete
priority: p3
issue_id: 045
tags: [code-review, simplicity]
dependencies: []
---

# Consolidate HIGH/MEDIUM confidence thresholds into one module

## Problem Statement
The confidence-score thresholds (HIGH=80, MEDIUM=50) are duplicated across `src/lib/confidence.ts`, `scripts/audit/comprehensive.ts` (×3), `scripts/sync/estimate-nutrition.ts` (×3), and `final-quality-report.ts`. A future change to either cutoff requires editing 8+ literals, easy to miss. Exporting from `src/lib/confidence.ts` (or a shared `scripts/lib/confidence.ts`) creates one source of truth.

## Findings
- **Source agent:** code-simplicity-reviewer
- **Evidence:** Constants `>= 80` and `>= 50` repeated in: `src/lib/confidence.ts`, `scripts/audit/comprehensive.ts`, `scripts/sync/estimate-nutrition.ts`, `scripts/final-quality-report.ts`.
- **Severity rationale:** P3 — maintainability; correct today but high drift risk.

## Proposed Solutions

### Option A — Export from src/lib/confidence.ts (recommended)
- **What:** Add `export const HIGH_CONFIDENCE = 80; export const MEDIUM_CONFIDENCE = 50;`. Replace literals across the listed files with imports. For scripts that can't import from `src/`, mirror in `scripts/lib/confidence.ts` re-exporting the same constants.
- **Pros:**
  - Single source of truth.
  - Changes propagate automatically.
  - Aligns with the project's "pure lib" pattern.
- **Cons:**
  - Touch 5+ files.
  - Need to confirm scripts can import from `src/` (tsx supports it).
- **Effort:** Small
- **Risk:** Low

### Option B — Add comments only
- **What:** Add a "keep in sync with X" comment to each literal site.
- **Pros:**
  - No structural changes.
  - Improves discoverability slightly.
- **Cons:**
  - Comments rot.
  - Drift still possible.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\src\lib\confidence.ts`
  - `C:\Users\medpe\diabetesguide\scripts\audit\comprehensive.ts`
  - `C:\Users\medpe\diabetesguide\scripts\sync\estimate-nutrition.ts`
  - `C:\Users\medpe\diabetesguide\scripts\final-quality-report.ts`
- **Components/modules:** Confidence scoring across UI + scripts
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `HIGH_CONFIDENCE` and `MEDIUM_CONFIDENCE` exported from one module.
- [ ] All listed sites import the constants; no literal `80` / `50` thresholds remain.
- [ ] `npm test` + `npm run build` pass.
- [ ] `grep -rn '>= 80\|>= 50' src scripts` returns no confidence-threshold matches.

## Work Log
- **2026-05-28** Variant of Option A. Added `HIGH_CONFIDENCE = 80` / `MEDIUM_CONFIDENCE = 50` named exports to `src/lib/confidence.ts` (replacing inline literals in `classifyConfidence`). Mirrored constants in new `scripts/lib/confidence-thresholds.ts` since scripts run via tsx outside the `tsconfig.app` project and can't cleanly import from `src/`. Wired the constants into `scripts/audit/comprehensive.ts` (3 sites), `scripts/sync/estimate-nutrition.ts` (3 sites in log output), and `scripts/final-quality-report.ts` (1 site). `grep -E '>= (80|50)' src scripts` returns no remaining confidence-threshold literals (other matches are unrelated, e.g. atwater percentages).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: P1-06 (confidence_score null-handling)
