# Production Readiness Audit System - Design Document

**Date:** 2026-02-22
**Status:** Approved
**Author:** Claude Code (with user collaboration)

## Executive Summary

This document describes a comprehensive production readiness audit system for the DiabetesGuide database. The system validates data completeness, correctness, detects duplicates, and assesses coverage gaps before production deployment.

**Key Features:**
- Modular architecture with 5 independent audit modules
- Tiered fixing strategy (auto-fix, fix scripts, manual review)
- Multi-format reporting (JSON, Markdown, CSV)
- Data-driven threshold recommendations
- Graceful error handling and rollback mechanisms

**Goals:**
1. Detect missing items (data gaps and menu coverage)
2. Identify incorrect data (classification, relationships, formats)
3. Eliminate duplicates using tiered detection (exact, fuzzy, semantic)
4. Recommend production readiness thresholds based on current state

---

## Architecture Overview

### Core Structure

```
scripts/audit/
├── production-audit.ts              # Main orchestrator
├── modules/                          # Independent audit modules
│   ├── completeness-audit.ts        # Missing fields, data gaps
│   ├── correctness-audit.ts         # Wrong categories, broken FKs
│   ├── duplicate-audit.ts           # Tiered duplicate detection
│   ├── coverage-audit.ts            # vs scraped data comparison
│   └── threshold-recommender.ts     # Smart threshold calculation
├── fixers/
│   ├── auto-fix-trivial.ts          # Exact dupes, format fixes
│   ├── generate-fix-scripts.ts      # Medium-risk fixes
│   └── flag-manual-review.ts        # High-risk issues
├── reports/
│   ├── json-reporter.ts             # Machine-readable output
│   ├── markdown-reporter.ts         # Human-readable summary
│   ├── csv-reporter.ts              # Spreadsheet export
│   └── summary-dashboard.ts         # Terminal output
└── shared/
    ├── types.ts                      # Shared interfaces
    ├── db-client.ts                  # Supabase wrapper
    ├── severity.ts                   # Severity level enums
    └── string-similarity.ts          # Fuzzy/semantic matching
```

### Module Interface Contract

```typescript
interface AuditModule {
  name: string
  description: string
  run(context: AuditContext): Promise<Finding[]>
}

interface AuditContext {
  parks: Park[]
  restaurants: Restaurant[]
  menuItems: MenuItem[]
  nutritionalData: NutritionalData[]
  allergens: Allergen[]
  scrapedData?: ScrapedMenu[]
}

interface Finding {
  id: string                    // UUID for tracking
  module: string                // Which module generated this
  severity: Severity            // CRITICAL | HIGH | MEDIUM | LOW | INFO
  category: string              // e.g., "duplicate", "missing_field"
  item_id?: string              // FK to menu_items
  restaurant_id?: string        // FK to restaurants
  park_id?: string              // FK to parks
  message: string               // Human-readable issue description
  current_value?: any           // What's wrong now
  suggested_fix?: any           // Proposed correction
  auto_fixable: boolean         // Can this be safely auto-fixed?
  fix_script?: string           // Generated fix code
  metadata?: Record<string, any>
}
```

### Execution Flow

1. **Initialize** - Load env vars, create Supabase client, create output directory
2. **Fetch All Data** - Single pass through all tables with pagination
3. **Load Scraped Data** - Read `data/scraped/*.json` files for coverage comparison
4. **Run Audits (Parallel)** - Execute all modules concurrently via Promise.all
5. **Aggregate Findings** - Merge, deduplicate, sort by severity
6. **Apply Auto-Fixes** - Execute trivial fixes immediately (with confirmation)
7. **Generate Fix Scripts** - Create fix scripts for medium-risk issues
8. **Flag Manual Review** - Highlight high-risk items needing human judgment
9. **Calculate Thresholds** - Analyze current state vs best practices
10. **Generate Reports** - JSON + Markdown + CSV + terminal summary

---

## Module Specifications

### 1. Completeness Audit

**Purpose:** Detect missing critical data that would degrade user experience.

**Checks:**
- Missing nutrition data (categorized by food type)
- Missing descriptions (higher priority for complex dishes)
- Missing prices (flag by park, Dollywood expected)
- Missing photos (informational only)
- Missing allergens (flag high-allergen categories)
- Sparse restaurants (< 5 items may indicate incomplete data)
- Missing restaurants (parks with suspiciously low counts)

