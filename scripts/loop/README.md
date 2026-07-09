# Database Improvement Loop

The improvement loop iteratively raises two things about the nutrition database:

1. **Accuracy** — how trustworthy the existing nutrition values are (especially
   carbs, which drive insulin dosing).
2. **Comprehensiveness** — how many menu items actually have usable nutrition at
   all.

It is a **measure → act → re-measure → decide-until-converged** loop. Each round
it measures the current state of the DB, optionally acts (applies auto-fixes and
runs the enrichment chain), measures again, and decides whether another round is
worth it. It stops when improvement stalls (convergence) or the iteration cap is
hit.

This is a **carb-dosing-critical dataset.** The loop is conservative by default:
it never writes unless explicitly told to with `--apply`.

## Architecture

- **`control.ts`** — pure functions, no I/O. Computes `LoopMetrics` from a set of
  items, builds a **dosing-impact-prioritized gap worklist**
  (`buildEnrichmentWorklist`), classifies gap items (`isGapItem`), and decides
  whether to keep going (`decideContinue`, the loop-until-dry convergence rule).
  Being pure, it is unit-tested in `__tests__/`.
- **`improve.ts`** — the orchestrator. It composes the existing audit building
  blocks (`checkAccuracy`, `buildFixBatch`, `checkCompleteness`) and shells out
  to the existing enrichment scripts. It owns all I/O: reading the DB, applying
  writes when `--apply` is set, and appending to `audit/loop-history.json`.

The loop **reuses the existing audit + enrichment subsystems** (`scripts/audit/`
and the `enrich-*` scripts). It does not reimplement scoring or estimation — it
sequences them and tracks whether they are converging.

### Accuracy arm

`checkAccuracy` surfaces items whose stated nutrition is internally inconsistent
or externally implausible. `buildFixBatch` turns the high-confidence findings
into an auto-fix batch. When applied, auto-fixes **demote `confidence_score`
below the dosing-grade threshold** — a corrected value is flagged as estimated,
not presented as trustworthy for dosing.

### Comprehensiveness arm

A prioritized **enrichment chain**, cheapest / highest-confidence source first:

```
nutritionix → usda → edamam → triangulate → ai
```

Each enricher **self-selects** which gap items it should attempt (from the
dosing-prioritized worklist) and **self-skips** if its API keys are absent, so
the chain degrades gracefully when only some credentials are configured.
Estimator-sourced values (usda/edamam/ai/triangulate) are **capped below the
dosing bar** so they never masquerade as official, dosing-grade data.

## Safety model

- **`--apply` is required for any DB write.** Without it the loop is
  plan/measure-only: it reads, reports what it *would* do, and records metrics.
- **`--from-file=PATH` runs fully offline** against a JSON snapshot — no DB
  connection at all. Useful for CI dry-runs and local inspection.
- **Auto-fixes demote confidence** below dosing-grade.
- **Estimators are capped below the dosing bar**, so enrichment can improve
  coverage without inflating apparent trust.
- The scheduled CI run is **always measure-only** (see below).

## Usage

```bash
# Offline measure against a snapshot (no DB, no writes)
npm run loop:improve -- --from-file=audit/quality-results.json
# (equivalently: npm run loop:measure -- --from-file=audit/quality-results.json)

# Live plan / measure against the DB — reads only, NO writes
npm run loop:improve

# Live apply — performs auto-fixes + enrichment writes
npm run loop:improve -- --apply --max-iterations=3 --enrich-limit=200
```

### Flags

| Flag | Meaning |
|------|---------|
| `--apply` | Perform DB writes. Default is plan/measure only (no writes). |
| `--from-file=PATH` | Offline mode against a JSON snapshot (no DB). |
| `--max-iterations=N` | Cap on measure→act→re-measure rounds. |
| `--enrich-limit=N` | Max items enriched per iteration. |
| `--min-improvement=P` | Min carb-trust % gain to count a round as progress. |
| `--convergence-rounds=K` | Non-improving rounds tolerated before stopping. |
| `--enrichers=csv` | Subset/order of enrichers: `nutritionix,usda,edamam,triangulate,ai`. |
| `--skip-enrich` | Run only the accuracy arm (no enrichment chain). |

### How CI runs it

`.github/workflows/improvement-loop.yml`:

- **Weekly schedule** (`cron: '0 6 * * 1'`, Mondays) — **measure-only**, never
  writes. Just tracks metric drift over time.
- **Manual `workflow_dispatch`** — with `apply=true` it runs with `--apply`
  (plus `max_iterations` / `enrich_limit` inputs); with `apply=false` it is
  measure-only.

Both paths commit `audit/loop-history.json` back with a `[skip ci]` message.

## Metrics / output

Each iteration appends a `LoopMetrics` record to **`audit/loop-history.json`**.
Key fields:

| Metric | Meaning |
|--------|---------|
| `dosingGradeCarbsPct` | % of items with carbs trustworthy enough for dosing — the loop's primary target. |
| `hasCarbsPct` | % of items with any carb value present. |
| `caloriesPresentPct` / `nullCaloriePct` | Calorie coverage / gap. |
| `prioritySliceDosingPct` | Dosing-grade coverage within the high-impact priority slice. |
| `gapItemCount` | Items still missing usable nutrition. |
| `highFindings` / `mediumFindings` / `lowFindings` | Outstanding accuracy findings by severity. |
| `autoFixesApplied` / `enrichedThisIteration` | Work done this round. |

Convergence is judged on `dosingGradeCarbsPct` gain and HIGH-finding reduction:
the loop stops once neither is improving for `--convergence-rounds` rounds.

## Required env / secrets

Names only (values live in `.env.local` locally and GitHub Actions secrets in CI):

- **Required:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Optional** (each enricher self-skips if its keys are missing):
  `NUTRITIONIX_APP_ID`, `NUTRITIONIX_API_KEY`, `EDAMAM_APP_ID`, `EDAMAM_APP_KEY`,
  `GROQ_API_KEY`, `USDA_API_KEY`
