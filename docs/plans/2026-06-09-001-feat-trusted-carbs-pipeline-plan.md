---
title: "feat: Trusted-Carbs Pipeline — dosing-grade carb coverage campaign"
type: feat
status: active
date: 2026-06-09
origin: docs/brainstorms/2026-06-09-trusted-carbs-pipeline-requirements.md
---

# ✨ Trusted-Carbs Pipeline — dosing-grade carb coverage campaign

## Overview

Carb values drive insulin dosing — the app's highest-stakes output. The pipeline metric (`trustedCarbsPct` = 42.5%) counts USDA `api_lookup` rows as trusted, but the app UI (`src/lib/nutrition-trust.ts:53`) tells users **"do not dose from this value"** for anything below confidence 70 — including those same USDA rows. Measured by the standard users actually see, only **14.6% of the catalog is dosing-grade** (2,532 / 17,306; verified against prod 2026-06-09).

This campaign (1) realigns the metric to the user-facing definition, (2) graduates chain-restaurant items using official published nutrition, and (3) feeds the remaining high-impact items through the existing free Opus published-figure engine in dosing-impact order.

## Problem Statement / Motivation

(see origin: docs/brainstorms/2026-06-09-trusted-carbs-pipeline-requirements.md)

- **14,431 items (85% of carb values) show numbers the app itself flags as below dosing-grade**; the old headline metric hid ~4,800 of these by counting `api_lookup` (confidence 50–60) as trusted.
- The priority slice — **entrees + desserts at WDW, Universal Orlando, and Disneyland Resort — is 8,818 items at only 7.6% dosing-grade** (WDW 402/5,259; Universal 256/2,211; Disneyland 10/1,348).
- Two free supply lines already exist and are idle: hand-researched chain data (`import-researched-nutrition.ts`, confidence 85–90) and the Opus published-figure engine (`ai-nutrition-candidates.ts` → `import-ai-nutrition.ts`, ~75 when a published source is found).

## Proposed Solution

Three phases, each independently shippable, with a measured re-scope checkpoint at the end (the 70%-of-slice goal exceeds known supply; see Risks).

### Baseline numbers (prod, 2026-06-09)

| Metric | Value |
|---|---|
| Total items | 17,306 (16,963 with carbs) |
| Dosing-grade (conf ≥ 70) | 2,532 = **14.6%** |
| Confidence histogram | 85+: 1,312 · 70–84: 1,220 · 60–69: 1,036 · 50–59: 5,415 · 40–49: 1,350 · 35–39: 3,399 · <35: 3,231 |
| Priority slice (entree+dessert @ top 3) | 8,818 items, 668 dosing-grade = **7.6%** |
| Chain items found (17 chains) | ~1,840 items, ~1,290 graduable |

### Phase 1: Metric realignment (R1, R4)

**Files:** `scripts/audit/quality.ts`, `scripts/audit/__tests__/` (new test), `audit/quality-history.json` (new fields)

- Redefine the trust predicate: `carbs != null && confidence_score >= 70` → reported as `trustedCarbsPct` (now matching the UI). Add `sourcedCarbsPct` (the old source-OR-confidence definition) for series continuity.
- Add a **priority-slice stat** to the snapshot: `prioritySlice: { total, dosingGrade, pct }` for entrees+desserts where park location matches the top-3 destinations (`/walt disney world|universal orlando|disneyland/i` against `parks.location`).
- Mark the definitional break in the snapshot (e.g., `trustDefinition: 'confidence>=70 (v2)'`) so the history chart's discontinuity is self-documenting.
- Extract the trust predicate + slice classifier into a small exported helper so `scripts/audit/__tests__/quality-trust.test.ts` can unit-test them (existing Vitest setup in `scripts/__tests__/`).
- Keep the composite quality score weights unchanged; the 0.45 trusted-carbs term now uses the honest definition, so the score steps down at realignment. That drop is correct and expected — do not retune weights to mask it.

**Success criteria:** `npm run audit:quality` reports ~14.6% trusted / ~7.6% slice on current data; both old and new series present; unit tests pass.

### Phase 2: Chain-official imports (R2)

