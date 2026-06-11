---
title: Nutrition Audit Accuracy Refinement
type: refactor
status: active
date: 2026-06-10
---

# 🔬 Nutrition Audit Accuracy Refinement

## Overview

Joint review of the nutrition-data accuracy process by Claude (Opus 4.8) and **Codex (gpt-5 family, independent adversarial review via `codex exec`)**, both working from the live code. The reviews converged on the same diagnosis: **the audit pipeline validates internal *consistency* well, but "confidence" — the number the app converts into "safe to dose insulin" at ≥70 — was a heuristic with three structural paths that could mint dosing-grade values without carb evidence, and no measurement connecting any confidence value to actual accuracy.**

This pass closed the three holes, restored two lost audit capabilities, and — most importantly — built a **calibration back-test** that measures estimator accuracy against the 1,802 chain-published official rows. Confidence is now anchored to evidence.

## The three integrity holes (all closed)

| # | Hole | Live damage | Fix |
|---|---|---|---|
| 1 | **Keyword estimator** (`sync/estimate-nutrition.ts:191`): `confidence = similarity × 0.8` reaches **80**; `approve.ts` auto-approved at ≥70 and wrote it verbatim as `confidence_score` | 6 rows | Capped at `KEYWORD_CONFIDENCE_CAP = 65` — a text-similarity copy can never present as dosing-grade |
| 2 | **USDA enricher** (`enrich-nutrition.ts`): confidence **85 from calorie agreement alone** (never checked carbs), unconditionally re-stamped `source: 'api_lookup'` + confidence onto any row missing a micro — including chain-official rows | 30 rows ≥70 as `api_lookup` (7 at the 85 mint) | 85 now requires **carbs to independently agree within 20%** (two-factor corroboration); `official`-source and conf≥70 rows are never touched; `.order('id')` pagination |
| 3 | **Auto-fix laundering** (`accuracy.ts` + `auto-fix.ts`): corrections (fiber:=10%·carbs, sugar:=carbs, sodium÷10, negative:=0) fabricated internal consistency while the record **kept its original confidence** | systemic | Every auto-fixed record is **demoted to ≤40** (never raised). `sugar>carbs` is no longer auto-fixed at all — it usually means **carbs are undercounted** (the dosing field); capping sugar hid that signal. Now flag-only, HIGH |

Verified counts (2026-06-10): 3,027 dosing-grade rows total → 1,880 official (chain campaign, intact), 1,109 grounded Opus imports with cited provenance, ~36 rows from the holes above (flagged for re-verification below). The feared mass-contamination (e.g. legacy `import-all` rows at source='official'/conf 70) had already been cleaned up by the trusted-carbs campaign.

## Capabilities restored / added

- **Alcohol-aware Atwater** — 738 rows have `alcohol_grams > 0` but the caloric-math check skipped *all* alcohol-suspected items. Now validates them with `P·4 + C·4 + F·9 + alc·7`; alcohol-suspected rows *without* `alcohol_grams` get a LOW `alcohol_grams_missing` finding instead of a silent skip.
- **Template-profile detection** — `TEMPLATE_MIN_COUNT: 5` existed in thresholds but was never used (the capability was lost when the old 3-pass audit was archived). New check flags ≥5 *differently-named, non-official* items sharing an identical macro tuple — exactly the keyword-copy failure mode that passes every consistency check. Chain officials and same-name multi-location copies are excluded (legitimately identical).
- **Stable pagination** — `fetchAllItems` (audit) and the USDA enricher paged `.range()` without `.order()`, which can skip/duplicate rows across 17k items. Both fixed.
- **Auto-approve gate documented** — `approve.ts`'s ≥70 gate tests the scrape-**match** confidence while the **estimate** confidence is what gets written; the two quantities are now explicitly distinguished in the code, and the cap makes the distinction safe.

## Calibration: confidence is now measured, not asserted

**`npm run audit:calibrate`** back-tests the production keyword estimator against the **1,802 chain-published official rows** (leakage-controlled: the target item and all identically-named siblings are excluded from the matching pool). First results (`audit/calibration-results.json`):

