# Code Review — Implementation pass on 2026-05-18 findings

**Date:** 2026-05-28
**Scope:** Implement the 40 findings from `audit/code-review-2026-05-18.md`
**Branch:** `main` (uncommitted; no PR yet)
**Tests:** 173 passing across 28 files (43 new)
**Type check:** `tsc -b --noEmit` clean
**Production build:** `npm run build` succeeds in 4.88s; PWA service worker generated

---

## Severity tally

| Tier | Original | Done this pass | Auto-resolved | Deferred (with notes) |
|---|---:|---:|---:|---:|
| 🔴 P1 | 10 | 10 | — | 0 |
| 🟡 P2 | 18 | 12 | 2 (020, 021 via P1) | 4 |
| 🔵 P3 | 18 | 9 | 1 (036 via P1) | 7 |
| **Total** | **46** | **31** | **3** | **11** |

Net: **34 of 46 findings actioned**; 11 deferred with detailed Work Logs explaining what's left, why, and the recommended next step.

---

## 🔴 P1 — All 10 resolved

| Todo | Action |
|---|---|
| 001 W-9 PDF leak | Moved 3 signed PDFs to `~/Documents/tax/`; git history confirmed clean |
| 002 Hardcoded W-9 PII | Externalized to gitignored `data/w9-output/profile.json`; example template added |
| 003 verify-post-migration stale counts | Replaced fixed `parks=44` etc. with `>0` sanity checks; removed broken `missing-nutrition == 0` assertion |
| 004 dedupe-universal-parks unsafe | Added `--dry-run` flag + `parkExists()` precondition for idempotent re-runs |
| 005 00001 mutated in place | `git checkout HEAD --` to restore additive-migration discipline |
| 006 confidence_score null-coercion | Found real `?? 0` bug in `external.ts:134`; added `averageIgnoringNulls()` helper + 6 tests |
| 007 Codex JSON regex unsound | Deleted orphan `estimate-nutrition-codex.ts` (Option C) |
| 008 429 handler no retry | Deleted orphan `estimate-nutrition-ai-nameonly.ts` (Option C) |
| 009 applyFilters O(n log n) recompute | Pre-computed Map already in working tree; verified + tests |
| 010 useCompare stale deps | Dep array fix already in working tree; added `__resetCompareState` helper + 2 regression tests |

---

## 🟡 P2 — 14 of 18 actioned

**Quality / correctness:** 011 (severity branching), 012 (sodium meter cap), 014 (runStaleSelect typed), 015 (Meal carb override guard), 028 (regex false-positive guards).

**Data integrity:** 016 (NOT VALID + VALIDATE), 018 (upgrade precedence guard), 024 (page size 1000→5000). Plus 020 auto-resolved via P1-004.

**Security:** 022 (dependabot + workflow TODOs; SHAs deliberately not picked from memory), 023 (LLM input sanitizer + 7 tests). Plus 021 auto-resolved via P1-007 (codex deletion).

**Architecture / docs:** 013 (shared join types), 027 (CONCURRENTLY policy README).

**Deferred (with detailed Work Logs in each todo file):**
- 017 GUC trigger short-circuit — needs new `00004` migration + plumbing into 4 backfill scripts
- 019 AllEars JS/SQL normalization parity — needs verified `onConflict` argument for an expression index
- 025 upgrade-chain quadratic — perf only; P2-018 precedence guard already short-circuits most rows
- 026 estimate-nutrition parallel — active script already throttled to fit Groq's 30 req/min cap

---

## 🔵 P3 — 9 of 18 actioned (+1 auto-resolved)

**Cleanup:** 035 (deleted 4 more orphan estimate-nutrition variants; kept the documented `-keywords`), 040 (ADVISED_REVISIONS.md + stale worktree). Plus 036 auto-resolved via P1-007.