**Severity Assignment:**
- CRITICAL: Entrees with no nutrition, restaurants with 0-2 items
- HIGH: Sides/desserts with no nutrition, missing descriptions on complex dishes
- MEDIUM: Missing prices (non-Dollywood), sparse restaurants (3-4 items)
- LOW: Missing photos, missing allergen data
- INFO: Zero-cal beverages with null nutrition (expected)

---

### 2. Correctness Audit

**Purpose:** Detect data that exists but is incorrect or implausible.

**Classification Errors:**
- Wrong category (keyword patterns + nutrition profile)
- Wrong vegetarian flag (contains meat keywords, exclude plant-based terms)
- Wrong fried flag (check "fried"/"crispy" keywords + fat > 40% calories)

**Relationship Errors:**
- Orphaned items (invalid restaurant_id)
- Orphaned restaurants (invalid park_id)
- Orphaned nutrition (invalid menu_item_id)
- Items in wrong restaurant (name pattern detection)

**Format Errors:**
- Invalid prices (negative, > $500, suspiciously round)
- Broken photo URLs (pattern validation, sample 404 checks)
- Invalid coordinates (lat/lon out of range)
- Malformed descriptions (>500 chars, HTML tags, encoded entities)

**Severity Assignment:**
- CRITICAL: Broken FK relationships
- HIGH: Wrong category affecting dietary filters
- MEDIUM: Wrong fried flag, invalid prices, wrong restaurant
- LOW: Malformed descriptions, broken photo URLs

---

### 3. Duplicate Audit

**Purpose:** Detect duplicate items at three levels of strictness.

**Tier 1 - Exact Duplicates (HIGH):**
- Same restaurant + same normalized name (lowercase, trim, collapse whitespace)
- Auto-mergeable if nutrition matches

**Tier 2 - Fuzzy Matches (MEDIUM):**
- Same restaurant + Levenshtein distance (85% similarity threshold)
- Catches typos, pluralization, spacing differences
- Generate merge script for user review

**Tier 3 - Semantic Duplicates (LOW):**
- Same restaurant + similar descriptions/nutrition profiles
- Description embedding similarity + nutrition within 10%
- Flag for manual review (may be legitimate variants)

**Special Cases:**
- Cross-restaurant duplicates (same item at multiple restaurants)
- Seasonal vs permanent variants (not duplicates)

---

### 4. Coverage Audit

**Purpose:** Compare production database against scraped real-world menu data.

**Data Sources:**
- `data/scraped/universal-*.json`
- `data/scraped/dollywood.json`
- `data/scraped/kings-island.json`
- `data/scraped/allears-*.json` (when available)

**Checks:**
- Missing items (in scraped data but not in DB)
- Extra items (in DB but not in scraped data, may be removed)
- Restaurant gaps (restaurants in scraped data not in DB)
- Stale data detection (updated_at > 6 months old)

**Scraper Refresh Triggers:**
- > 20 missing items at a park → recommend `npm run scrape:[park]`
- > 5 missing restaurants → recommend `npm run scrape:[park]`

**Severity Assignment:**
- HIGH: Missing major restaurants, >50 missing items
- MEDIUM: 10-50 missing items, suspected stale data
- LOW: <10 missing items, extra items in DB

---

### 5. Threshold Recommender

**Purpose:** Analyze current database state and recommend production readiness thresholds.

**Metrics Calculated:**
- Nutrition coverage rate (% items with non-null calories)
- Description coverage rate (% items with descriptions)
- Duplicate rate (% items flagged as duplicates)
- Critical error rate (% items with CRITICAL findings)
- Restaurant completion score (avg items per restaurant)

**Benchmark Comparisons:**
- Food databases: 90%+ nutrition, <1% duplicates
- Restaurant apps: 80%+ descriptions, <2% bad data
- Theme park apps: 75%+ nutrition, <5% missing items

**Output:**
- Current metrics vs recommended thresholds
- Pass/Fail/Conditional Pass status
- Blocking issues preventing full PASS
- Improvement priorities (ranked by user impact)

