# Scheduled Audit System Design

**Date:** 2026-02-26
**Status:** Draft
**Goal:** Automated daily (then weekly) audit ensuring database completeness and accuracy for health-critical nutrition data.

## Context

DiabetesGuide has 9,261 menu items with nutrition data that people use to make diabetes management decisions. After 12 manual audit rounds, we reached 0 HIGH / 0 MEDIUM findings. This system automates ongoing quality assurance so regressions are caught within 24 hours and the database converges toward complete, verified data.

## Architecture: Hybrid (Pipeline + DB Guards)

Two complementary layers:

1. **Scheduled Pipeline** — GitHub Actions runs modular audit scripts daily, auto-fixes math impossibilities, reports findings via GitHub Issue + email.
2. **Database Constraints & Triggers** — PostgreSQL CHECK constraints reject impossible values at write time; a trigger function logs suspicious values to `audit_log` for the pipeline to report.

## Layer 1: Audit Pipeline

### Module Structure

```
scripts/audit/
├── pipeline.ts              # Orchestrator — runs modules, aggregates results
├── accuracy.ts              # Pass 1: caloric math, macro ratios, plausibility
├── completeness.ts          # Pass 2: coverage gaps, sparse restaurants, missing parks
├── external.ts              # Pass 3: chain cross-reference, scraper health, stale data
├── auto-fix.ts              # Tiered auto-fix (math impossibilities only)
├── report.ts                # GitHub Issue creation/update + email digest
├── graduation.ts            # Daily → weekly transition logic
├── types.ts                 # AuditFinding, AuditResult, Severity interfaces
└── thresholds.ts            # All magic numbers centralized
```

### Accuracy Checks (Pass 1)

Evolves from existing `audit-nutrition.ts`, same 3-pass structure refined:

| Check | Severity | Auto-Fix? |
|-------|----------|-----------|
| Fiber > carbs | HIGH | Yes — set fiber = 10% of carbs |
| Sugar > carbs | HIGH | Yes — cap sugar at carbs value |
| Sodium > 10,000 mg | HIGH | Yes — divide by 10 |
| Calories negative or > 5,000 | HIGH | No — flag for review |
| Atwater deviation > 50% (non-alcohol) | HIGH | No — flag |
| Atwater deviation 20-50% (non-alcohol) | MEDIUM | No — flag |
| Fat = 0 on fried/pastry items | MEDIUM | No — flag |
| Protein = 0 on meat items | MEDIUM | No — flag |
| All macros identical across 5+ items at same restaurant | MEDIUM | No — flag as template data |
| Caloric math gap on alcoholic drinks | LOW | No — expected, suppress |

**Auto-fix rules are deliberately conservative.** Only mathematically impossible values get corrected. Everything else requires human review because people make health decisions on this data.

### Completeness Checks (Pass 2)

| Check | Severity | Threshold |
|-------|----------|-----------|
| Park with < 10 restaurants | HIGH | Missing park data |
| Restaurant with < 3 menu items | MEDIUM | Sparse menu |
| Park with > 30% null calories | HIGH | Coverage gap |
| Menu category with 0 items at a park | LOW | Missing food type |
| No allergen data for entire park | LOW | Allergens incomplete |
| Restaurant with no description on any item | LOW | Missing descriptions |
| Items with confidence_score < 30 | MEDIUM | Low-quality estimates |

### External Checks (Pass 3)

| Check | Runs | Source | Method |
|-------|------|--------|--------|
| Chain nutrition drift | Weekly | Official chain websites | Scrape calorie/carb values, compare against DB. Flag if >20% deviation. |
| Scraper health | Daily | Universal, Dollywood, Kings Island scrapers | Attempt dry-run, report success/failure/blocked. |
| AllEars status | Daily | allears.net | Check if Cloudflare block persists. |
| Stale data detection | Daily | `nutritional_data.updated_at` | Flag items unchanged > 90 days with confidence_score < 50. |

**Chain cross-reference targets** (9 chains with published nutrition):
Earl of Sandwich, Blaze Pizza, Chicken Guy!, Wetzel's Pretzels, Jamba, Starbucks, Sprinkles, Panda Express, Auntie Anne's

### Auto-Fix Module

**Tier 1 (always auto-fix):** Mathematical impossibilities only.
- fiber > carbs → fiber = round(carbs * 0.10)
- sugar > carbs → sugar = carbs
- sodium > 10,000 → sodium = round(sodium / 10)
- negative macro values → set to 0

**Tier 2 (flag for review):** Everything else. No exceptions.

Every auto-fix is logged with before/after values in the report and in `audit_log`.

## Layer 2: Database Validation

### Hard Constraints (CHECK)

Applied to `nutritional_data` table. These reject writes that violate mathematical rules:

```sql
ALTER TABLE nutritional_data
  ADD CONSTRAINT chk_fiber_lte_carbs
    CHECK (fiber IS NULL OR carbs IS NULL OR fiber <= carbs),
  ADD CONSTRAINT chk_sugar_lte_carbs
    CHECK (sugar IS NULL OR carbs IS NULL OR sugar <= carbs),
  ADD CONSTRAINT chk_calories_range
    CHECK (calories IS NULL OR (calories >= 0 AND calories <= 5000)),
  ADD CONSTRAINT chk_sodium_range
    CHECK (sodium IS NULL OR (sodium >= 0 AND sodium <= 10000)),
  ADD CONSTRAINT chk_macros_non_negative
    CHECK (
      (carbs IS NULL OR carbs >= 0) AND
      (fat IS NULL OR fat >= 0) AND
      (protein IS NULL OR protein >= 0) AND
      (sugar IS NULL OR sugar >= 0) AND
      (fiber IS NULL OR fiber >= 0)
    );
```

