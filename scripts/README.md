# scripts/

Data-pipeline tooling for DiabetesGuide. **Only the entry points below are live.**
One-off data-repair scripts from the cleanup sprint live in `archive/` (kept for
reference; not wired into anything). Do not add new one-offs to this root — put
throwaway investigation scripts in `archive/` or delete them.

## Typecheck

The active pipeline is typechecked separately from the app:

```bash
npx tsc -p tsconfig.scripts.json --noEmit
```

## Live entry points

### Weekly menu sync (`.github/workflows/weekly-menu-sync.yml`)

| npm script | File | Purpose |
|-----------|------|---------|
| `scrape:all` | `scrape-all.ts` | Orchestrates the scrapers (sequential subprocesses) |
| `scrape:universal` | `scrapers/universal.ts` | Universal Orlando (official JSON) |
| `scrape:dollywood` | `scrapers/dollywood.ts` | Dollywood (Puppeteer, bounded concurrency) |
| `scrape:kings-island` | `scrapers/kings-island.ts` | Kings Island (Algolia + Puppeteer) |
| `scrape:dfb` | `scrapers/dfb-puppeteer.ts` | Disney Food Blog photos |
| `sync:merge` | `sync/merge.ts` | Cross-reference scraped data with the DB (in-memory index) |
| `sync:estimate` | `sync/estimate-nutrition.ts` | Keyword nutrition estimate for new items |
| `sync:report` | `sync/generate-diff.ts` | Human-readable diff report |
| `sync:approve` | `approve.ts` | Gated import (`--auto` = high-confidence only) |
| `sync:approve:all` | `approve.ts --all` | Import everything (manual, unsafe) |

### Daily audit (`.github/workflows/daily-audit.yml`)

`audit/` is a self-contained, unit-tested subsystem. Entry points: `audit:pipeline`,
`audit:accuracy`, `audit:completeness`, `audit:external`, `audit:autofix`,
`audit:report`, `audit:graduation`, `audit:migrate`.

### Enrichment / maintenance (run as needed)

`seed`, `import:all`, `enrich:nutrition`, `enrich:allergens`, `enrich:allears`,
`enrich:dfb`, `estimate:ai`, `import:ai`, `import:manual-nutrition`, `keepalive`,
`catalog:preview`, `fix:public-qa-data`.

`import:manual-nutrition` reads `data/manual-nutrition-estimates.json` and uses the
same dry-run/apply semantics as `import:ai`. Use it for ID-specific researched or
recipe-computed values that should be traceable in git before being written to
Supabase.

`ai:candidates -- --priority-slice` generates a no-write, dosing-impact ordered
verification queue for the audit `prioritySlice` denominator (entrees/desserts at
WDW/Universal/Disneyland). Under this flag the confidence gate defaults to 70
(the dosing-grade bar) instead of 45, so the whole sub-dosing band is queued;
items without a usable description are still skipped (research needs grounding).
It writes JSON batches to `data/ai-batches/` for manual/agent research before
any `import:ai -- --apply` step. Batches are wiped and renumbered on every run —
don't resume an in-flight campaign by batch number after regenerating.

## Safety notes

- Scheduled jobs record metadata receipts with required step outcomes. The daily
  audit continues independent diagnostics, then fails if any required stage
  failed/skipped and commits results only on complete runs. Artifacts upload on
  failures too. This status does not prove that any mail or DB operation inside
  a successful stage completed; those entry points need their own effect receipts.
- Weekly sync validates Supabase configuration, clears old JSON only in its
  disposable CI checkout, and requires complete, fresh, dated scrape results and
  at least 100 items before merge/automated approval. Partial or HTTP 403 failures
  block the run; they are never bypassed. A healthy scrape with no DB changes is
  still a complete run. `workflow-guard.mjs prepare` deletes old local scrape JSON;
  use it only in a disposable checkout.
- Offline guard fixtures: `node --test scripts/sync/workflow-guard.test.mjs`.
  They call pure validation functions, use no credentials/network, and write no
  catalog files. Cron times remain UTC; Eastern local times shift with DST and
  GitHub dispatch can be delayed. `*/3` day-of-month resets monthly, rather than
  providing an exact 72-hour interval.
- **`approve.ts` writes to production.** `--auto` applies the confidence gate and a
  volume circuit-breaker (`AUTO_APPROVE_MAX_ITEMS`, default 1500). `--all` bypasses
  the gate — never wire it into CI.
- Scraped text is validated/sanitized in `scrapers/utils.ts` (`sanitizeText`,
  `coerceCategory`, `clampInt`, `clampPrice`, `isSafePhotoUrl`) before any DB write.
- Scrapers exit non-zero on a zero-item run so a silently-broken scraper fails CI.
- DB uniqueness is backstopped by `supabase/migrations/00002_menu_items_dedup_constraint.sql`
  (apply it in the Supabase SQL Editor).