**Files:** `scripts/import-researched-nutrition.ts` (extend with `--file=` support like `import-ai-nutrition.ts`), new per-chain data files `data/chains/<chain>.json` (decided: per-chain files — a 500-entry Starbucks list doesn't belong in the shared `researched-nutrition.json`, and per-chain files keep dry-run reviews and commits scoped)

1. **Importer extension — restaurant-scoped matching.** Add optional `restaurantMatch: string[]` (+ `restaurantExclude`) regexes per entry. Today's matching is item-name-regex **global** — a "Caramel Frappuccino" entry could hit a non-Starbucks item. Restaurant scoping is a hard prerequisite for chain imports. Preserve existing safety behavior: dry-run default, never downgrade higher-confidence data, `source_detail` citation (column from migration 00003).
2. **Chain research order** (by graduable items; published-data availability noted):

| Chain | Items | Graduable | Published data |
|---|---|---|---|
| Starbucks (incl. Trolley Car Café, Creature Comforts) | 624 | 542 | Full official site |
| Joffrey's | 532 | 490 | Partial (drinks PDF) |
| Earl of Sandwich | 141 | 55 | Official PDF |
| Wetzel's Pretzels | 67 | 56 | Official PDF |
| Jamba | 68 | 50 | Official site |
| Blaze Pizza | 81 | 48 | Official builder |
| Chick-fil-A | 15 | 15 | Full official site |
| Cinnabon | 25 | 12 | Official site |
| Auntie Anne's, Cold Stone, Panda Express, Skyline, LaRosa's, Dippin' Dots | ~98 | ~26 | Official sites |

   Skip Rainforest Cafe / Planet Hollywood / House of Blues (~205 items): no published nutrition.
3. Per chain: build entries (match + exclude + restaurantMatch + nutrition + `sourceUrl` + confidence 85–90), dry-run, eyeball matches, `--apply`.
4. Re-run `npm run audit:quality` after each chain; commit data files + updated snapshot together (audit trail).

**Expected gain:** ~800–1,100 graduations (name matching won't reach 100%) → overall ~19–21%. **Note:** most of this comes from beverage/pastry chains (Starbucks, Joffrey's), so Phase 2 lifts the *overall* number far more than the entree+dessert *priority slice* — slice progress depends mainly on Phase 3. Plan the checkpoint expectations accordingly.

### Phase 3: Prioritized Opus verification queue (R3)

**Files:** `scripts/ai-nutrition-candidates.ts` (extend with `--priority` mode)

- Add priority ordering to candidate selection: **destination tier** (WDW/Universal/Disneyland = tier 1) × **category weight** (entree 3, dessert 3, snack 2, side 1, beverage 0.5) × **carb magnitude** (higher carbs = higher dosing impact). Keep existing filters (has description, not a chain, low confidence).
- **Pilot batch:** 5 batches × 20 items from the top of the queue. Measure published-figure yield (% of items graduating to ≥ 70). The generator's honest tiers stay as designed: published ~75, recipe ~60, decomposition ~50 — only published findings graduate (origin doc honesty rule).
- Scale rule: continue batches while published-figure yield stays **≥ 20% per 100-item tranche**; if a tranche falls below 20%, stop and trigger the checkpoint instead of grinding. Recipe/decomposition results still land (accuracy improves) without inflating trust.

**Expected gain:** unknown until pilot; assume 20–40% published-figure yield on tier-1 entrees/desserts.

### Checkpoint: measure & re-scope

After Phases 2 + pilot 3: re-run the quality report, compare to targets, and pick one of these predefined responses (record the decision in the plan/ideation session log):

1. **Continue** — yield ≥ 20%: set a batch cadence (e.g., N batches per week) and keep going.
2. **Narrow the slice** — yield < 20% but WDW progressing: redefine the 70% goal as WDW-only entrees+desserts (5,259 items) where published coverage is densest.
3. **Lower the slice target** — keep the 3-destination slice but set the goal to the measured-supply ceiling (e.g., 40–50%), keeping the overall 2× target unchanged.
4. **Stop and bank** — both targets unreachable with current supply: ship the gains, leave the prioritized queue in place, and revisit when a new supply line appears (e.g., user-submitted citations or a chain publishing data).

## Technical Considerations

- **No schema changes.** `source_detail` (migration 00003) carries citations; confidence stays the graduation mechanism.
- **No app changes.** UI already keys off confidence ≥ 70 (`getNutritionTrust`, `getEstimateTierShort`); graduated items flip to "Verified" automatically.
- **No paid APIs** (origin decision): supply = chain research + Opus subscription.
- Scripts typecheck via `npx tsc -p tsconfig.scripts.json --noEmit`; script tests run in the main Vitest suite.

## System-Wide Impact

- **Interaction graph:** quality.ts snapshot → `audit/quality-history.json` → daily-audit workflow commits it. New fields are additive; the workflow needs no change. The composite quality score drops at realignment — the daily audit markdown will show a step change (expected, self-documented via `trustDefinition`).
- **Error propagation:** importer is dry-run-first and per-row; a failed update logs and continues (existing pattern). No transactional risk beyond current behavior.
- **State lifecycle:** updates only ever raise confidence (never-downgrade guard); re-runs are idempotent.
- **Metric drift:** weekly sync keeps inserting low-confidence items, diluting the percentage. CI regression gate was **explicitly deferred** (origin decision) — revisit after the metric stabilizes.
- **Integration test scenarios:**
  1. Researched entry with `restaurantMatch` does NOT update an identically-named item at a different restaurant.
  2. Entry with lower confidence than existing data leaves the row untouched.
  3. quality.ts slice stat counts an entree at a WDW park and excludes the same category at Dollywood.
  4. Snapshot append preserves prior history entries (the file is merge-conflict-prone; see memory note).

## Acceptance Criteria

- [ ] R1: `trustedCarbsPct` = conf ≥ 70 definition; `sourcedCarbsPct` preserved; `trustDefinition` marker present; unit tests for predicate + slice classifier
- [ ] R4: priority-slice stat (total / dosing-grade / pct) in snapshot and console output
- [ ] R2: importer supports restaurant-scoped matching; ≥ 8 chains imported with `sourceUrl` citations at confidence 85–90; dry-run previews reviewed before each `--apply`
- [ ] R3: `--priority` candidate mode implements destination × category × carb ordering; pilot (≥ 100 items) run and yield recorded
- [ ] Honesty rule: no confidence raised without citable source; Opus tiers unchanged (75/60/50)
- [ ] Checkpoint review performed and recorded after Phase 2 + pilot
- [ ] Success (campaign): overall dosing-grade ≥ **29%** (2× baseline); priority slice trending toward 70% with explicit re-scope decision if supply falls short

## Success Metrics

- `trustedCarbsPct` (v2): 14.6% → ≥ 29%
- Priority slice: 7.6% → checkpoint-driven (70% is the aspirational target; supply-limited)
- Chain graduations: ~800–1,100 items with citations

## Dependencies & Risks

- **70%-of-slice exceeds known supply** (~6,170 needed vs ~1,500–2,500 realistic from chains + published figures). Mitigated by the explicit checkpoint/re-scope gate rather than silent failure.
- Joffrey's published data is partial (drinks only) — pastry items may not graduate.
- Disney publishes almost no official nutrition; slice progress at Disneyland Resort (0.7% baseline) depends heavily on Opus published-figure yield (DFB/TouringPlans lab-tested items).
- Name-matching quirks: curly vs straight apostrophes (Wetzel's vs Wetzel’s), ® marks (Panda Express®) — normalize in `restaurantMatch` regexes.
- `audit/quality-history.json` merge conflicts on long-lived branches (known; keep both sides).

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-09-trusted-carbs-pipeline-requirements.md](../brainstorms/2026-06-09-trusted-carbs-pipeline-requirements.md) — key decisions carried forward: trust = confidence ≥ 70 only; coverage-weighted target; CI gate deferred; no UI changes; no paid APIs; reuse existing supply lines.
- Trust predicate (current): `scripts/audit/quality.ts:42-43,112`
- UI trust thresholds: `src/lib/nutrition-trust.ts:53,97-101`
- Researched importer: `scripts/import-researched-nutrition.ts` (Entry interface lines 31-40)
- Opus engine: `scripts/ai-nutrition-candidates.ts`, `scripts/import-ai-nutrition.ts` (confidence tiers in header)
- Chain source catalog: `CLAUDE.md` → "Chain Restaurant Nutrition Sources"
- Ideation: `docs/ideation/2026-06-09-open-ideation.md` (idea #1)
