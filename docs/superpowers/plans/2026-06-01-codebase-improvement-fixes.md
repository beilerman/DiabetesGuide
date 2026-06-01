# Codebase Improvement Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the review findings around schema drift, local data clearing, CI coverage, PWA cache configuration, and dependency audit status.

**Architecture:** Keep fixes narrow and testable. Add static tests for repository-level contracts, regression tests for user-visible behavior, and configuration changes that follow existing Vite, Vitest, GitHub Actions, and Supabase migration patterns.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, GitHub Actions, Supabase SQL migrations, npm.

---

### Task 1: Supabase Migration Drift

**Files:**
- Modify: `scripts/__tests__/static-deployment-assets.test.ts`
- Create: `supabase/migrations/00003_nutritional_data_source_detail_and_alcohol.sql`

- [ ] Add a failing static test that concatenates `supabase/migrations/*.sql` and expects `source_detail` and `alcohol_grams`.
- [ ] Run `npx vitest run scripts/__tests__/static-deployment-assets.test.ts` and confirm it fails on the missing columns.
- [ ] Add an idempotent migration with `ALTER TABLE nutritional_data ADD COLUMN IF NOT EXISTS source_detail TEXT;` and `ADD COLUMN IF NOT EXISTS alcohol_grams NUMERIC;`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Clear All App Data Regression

**Files:**
- Modify: `src/pages/__tests__/Settings.test.tsx`
- Modify: `src/pages/Settings.tsx`

- [ ] Add a failing test that seeds every `LOCAL_APP_STORAGE_KEYS` entry, confirms clear, and expects all keys to be absent afterward.
- [ ] Run `npx vitest run src/pages/__tests__/Settings.test.tsx` and confirm `dg_preferences` remains.
- [ ] Change `handleConfirmClear` so it removes keys and clears preference effects without re-persisting default preferences.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Missing Pull Request Quality Gates

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] Add a PR/push workflow that runs `npm ci`, installs Chromium, then runs `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`.
- [ ] Run a YAML/text sanity check by inspecting `.github/workflows/ci.yml`.

### Task 4: Environment-Driven PWA Runtime Cache

**Files:**
- Modify: `vite.config.ts`
- Modify: `scripts/__tests__/static-deployment-assets.test.ts`

- [ ] Add a failing static test that rejects a hard-coded Supabase project host in `vite.config.ts`.
- [ ] Run `npx vitest run scripts/__tests__/static-deployment-assets.test.ts` and confirm it fails.
- [ ] Derive the Workbox URL pattern from `process.env.VITE_SUPABASE_URL`, falling back to a disabled regex when unavailable.
- [ ] Re-run the focused test and confirm it passes.

### Task 5: Dependency Audit

**Files:**
- Modify: `package-lock.json`

- [ ] Run `npm audit fix --package-lock-only`.
- [ ] Run `npm audit --omit=dev --audit-level=moderate` and confirm the production audit is clean.

### Task 6: Final Verification

**Commands:**
- `npm run lint`
- `npm test`
- `npm run build`
- `npx tsc -p tsconfig.scripts.json`
- `npm run test:e2e`
- `npm audit --omit=dev --audit-level=moderate`

- [ ] Run each command and inspect exit codes.
- [ ] Review `git diff --stat` and changed files.
