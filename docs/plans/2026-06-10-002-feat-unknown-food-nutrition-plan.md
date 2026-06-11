---
title: Unknown-Food Nutrition — Evidence-Triangulation Pipeline
type: feat
status: active
date: 2026-06-10
---

# 🧪 Unknown-Food Nutrition: Evidence-Triangulation Pipeline

## Overview

82.5% of the catalog (**14,279 items**) is below dosing grade. The chain-official supply line is exhausted (campaign banked at 17.5%), so further accuracy gains must come from **estimation that earns its confidence** — multiple independent evidence chains per item, each back-tested against the 1,802-row ground-truth set, combined only when they agree.

The design rests on one factorization and one untapped anchor:

**Factorization: `carbs = portion_mass × carb_density(composition)`.**
Carb *density* is well-determined by food class (a churro is a churro everywhere); **portion** is where theme-park estimates die — the over-multiplication crisis, and the calibration finding that the *highest*-similarity keyword band is the *least* accurate (54% within ±10g), are both portion failures. So the pipeline gathers **composition evidence** and **portion evidence** separately, and attacks portion with dedicated anchors.

**Untapped anchor: official calories without macros.**
FDA menu-labeling means Disney/Universal quick-service menu boards and mobile-order apps post **calories** for thousands of items we lack macros for. A known official calorie count *embeds the portion*: `carbs ≈ calories × carb_fraction(class) ÷ 4`. Whether that's dosing-grade depends on how tight `carb_fraction` is per class — **which the calibration harness can measure**, not assert.

## Population (measured 2026-06-10, read-only)

| Segment | Count | Notes |
|---|---|---|
| Below dosing grade | 14,279 (82.5%) | no carbs or conf < 70 |
| …with usable description (≥20 chars) | 11,182 (78.3%) | decomposition-viable at scale |
| …with price | 9,936 (69.6%) | portion sanity bound available |
| …generic-name (burger/pizza/churro/…) | 1,725 | chain-equivalent candidates |
| …entree + dessert (dosing-priority) | 8,290 | where the insulin decisions are |

## The evidence ladder

Each method is an **independent estimate with provenance**. Confidence ceilings below are *hypotheses to be measured* via `audit:calibrate --method <m>` against the official rows — the measured table replaces them.

### E1 — Official calories + composition class (the portion-collapse anchor)
- **Source:** menu boards / mobile-order listings (calorie disclosure), TouringPlans menus where they carry calories.
- **Method:** classify item into a composition class (burger-with-bun, fried-potato, churro-pastry, frozen-dairy, …); `carbs = official_cal × measured carb_fraction(class) ÷ 4`, bounds from the class's measured IQR.
- **Why it can be strong:** calories are *official*; the only estimated quantity is the carb fraction of a known food class. For tight classes (churro, pretzel, soft-serve) this may genuinely reach dosing-grade; for loose classes (entree platter) it won't — the per-class calibration decides.
- **Acquisition feasibility spike needed:** Disney mobile-order endpoints (TOS risk — flag before scraping), TouringPlans calorie coverage, menu-board photos from DFB articles.
- **Hypothesis ceiling:** 70–75 for tight classes, 55–65 loose. **(M)**

### E2 — Official & copycat recipes
- **Source:** Disney publishes official recipes for famous items (Dole Whip, churro bites, Ohana bread pudding — Disney Parks Blog/D23); AllEars & DFB publish reverse-engineered copycats with full ingredient lists.
- **Method:** agent finds the recipe → computes nutrition ingredient-by-ingredient via USDA FDC reference foods → scales to the park serving (anchored by E1 calories or known weights, e.g. the lab-tested cupcake / 10.7-oz pretzel).
- **Independence:** ingredient-chain evidence — independent of menu calories and of chain analogs.
- **Hypothesis ceiling:** official recipe ~65–70; copycat ~55–65. **(M — agent batches via the existing import-ai path)**