| Band | n | carb MAE | within ±10g | severe undercount (≥20g low) |
|---|---|---|---|---|
| **Overall** | 1,640 est. (91% coverage) | **9.2g** (median 2g) | **64.5%** | **5.0%** |
| conf <50 (deferred) | 448 | 12.2g | 61.2% | 8.7% |
| conf 50–64 (auto-approvable) | 731 | 7.0g | 73.1% | 4.2% |
| conf 65 (at cap) | 461 | 9.8g | **54.2%** | 2.6% |

Two findings matter:

1. **Confidence does not track accuracy** — the *highest*-similarity band is *worse* than the middle band (54% vs 73% within ±10g). High text similarity often means a same-named-style item at a different venue with different portions.
2. **No keyword band approaches dosing-grade reliability.** A defensible dosing-grade gate is ~95% within ±10g; the best band reaches 73%. The 65 cap is empirically vindicated — and dose impact is concrete: MAE 9.2g ≈ **0.9 units at ICR 10**, with 1 in 20 estimates ≥20g low (≥2 units under-dosed).

**Process rule going forward:** any change to an estimator (prompt, similarity formula, new source) must rerun `audit:calibrate` and not regress these metrics. The harness is the regression test for accuracy itself.

## The refined audit process (end to end)

1. **Ingest-time guards** (existing import validation) + estimator caps: keyword ≤65; Groq 35; Edamam ≤68; only **cited evidence** (chain-official, published-source imports) may enter at ≥70.
2. **Daily accuracy pass** (`audit:pipeline`): consistency checks + alcohol-aware Atwater + template detection.
3. **Auto-fix with demotion**: safe repairs apply, and the repaired record drops to ≤40 — it re-earns trust only through re-verification. `sugar>carbs` goes to human review, never auto-repair.
4. **Verification queue**: HIGH/MEDIUM findings + demoted rows, ordered by the existing dosing-impact priority (`trust.ts`), drained by the researched/grounded import paths (dry-run-first, never-downgrade).
5. **Calibration** (`audit:calibrate`): rerun after estimator changes; results in `audit/calibration-results.json`.
6. **Quality snapshot** (`audit:quality`): dosing-grade % + the calibration date, tracked in history.

## Deferred (ranked; from the joint review)

1. **Re-verify the ~36 suspect rows** (30 `api_lookup` ≥70 — some may be legitimate Nutritionix branded 88s, needs row-level review; 6 keyword-copied) — S, data task.
2. **Per-food-type plausibility ranges** — port the 27 archived food profiles (`scripts/archive/audit-nutrition.ts:316+`) into a live audit pass. M. (Atwater can't catch a 2× portion error when all macros scale together; ranges can.)
3. **Stale-on-change re-verification** — weekly merge tracks `updatedItems` but estimation/import only process `newItems`; a renamed/reformulated item keeps its old nutrition (Codex finding). M.
4. **Chain drift check** — `CHAIN_DRIFT_PCT: 20` is defined but unimplemented in `external.ts`; chains reformulate, official values go stale. M.
5. **`nutritional_data` uniqueness** — no UNIQUE on `menu_item_id`; audit/app read row [0] arbitrarily. Migration + dedupe. M (Codex finding).
6. **Groq calorie-adjustment laundering** — `estimate-nutrition-ai.ts:150-156` adjusts calories to match model macros, hiding bad output from later Atwater checks (Codex finding). S to remove; rerun calibration with an `--method ai` mode to measure the Groq path before/after. M.
7. **Weekly re-verification sampling** — sample N dosing-grade rows, re-verify via an independent source, publish measured agreement as the real accuracy KPI (the quality score currently measures coverage+confidence, not accuracy). M.

## Sources

- Codex independent review: `codex exec` (gpt-5 family, read-only sandbox, 2026-06-10) — confirmed holes #1–3 independently; contributed the USDA carb-agreement gap, the approve-gate semantics, sugar-cap danger analysis, import-all legacy default, stale-on-change, uniqueness, and Groq-laundering findings.
- Calibration evidence: `audit/calibration-results.json` (2026-06-10, 1,802 ground-truth rows).
- Contamination quantification: read-only SELECTs vs project `rcrzdpzwcbekgqgiwqcp`, 2026-06-10.
- Key code: `scripts/audit/{accuracy,auto-fix,thresholds,types,utils,calibrate}.ts`, `scripts/sync/estimate-nutrition.ts`, `scripts/enrich-nutrition.ts`, `scripts/approve.ts`.
