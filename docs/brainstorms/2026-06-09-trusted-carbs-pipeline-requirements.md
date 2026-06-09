---
date: 2026-06-09
topic: trusted-carbs-pipeline
---

# Trusted-Carbs Pipeline

## Problem Frame

Carb values drive insulin dosing — the app's highest-stakes output. Today the pipeline metric (`trustedCarbsPct`, 42.5%) counts USDA `api_lookup` rows as trusted, but the app UI (`src/lib/nutrition-trust.ts`) tells users **"do not dose from this value"** for anything below confidence 70 — including those same USDA rows (confidence 50–60). By the standard users actually see, only ~15–20% of the catalog is dosing-grade. This campaign aligns the metric with reality, then raises the real number using two supply lines that already exist: hand-researched chain-official data (confidence 85–90) and the free Opus published-figure engine (~75 when a published source is found).

## Requirements

- **R1. Metric realignment.** `scripts/audit/quality.ts` redefines trusted carbs as `carbs != null AND confidence_score >= 70` ("dosing-grade"), matching the UI threshold. Keep a secondary `sourced` stat (current official/api definition) for historical continuity. The quality history continues appending; the definitional break is recorded in the snapshot.
- **R2. Chain-official imports.** Research official published nutrition for chain restaurants present in the catalog — Starbucks, Earl of Sandwich, Blaze Pizza, Wetzel's Pretzels, Jamba, Panda Express, Skyline Chili, LaRosa's, plus any others discovered in the catalog — and import via the existing `researched-nutrition` pattern (regex match + exclude, source citation, confidence 85–90, never downgrades better data).
- **R3. Prioritized verification queue.** Rank the untrusted pool (confidence < 70) by dosing impact — destination tier (WDW / Universal Orlando / Disneyland first) × category weight (entree/dessert > snack > side > beverage) × carb magnitude — and generate Opus research batches in that order. Only published-figure findings (~75) graduate items to dosing-grade; recipe-computed (~60) and decomposition (~50) results still improve accuracy but honestly remain below the threshold.
- **R4. Progress visibility.** The quality report shows dosing-grade % overall AND for the priority slice (entrees+desserts at top destinations), so the coverage-weighted goal is directly observable.

## Success Criteria

- ≥70% of entrees + desserts at the top destinations (WDW, Universal Orlando, Disneyland Resort) are dosing-grade (confidence ≥ 70).
- Overall dosing-grade % at least **doubles** from the re-baselined starting value.
- No item's confidence is inflated without a citable source — graduation happens only via official/published data, never by relabeling.

## Scope Boundaries

- **CI regression gate: deferred** (user explicitly excluded it from this campaign; revisit after the metric stabilizes).
- **No app UI changes.** The UI already keys off confidence ≥ 70 — gains surface automatically as items graduate.
- **No paid nutrition APIs.** Supply lines are free: hand-researched chain data + Opus subscription research.
- Allergens, photos, and non-carb field coverage are out of scope.

## Key Decisions

- **Trust = confidence ≥ 70 only**: aligns the pipeline metric with what users see at the point of dosing; `api_lookup` rows are no longer auto-trusted. Honest baseline drop accepted.
- **Coverage-weighted target** over a single catalog-wide number: a Magic Kingdom entree matters more than a Kings Island soda; no analytics exist, so destination tier × category is the popularity proxy.
- **Reuse over build**: both supply lines (`import-researched-nutrition.ts`, `ai-nutrition-candidates.ts` + `import-ai-nutrition.ts`) already exist; the new work is prioritization, chain coverage, and metric/report changes.

## Dependencies / Assumptions

- Chain nutrition is published and citable for the listed chains (CLAUDE.md already catalogs sources for 6+ of them).
- The Opus engine's honest confidence tiers (75/60/50) remain as designed; no tier inflation.
- `source_detail` column (migration 00003) is available for citation tracking.

## Outstanding Questions

### Resolve Before Planning
- (none)

### Deferred to Planning
- [Affects R1][Technical] Exact re-baselined dosing-grade % — run the updated `quality.ts` to establish it before setting the doubling target's absolute number.
- [Affects R2][Technical] How to identify chain restaurants across parks reliably (name matching across 1,152 restaurants; watch for "Starbucks" vs "Joffrey's" branding quirks).
- [Affects R3][Needs research] Expected published-figure yield per Opus batch (pilot batch determines realistic throughput for the priority slice).
- [Affects R4][Technical] Whether the priority-slice stat lives in `quality-results.json`, the history file, or both.

## Next Steps
→ `/ce:plan` for structured implementation planning
