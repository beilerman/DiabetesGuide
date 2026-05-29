---
status: complete
priority: p3
issue_id: 035
tags: [code-review, simplicity]
dependencies: []
---

# Delete orphan estimate-nutrition variants (~2,278 LOC)

## Problem Statement
Seven `estimate-nutrition-*.ts` variants accumulated in `scripts/` while the active script is `scripts/sync/estimate-nutrition.ts`. They are dead code, confuse contributors, and one of them (`-codex.ts`) has live P1/P2 findings against it. Deleting all seven removes ~2,278 LOC and a maintenance burden.

## Findings
- **Source agent:** code-simplicity-reviewer
- **Evidence:** `scripts/estimate-nutrition-codex.ts`, `-final.ts`, `-gemini.ts`, `-keywords.ts`, `-keywords-v2.ts`, `-smart.ts`, `-ai-nameonly.ts` — all orphaned; `scripts/sync/estimate-nutrition.ts` is the active path.
- **Severity rationale:** P3 — dead-code hygiene; no runtime user.

## Proposed Solutions

### Option A — Delete all 7 variants (recommended)
- **What:** `git rm` all seven files. Verify with `git log -- <path>` that history is preserved. Update CLAUDE.md script table if any of these are referenced.
- **Pros:**
  - Removes ~2,278 LOC.
  - Eliminates P1-07 / P1-08 / P2-11 / P2-16 surface area (codex + ai-nameonly).
  - Single source of truth for estimation (`scripts/sync/estimate-nutrition.ts`).
- **Cons:**
  - Loses local experiments (still in git history).
  - Need to scan for stale references in shell scripts / docs.
- **Effort:** Small
- **Risk:** Low

### Option B — Keep variants
- **What:** Leave them in place.
- **Pros:**
  - Zero churn.
  - Variants available as quick references.
- **Cons:**
  - Confusing for new contributors.
  - Open P1/P2 findings remain "open" until variants are deleted or fixed.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:**
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-codex.ts`
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-final.ts`
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-gemini.ts`
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-keywords.ts`
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-keywords-v2.ts`
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-smart.ts`
  - `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-ai-nameonly.ts`
- **Components/modules:** Sync pipeline (unchanged)
- **DB / schema impact:** None

## Acceptance Criteria
- [ ] `git log -- <path>` reviewed for each file before deletion (no uncommitted unique logic worth saving).
- [ ] All 7 files removed in one commit.
- [ ] `npm run sync:estimate` and `npm run sync:full` still work.
- [ ] CLAUDE.md / package.json scripts updated if any reference removed files.

## Work Log
- **2026-05-28** Scope-reduced Option A. 5 of 7 orphan variants now deleted: `estimate-nutrition-codex.ts` and `-ai-nameonly.ts` were dropped under P1-007/008; `-final.ts`, `-gemini.ts`, `-keywords-v2.ts`, `-smart.ts` removed in this batch. Kept `scripts/estimate-nutrition-keywords.ts` — it's documented in `CLAUDE.md` and `AGENTS.md` as the active no-AI fallback for chips/fries/ice-cream items and has no overlapping bug. Active LLM script remains `scripts/estimate-nutrition-ai.ts` (P2-023 sanitizer applied).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 036 (run-codex-overnight.sh), P1-07, P1-08, P2-11, P2-16