**Packaging / hygiene:** 041 (jspdf moved to dependencies), 043 (insulin truthiness — note: todo's premise was wrong, the `cf &&` was load-bearing TS narrowing), 044 (FilterBar auto-open advanced).

**Architecture extractions:** 029 (`src/lib/recommendations.ts` + 5 tests), 033 (`src/lib/favorites.ts` + 7 tests), 034 (`src/lib/recent-searches.ts` + 9 tests).

**Defense:** 045 (`HIGH_CONFIDENCE`/`MEDIUM_CONFIDENCE` constants exported + applied), 046 (new `scripts/lib/sanity.ts` + `assertSaneNutrition` + 12 tests + wired into both upgrade scripts).

**Deferred:**
- 030/031/032 — reducer extractions for trip-plan / meal-cart / compare. Pair as one hooks-layer refactor next time.
- 037 — W-9 cross-repo move. Acute PII risk already handled in P1-001/002.
- 038 — delete one-shot scripts. Most just gained safety improvements; premature.
- 039 — fold migrate-constraints into a real migration. Needs Go/No-Go on prod violation counts.
- 042 — drop canvas devdep. Needs baseline PDF-extraction validation.

---

## New artifacts

### Code modules
- `scripts/lib/sanitize-llm-input.ts` (P2-023)
- `scripts/lib/supabase-joins.ts` (P2-013)
- `scripts/lib/sanity.ts` (P3-046)
- `scripts/lib/confidence-thresholds.ts` (P3-045)
- `src/lib/recommendations.ts` (P3-029)
- `src/lib/favorites.ts` (P3-033)
- `src/lib/recent-searches.ts` (P3-034)

### Test files
- `src/hooks/__tests__/useCompare.test.tsx` (P1-010)
- `scripts/audit/__tests__/utils.test.ts` (P1-006)
- `scripts/lib/__tests__/sanitize-llm-input.test.ts` (P2-023)
- `scripts/lib/__tests__/sanity.test.ts` (P3-046)
- `src/lib/__tests__/recommendations.test.ts` (P3-029)
- `src/lib/__tests__/favorites.test.ts` (P3-033)
- `src/lib/__tests__/recent-searches.test.ts` (P3-034)

### Operational artifacts
- `supabase/migrations/README.md` (P2-027) — CONCURRENTLY + NOT VALID/VALIDATE policy
- `.github/dependabot.yml` (P2-022) — weekly GitHub Actions bumps
- `scripts/w9-profile.example.json` (P1-002) — gitignored-profile template
- `data/w9-output/profile.json` (P1-002) — gitignored, holds the actual PII

### Files deleted
- `scripts/estimate-nutrition-codex.ts`, `scripts/estimate-nutrition-ai-nameonly.ts`, `scripts/run-codex-overnight.sh` (P1-007/008)
- `scripts/estimate-nutrition-final.ts`, `scripts/estimate-nutrition-gemini.ts`, `scripts/estimate-nutrition-keywords-v2.ts`, `scripts/estimate-nutrition-smart.ts` (P3-035)
- `ADVISED_REVISIONS.md`, `.claude/worktrees/pensive-johnson/` (P3-040)

---

## Verification recap

```
npx tsc -b --noEmit  → clean
npx vitest run       → 173/173 across 28 files
npm run build        → succeeds in 4.88s; PWA SW generated
```

The `export-pdf-D166R7tR.js` chunk (388 KB) confirms `jspdf` is correctly code-split as a lazy runtime import — validating the P3-041 move from devDependencies to dependencies.

---

## Suggested merge order

1. **P1 patches first** — each todo has its own scope, easy to land independently
2. **P2 quality/security batch** — 011, 012, 013, 014, 015, 016, 018, 022, 023, 024, 027, 028 are independent of each other
3. **P3 cleanup batch** — 029, 033, 034, 035, 040, 041, 043, 044, 045, 046 are likewise independent
4. **Then circle back to the 11 deferred items** when their prerequisites are ready

The session's commits are all currently unstaged on `main`. Recommend splitting into logical PRs (or batches of commits) along the priority lines so reviewers can take them in digestible chunks.