---

## Fixer System

### Three-Tier Fixing Strategy

**Tier 1: Auto-Fix Trivial Issues**

**Eligible:**
- Exact duplicates (merge to most complete record)
- Format errors (whitespace, HTML entities, case normalization)
- Broken FK cleanup (delete orphaned records)

**Safety Mechanisms:**
- Confirmation prompt (type "yes" to proceed)
- Transaction wrapping (rollback on error)
- Backup logging (`audit/auto-fix-backup-[timestamp].json`)
- Dry-run mode (default, requires `--apply` flag)

---

**Tier 2: Generate Fix Scripts**

**Eligible:**
- Fuzzy duplicates (similar names)
- Wrong categories (high-confidence corrections)
- Wrong vegetarian/fried flags (pattern-based)
- Invalid prices (suspected errors with suggestions)

**Generated Files:**
- `audit/fixes/fix-[category]-[timestamp].ts` - Executable script
- `audit/fixes/fix-[category]-[timestamp].json` - Machine-readable manifest
- `audit/fixes/README.md` - Index of all fix scripts

**User Workflow:**
1. Review `audit/fixes/README.md`
2. Run script with `--dry-run`
3. If satisfied, run with `--apply`
4. Results logged to `fix-[category]-[timestamp]-results.json`

---

**Tier 3: Flag Manual Review**

**Eligible:**
- Semantic duplicates (may be legitimate variants)
- Wrong restaurant assignments (complex judgment)
- Major nutrition discrepancies (>50% off)
- Suspected removed items (may be seasonal)
- Ambiguous category corrections (low confidence)

**Output:**
- `audit/manual-review-[timestamp].md` - Human-readable review guide
- `audit/manual-review-[timestamp].json` - Machine-readable issue list

---

### Rollback & Recovery

**Backup Strategy:**
- Export affected records before auto-fix
- Include full record state + FK relationships
- Store in `audit/backups/pre-fix-[timestamp].json`

**Rollback Script:**
- Generated at `audit/backups/rollback-[timestamp].ts`
- Re-inserts deleted records
- Restores original values for updated records

---

## Reporting System

### 1. JSON Reporter

**File:** `audit/production-audit-[timestamp].json`

**Structure:**
- metadata (audit version, timestamp, execution time, DB snapshot)
- summary (total findings, by severity, by module, fix counts)
- findings (full array of Finding objects)
- thresholds (current metrics, recommendations, pass/fail status)
- fix_summary (auto-fixes applied, scripts generated, manual review)

**Use Cases:**
- CI/CD gating
- Trend tracking over time
- Integration with monitoring systems

---

### 2. Markdown Reporter

**File:** `audit/production-audit-[timestamp].md`

**Sections:**
- Executive Summary (status, key metrics table)
- Findings by Severity (counts, percentages)
- Module Results (detailed breakdown per module)
- Production Readiness Thresholds (current vs targets)
- Improvement Priorities (ranked by impact)
- Next Steps (actionable commands to run)
- Files Generated (list of all output files)

**Use Cases:**
- Human review and decision-making
- Sharing with stakeholders
- Documentation of audit results

---

### 3. CSV Reporter

**File:** `audit/production-audit-[timestamp].csv`

**Columns:**
```
finding_id, module, severity, category, park, restaurant, item_name,
item_id, message, current_value, suggested_fix, auto_fixable, fix_script
```

**Use Cases:**
- Sort/filter in Excel/Google Sheets
- Share with content team for manual entry
- Track fix progress (mark rows as "DONE")

---

### 4. Summary Dashboard

**Output:** Console + `audit/production-audit-[timestamp]-summary.txt`

**Format:**
- ASCII box drawing with emojis
- Database snapshot
- Audit results (timing, fix counts)
- Severity breakdown (with bar charts)
- Production readiness status
- Next steps (numbered action items)
- Generated files list

**Use Cases:**
- Quick feedback during audit run
- Terminal output for CI/CD logs

---

## Error Handling & Performance

### Error Handling

**Graceful Degradation:**
- Failed modules don't crash entire audit
- Use Promise.allSettled for module execution
- Log errors and generate partial results
- Add module_failure finding for failed modules