### E3 — Chain-equivalent anchoring
- **Source:** our own 1,802 official rows + national chain published data (a park cheeseburger-with-fries lives in the same nutritional neighborhood as Five Guys/Shake Shack/McDonald's analogs).
- **Method:** match the 1,725 generic-name items to a chain-analog *distribution* (not a single item); estimate = class median with portion adjustment (park QS ≈ 1.3–1.6× fast-food per the portion research); uncertainty = class IQR.
- **Hypothesis ceiling:** 55–65. **(S/M — mostly in-house data)**

### E4 — Description decomposition (scale workhorse)
- **Source:** the 11,182 descriptions ("pulled pork, brioche bun, citrus slaw, plantain chips").
- **Method:** LLM parses components → USDA per-component values → portion priors per component class. This is the existing import-ai "decomposition ~50" tier, now with a measured error bar instead of an asserted one.
- **Hypothesis ceiling:** 45–55 alone; higher only via agreement (below). **(exists — needs calibration)**

### E5 — Photos (opportunistic portion evidence, not a pillar)
- Coverage is 0.3% — photos refine portions for high-impact items but can't carry the catalog. Continue DFB scraping; pilot vision-model portion estimation only for top-dosing-impact items that E1–E4 leave uncertain. **(L — defer beyond pilot)**

### E6 — Price as a sanity *bound* (never a point estimate)
- Per-venue-tier plausibility band (price vs calories); flags absurd estimates (a $15.99 entree at 250 cal), feeds the audit, not the estimate. **(S)**

## Triangulation: how confidence is earned

1. Run all applicable methods per item → independent `{carbs, bounds, method}` estimates.
2. **Agreement scoring:** 2+ *independent* methods within ±15% (or ±8g for small items) → combined estimate (precision-weighted mean) gets the **measured agreement-tier confidence**; disagreement beyond tolerance → item routed to the verification queue with all estimates attached (a human or stronger agent adjudicates).
3. **No method self-promotes:** confidence comes only from the calibration table — per-method, per-category, and for agreement combinations. The table is built by running every method against the 1,802 official rows first (we can compute E2/E3/E4 estimates *for items whose answer we know*).
4. Imports flow through the existing `import-ai-nutrition` path: dry-run first, never-downgrade, `source_detail` records method + evidence URLs + agreement set.

**Gate to claim dosing-grade (≥70):** the method/agreement tier must show **≥90% within ±10g and ≤1% severe undercounts (≥20g low)** on ground truth for that category. Anything less keeps the in-app "verify before dosing" warning — by measurement, not policy.

## Why this beats more-of-the-same estimation

The keyword estimator's measured failure (MAE 9.2g, similarity ≠ accuracy) is a *single-evidence* failure: one text match, no portion anchor, no independence. Every rung above adds either an **official anchor** (E1), an **ingredient chain** (E2), a **published-analog distribution** (E3), or **cross-method agreement** — and every rung is regression-tested by the same harness that exposed the keyword failure.

## Phases

**Phase 0 — Calibrate the ladder (the everything-else-depends-on-it step).** Extend `audit:calibrate` with `--method e2|e3|e4` runners; produce the measured confidence table (per method × category × agreement combo) from the official 1,802. *Exit: `audit/calibration-results.json` carries per-method tables.* (M)

**Phase 1 — E1 feasibility spike.** Can we get official calories at scale? Check TouringPlans coverage, Disney mobile-order surface (TOS review first), DFB menu-board photos. Build the composition-class carb-fraction table from our official rows. *Exit: go/no-go + expected coverage count.* (S/M)

**Phase 2 — Pilot on the priority slice.** Top ~200 dosing-impact unknown entrees/desserts at WDW/Universal/Disneyland. Run E2+E3+E4 (+E1 where available), triangulate, import only calibrated-confident values, manually review a 30-item sample. *Exit: measured accuracy of the pilot batch + cost-per-item.* (M)

**Phase 3 — Scale by queue.** Work down the dosing-impact queue in agent batches; weekly `audit:calibrate` regression; quality report gains a "measured accuracy" panel alongside dosing-grade %. (ongoing)

## Phase 0 results (measured 2026-06-10, `audit:calibrate --all`)

**The triangulation hypothesis is confirmed.** Headline agreement numbers (first run; the committed `audit/calibration-results.json` carries the final run with per-category agreement breakdowns):

| Signal | MAE | within ±10g | severe undercounts |
|---|---|---|---|
| keyword alone (baseline) | 9.2g | 64.5% | 5.0% |
| chain alone (43.7% coverage) | 10.1g | 66.8% | **18%** ← dangerous alone |
| decomposition/Groq alone (first measurement) | 14.8g | 50.1% | 9.3% |
| **keyword+decomposition AGREE** (609) | **2.3g** | **93.4%** | **0.3%** |
| **chain+decomposition AGREE** (225) | **0.7g** | **98.7%** | **0.4%** |
| any pair DISAGREE | ~13–16g | 23–54% | 8–18% |

**Per-category agreement (the deciding breakdown):**

| Agreement pair, AGREE subset | beverage | entree |
|---|---|---|
| chain+decomposition | MAE 0.2g, **100% ±10g**, 0% undercut (n=205) | MAE 6.1g, 85% ±10g, 5% undercut (n=20) |
| keyword+decomposition | MAE 1.6g, **96.3% ±10g**, 0% undercut (n=562) | MAE 7.5g, 77.8% ±10g, 7.4% undercut (n=27) |
| keyword+chain | MAE 2.5g, 93.8% ±10g, 4.6% undercut (n=260) | MAE 9g, 75.8% ±10g, 6.5% undercut (n=62) |

Conclusions:
1. **No single method is dosing-grade** — including the Groq estimator, measured for the first time (its asserted confidence 35 is roughly right).
2. **Agreement on beverages clears the dosing-grade gate** (≥90% ±10g, ~0% undercuts) on this ground truth. **Agreement on entrees does not** — it's a large improvement (76–85% ±10g vs ~44% single-method) but undercut rates of 5–7% keep it below the bar.
3. **Disagreement correctly routes to verification** — errors are 4–7× higher when methods disagree.
4. **Pilot confidence policy (calibrated, conservative):** agreement-backed imports at conf 50–65 by tier and category; nothing ≥70 without explicit sign-off (critical ask below).

**E1 carb-fraction table** (official rows; spread = what an official calorie count leaves uncertain): smoothies ±0g, cookies ±2g, cakes ±5g, sandwiches ±7g, brownies ±7g, pretzels ±8g, salads/wraps ±10g — **E1 is viable for sweet/bakery/sandwich classes** — vs coffee-drinks ±13g, pastry ±14g, tenders ±24g, pizza ±35g (bound-only). Caveat: some classes are single-chain-dominated (Jamba = the entire smoothie class), so fractions may be chain-specific; the venue-PDF sweep will diversify them.

## Risks & honesty

- **E1 acquisition may be TOS-constrained** (Disney app endpoints). The spike answers this before any build; menu-board photos and TouringPlans are the fallback.
- **Carb-fraction spread:** for loose classes the calorie anchor only bounds, not pins — the per-class calibration prevents over-claiming.
- **Copycat recipes vary in fidelity** — treat fan copycats one tier below official recipes; require agreement with another method to rise.
- **Agent cost:** E2/E4 are LLM-batch work; the priority queue caps spend where dosing impact is highest. E3/E6 are nearly free.
- **The 90%/±10g dosing-grade gate may admit very few estimated items.** That's the correct outcome if so — the app's warning exists precisely for honest sub-dosing-grade values, and every rung still *improves* sub-70 accuracy (a 55-confidence value with MAE 5g beats one with MAE 12g for users who read the number anyway).

## Sources
- Population sizing: read-only SELECT vs `rcrzdpzwcbekgqgiwqcp`, 2026-06-10 (this doc).
- Calibration baseline: `audit/calibration-results.json` (keyword MAE 9.2g, 64.5% ±10g, similarity≠accuracy).
- Prior art: `docs/plans/2026-06-10-001-refactor-nutrition-audit-accuracy-plan.md` (integrity fixes + harness), trusted-carbs campaign (chain supply exhausted, venue-PDF sweep next), portion research in CLAUDE.md (lab-tested anchors).
