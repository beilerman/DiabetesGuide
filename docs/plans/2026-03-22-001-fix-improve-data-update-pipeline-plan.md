---
title: "fix: Improve data update pipeline"
type: fix
status: active
date: 2026-03-22
---

# fix: Improve data update pipeline

## Overview

The weekly menu sync pipeline was broken — the GitHub Actions workflow only ran the AllEars scraper (blocked by Cloudflare since late 2025), meaning no automated data updates were happening. Additionally, the approve script had no duplicate protection, merge read stale files, and there was no auto-approval path.

## Completed Work

### 1. Fixed weekly workflow (`.github/workflows/weekly-menu-sync.yml`)
- Replaced single AllEars scraper step with `scrape-all.ts` orchestrator
- Added scraped output check gate — skips merge/estimate/approve if no data
- Added `--auto` approval step for high-confidence items
- Installs Puppeteer browser for Dollywood/Kings Island scrapers

### 2. Created `scripts/scrape-all.ts` orchestrator
- Runs Universal, Dollywood, Kings Island scrapers sequentially
- DFB optional via `--skip-dfb` flag
- Cleans old scraped files (configurable `--clean-days=N`, default 30)
- Per-scraper error isolation (one failure doesn't kill pipeline)
- Exits 1 only if ALL scrapers fail
- Summary report with timing

### 3. Duplicate protection in `scripts/approve.ts`
- Added `findExistingMenuItem()` — checks normalized name match before insert
- Tracks and reports duplicate count separately from imports/errors

### 4. Auto-approve mode (`--auto` flag)
- Imports items with confidence >= 70 AND valid nutrition data
- Deferred items written back to `data/pending/` for manual review
- Used by weekly workflow for hands-off operation

### 5. Stale file filtering in `scripts/sync/merge.ts`
- Only reads scraped files from last 7 days (configurable via `MERGE_MAX_AGE_DAYS`)
- Logs skipped stale files

### 6. Updated `sync:full` npm script
- Now runs `scrape:all` instead of just `scrape:universal`
- Added `scrape:all` script entry

## Remaining Tasks

- [ ] Run `npm test` to verify no regressions (`scripts/approve.ts`, `scripts/sync/merge.ts`)
- [ ] Update CLAUDE.md with new scripts (`scrape-all.ts`, `--auto` flag, `scrape:all` npm script)
- [ ] Commit all changes

## Acceptance Criteria

- [ ] `npx tsc --noEmit --skipLibCheck` passes (verified)
- [ ] `npm test` passes
- [ ] Weekly workflow YAML is valid (uses all working scrapers)
- [ ] `approve.ts --auto` only imports high-confidence items
- [ ] `approve.ts` skips duplicates without error
- [ ] `merge.ts` skips files older than 7 days
- [ ] CLAUDE.md documents new scripts and patterns

## Files Changed

- `.github/workflows/weekly-menu-sync.yml` — rewritten
- `package.json` — added `scrape:all` script
- `scripts/scrape-all.ts` — new file
- `scripts/approve.ts` — duplicate protection + `--auto` mode
- `scripts/sync/merge.ts` — stale file filtering