**Database Error Handling:**
- Retry connection failures (3 times, exponential backoff)
- Query timeouts (30s default, log slow queries >10s)
- Rate limiting (pause 60s on 429, then retry)
- Transaction rollback on error

**Data Validation:**
- Validate loaded data before processing
- Skip invalid records with warnings
- Count skipped records in summary

---

### Performance Optimizations

**Data Loading:**
- Single fetch pass (load all data once)
- Pagination (500 items per page)
- Selective loading (only needed fields)
- Parallel table loading (Promise.all)

**Duplicate Detection:**
- Exact: Hash-based O(n)
- Fuzzy: Group by restaurant first (only compare within restaurant)
- Semantic: Optional, cache embeddings to disk

**Report Generation:**
- Write reports in parallel
- Stream CSV writing for large datasets
- Compress JSON if > 5MB

**Estimated Timing:**
- Database fetch: 8-12s
- Module execution: 15-25s (parallel)
- Report generation: 3-5s
- Fix application: 2-4s
- **Total: 30-50 seconds**

---

## Testing Strategy

### Unit Tests (Vitest)
- Test each module independently with fixture data
- Coverage goals: 50+ tests across all modules
- Completeness: 10 tests
- Correctness: 15 tests
- Duplicates: 12 tests
- Coverage: 8 tests
- Thresholds: 5 tests

### Integration Tests
- Test full orchestrator with small test database
- Verify no crashes, all reports generated, timing < 60s

### Snapshot Tests
- Test report format stability
- Verify Markdown/JSON output matches expected format

### Manual Testing Checklist
- Run on production DB (read-only)
- Verify all modules complete
- Check reports are accurate
- Test auto-fix (dry-run and apply)
- Verify rollback works
- Test fix script generation
- Review manual review report
- Test error handling scenarios

---

## Deployment & Maintenance

### Initial Deployment
1. Create `scripts/audit/` directory structure
2. Implement modules incrementally (start with completeness)
3. Run against production DB in read-only mode first
4. Get stakeholder sign-off on report format
5. Enable auto-fix only after manual verification

### Ongoing Maintenance
- Run audit weekly (GitHub Actions cron)
- Track metrics over time (store results in git)
- Update thresholds as database matures
- Add new modules as requirements evolve

### GitHub Actions Integration
```yaml
name: Weekly Production Audit
on:
  schedule:
    - cron: '0 10 * * MON'  # Every Monday
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx tsx scripts/audit/production-audit.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      - uses: actions/upload-artifact@v3
        with:
          name: audit-reports
          path: audit/production-audit-*.{json,md,csv}
```

---

## Success Criteria

### Functional Requirements
- ✅ Detects missing data (nutrition, descriptions, prices, photos, allergens)
- ✅ Identifies incorrect data (categories, flags, relationships, formats)
- ✅ Finds duplicates (exact, fuzzy, semantic)
- ✅ Compares coverage vs scraped data
- ✅ Recommends production readiness thresholds

### Non-Functional Requirements
- ✅ Executes in < 60 seconds
- ✅ Handles errors gracefully (no crashes)
- ✅ Provides rollback mechanism
- ✅ Generates human-readable reports
- ✅ Supports CI/CD integration

### Quality Gates
- 50+ unit tests with >80% coverage
- Integration tests pass
- Manual testing checklist complete
- Stakeholder approval of report format
- No false positives in auto-fix

---

## Future Enhancements

**Phase 2 (Post-Launch):**
- Photo quality audit (broken links, image dimensions)
- Pricing validation (outlier detection, chain consistency)
- Allergen accuracy (cross-reference ingredients)
- Seasonal item tracking (auto-flag stale seasonal items)

**Phase 3 (Advanced):**
- LLM-powered category correction (Groq API)
- Automated scraper scheduling (weekly runs)
- Real-time audit API endpoint (on-demand checks)
- Historical trend dashboard (metrics over time)

---

## References

- Existing audit infrastructure: `scripts/audit-nutrition.ts`, `scripts/check-duplicates.ts`
- Data quality memory: `.claude/projects/.../memory/MEMORY.md`
- CLAUDE.md project documentation
- Supabase schema: 5 tables (parks, restaurants, menu_items, nutritional_data, allergens)