### Soft Validation Trigger

A `BEFORE INSERT OR UPDATE` trigger on `nutritional_data` that **does not reject** writes but logs suspicious values to `audit_log`:

```sql
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
  message TEXT NOT NULL,
  details JSONB,            -- before/after values, context
  auto_fixed BOOLEAN DEFAULT FALSE,
  reviewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: public SELECT, service-role INSERT/UPDATE
```

**Trigger checks:**
- Atwater deviation > 30% (non-alcohol items)
- Calories > 3,000 (unusual for single item)
- Fat = 0 when item name contains fried/crispy/pastry keywords
- Protein = 0 when item name contains meat/chicken/beef/fish keywords
- Confidence score downgrade (new value < old value)

The daily pipeline reads `audit_log WHERE reviewed = FALSE` and includes these in the report.

## GitHub Actions Workflow

### `.github/workflows/daily-audit.yml`

```yaml
name: Daily Audit
on:
  schedule:
    - cron: '0 6 * * *'    # 6 AM UTC (1 AM ET) — daily
  workflow_dispatch:         # manual trigger always available

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci

      # Core audit passes
      - run: npx tsx scripts/audit/accuracy.ts
      - run: npx tsx scripts/audit/completeness.ts

      # Auto-fix (Tier 1 only)
      - run: npx tsx scripts/audit/auto-fix.ts

      # External checks
      - run: npx tsx scripts/audit/external.ts

      # Report (GitHub Issue + email)
      - run: npx tsx scripts/audit/report.ts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GMAIL_CLIENT_ID: ${{ secrets.GMAIL_CLIENT_ID }}
          GMAIL_CLIENT_SECRET: ${{ secrets.GMAIL_CLIENT_SECRET }}
          GMAIL_REFRESH_TOKEN: ${{ secrets.GMAIL_REFRESH_TOKEN }}

      # Graduation check
      - run: npx tsx scripts/audit/graduation.ts

      # Commit auto-fix changes + graduation state
      - run: |
          git config user.name "audit-bot"
          git config user.email "noreply@github.com"
          git add audit/graduation-state.json audit/daily/
          git diff --cached --quiet || git commit -m "audit: daily run $(date +%Y-%m-%d)"
          git push
```

**Secrets required:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

## Graduation Logic

### State File: `audit/graduation-state.json`

```json
{
  "mode": "daily",
  "consecutive_clean_days": 0,
  "last_audit": "2026-02-26",
  "auto_fixes_applied": 0,
  "history": [],
  "graduation_threshold": 14
}
```

### Rules

1. **Clean day** = 0 new HIGH findings + 0 new MEDIUM findings + 0 auto-fixes applied.
2. Counter increments on clean days, **resets to 0** on any finding or auto-fix.
3. When counter reaches **14** → `mode` changes to `"weekly"`, workflow cron updates to `"0 6 * * 0"` (Sundays).
4. If a weekly run finds HIGH or MEDIUM → **automatic revert to daily** (counter resets).
5. `workflow_dispatch` runs always run regardless of schedule mode.
6. History array stores last 30 days of `{ date, high, medium, low, autoFixes }` for trend tracking.

## Report Format

### GitHub Issue (Created Once, Updated Daily)

Title: `Audit Report — [DATE]` (or update existing pinned issue)

Sections:
1. **Status banner** — GREEN (clean) / YELLOW (MEDIUM) / RED (HIGH)
2. **Auto-fixes applied** — table of what was corrected with before/after values
3. **Findings requiring review** — table sorted by severity
4. **Completeness summary** — parks, restaurants, coverage percentages
5. **External check results** — scraper health, chain drift, stale data
6. **Graduation progress** — "Day X of 14" or "Weekly mode (stable since DATE)"
7. **Trend** — last 7 days mini-chart (HIGH/MEDIUM/LOW counts)

### Email Digest

Same content as GitHub Issue, HTML-formatted, sent to medpeds@gmail.com via Gmail API (same pattern as medical-briefer).

## Success Criteria

| Metric | Target |
|--------|--------|
| HIGH findings | 0 sustained |
| MEDIUM findings | 0 sustained |
| Auto-fixes per day | Trending to 0 |
| Nutrition coverage (calories > 0) | > 99% |
| Confidence score avg | > 50 |
| Chain data freshness | < 30 days |
| Time to detect regression | < 24 hours |
| Graduation to weekly | Within 30 days |

## Implementation Order

1. Database constraints (SQL migration — immediate protection)
2. `audit_log` table + trigger function
3. `accuracy.ts` (refactor from existing `audit-nutrition.ts`)
4. `completeness.ts` (new)
5. `auto-fix.ts` (extract from existing fix scripts)
6. `report.ts` (GitHub Issue + email)
7. `graduation.ts` (state management)
8. `pipeline.ts` (orchestrator)
9. `external.ts` (chain cross-reference + scraper health)
10. GitHub Actions workflow
11. Verify 3 consecutive successful runs
12. Enable daily schedule
