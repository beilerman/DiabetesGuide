---
date: 2026-06-09
topic: open-ideation
focus: Review this codebase and make it better
---

# Ideation: Open Codebase Improvement Review

## Codebase Context

- React 19 + TS + Vite SPA, PWA (vite-plugin-pwa) with IndexedDB offline layer (idb), Fuse.js search, React Query v5, React Router v7, Tailwind v4, Supabase read-only backend.
- 23 pages incl. resort hierarchy, trip planner, compare tray, insulin helper with hidden-dose triggers, favorites, settings. Strong test culture: 50+ unit test files, 15 Playwright e2e specs, axe a11y CI.
- Data pipeline: scrapers (Universal, Dollywood, Kings Island; AllEars Cloudflare-blocked), enrichers (USDA, Edamam, researched, Groq AI), mature audit suite with daily quality history.
- Latest quality snapshot: nutrition row 99.4%, calories 96.2%, carbs 98% — but **trustedCarbsPct 42.5%** (9,608 untrusted), allergens 34.8%, photos 0.3%, 105 orphans.
- Repo state at ideation time: `data/recategorize-audit` 18 commits ahead of main (0 behind), ~30 stale `codex/*`/`claude/*`/`review/*` branches. No `docs/solutions/`. CLAUDE.md significantly stale vs. actual tree.

## Ranked Ideas

### 1. Trusted-Carbs Pipeline (42.5% → 70%+)
**Description:** (a) Import chain-official nutrition (Starbucks, Earl of Sandwich, Blaze, Wetzel's, Jamba — already cataloged in CLAUDE.md); (b) popularity-prioritized verification queue so high-traffic items get researched data first; (c) CI gate failing on `trustedCarbsPct` regression (daily quality history already exists to power it).
**Rationale:** Carbs drive insulin doses; untrusted carbs on 9,608 items is the biggest gap between this app and a genuinely safe tool.
**Downsides:** Per-chain importer effort; popularity needs a proxy (no analytics).
**Confidence:** 85%
**Complexity:** Medium-High
**Status:** Explored (brainstorm started 2026-06-09)

### 2. Dosing-Point Safety UX
**Description:** Show trust at the insulin calculation: warn when meal-cart carbs include low-confidence estimates; present estimated carbs as ranges (±) not points; add high-fat-meal → delayed BG rise / extended-bolus education note.
**Rationale:** Highest-stakes surface in the app; honest uncertainty presentation is a genuine safety improvement.
**Downsides:** Range math needs care; alert-fatigue risk.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 3. Ship & Prune (repo hygiene)
**Description:** Merge `data/recategorize-audit` (18 commits incl. safety hardening + a11y fixes sitting undeployed), prune ~30 merged/stale branches, verify migration 00002 (UNIQUE constraint) is applied.
**Rationale:** Finished safety/a11y work isn't reaching users; branch noise slows every agent session.
**Confidence:** 95%
**Complexity:** Low
**Status:** Explored (selected for execution 2026-06-09)

### 4. Static Catalog Snapshot Architecture
**Description:** Generate the catalog + prebuilt search index as static JSON at deploy time (CDN-served); Supabase becomes pipeline-only. Removes keepalive cron, runtime DB dependency, 3000-item cap; makes offline trivial.
**Rationale:** Runtime shape (live DB reads + keepalive hack) fights the data's actual shape (static, weekly updates).
**Downsides:** Large refactor of queries/offline layer; data fixes no longer live instantly.
**Confidence:** 60%
**Complexity:** High
**Status:** Unexplored

### 5. Venue-Level Diabetes-Friendliness Grades
**Description:** Roll per-item grades up to restaurants ("Casey's Corner: C — mostly high-carb, 2 low-carb options") on venue cards and park pages.
**Rationale:** Matches how families plan ("where to eat" before "what to order"); reuses GradeLegend machinery.
**Downsides:** Aggregation formula needs thought (menu size skew, beverage-heavy venues).
**Confidence:** 70%
**Complexity:** Medium
**Status:** Unexplored

### 6. CLAUDE.md Refresh
**Description:** Rewrite project CLAUDE.md against the current tree — it predates the resort hierarchy, trip plan, offline layer, audit suite, and scripts archive.
**Rationale:** Heavily agent-developed repo; stale docs mislead every future session — compounding leverage.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 7. Supabase-Generated TypeScript Types
**Description:** Replace hand-written DB interfaces with `supabase gen types typescript`, wired into CI so schema drift fails the build.
**Rationale:** App + pipeline share a schema enforced only by convention.
**Downsides:** One-time import refactor; CLI access in CI.
**Confidence:** 75%
**Complexity:** Low-Medium
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | CGM / glycemic-index guidance | No data source; medical risk too high |
| 2 | i18n / Spanish support | Large effort vs. unclear demand |
| 3 | Expanded allergen inference | Inferred allergen data creates false security — safety concern |
| 4 | Photo coverage push | 0.3% coverage, low diabetes-value |
| 5 | User-submitted corrections | Spam/no-auth issues; weaker than fixing data at source |
| 6 | Script consolidation | Already done (scripts/archive, May 2026) |
| 7 | Visual regression tests | e2e coverage already strong; lower value than survivors |
| 8 | Kings Island scraper drift detector | Niche relative to survivors |
| 9 | Trip plan PDF export | jspdf already present; likely exists or near-done |
| 10 | Weekly sync results as PRs | Folded into repo-hygiene practices |
| 11 | Prebuilt search index alone | Folded into idea #4 |
| 12 | CI trust-regression gate alone | Folded into idea #1 |
| 13 | docs/solutions learnings practice | Process change, not product improvement |

## Session Log
- 2026-06-09: Initial ideation — ~30 candidates generated, 7 survived. User selected #3 (Ship & Prune) for immediate execution.
- 2026-06-09: Ship & Prune executed — PR #33 CI failure root-caused (PWA service worker bypassing Playwright route mocks on slow CI runners; fixed with `serviceWorkers: 'block'`), branch updated with main (quality-history conflict resolved keeping both sides), 24 local + 22 remote merged branches pruned, migration 00002 re-verified (0 duplicates across 17,306 items). PR #33 auto-closed by base-branch pruning (stacked PR); replaced with PR #34, merged to main (4a0ed88), main CI green.
- 2026-06-09: Idea #1 (Trusted-Carbs Pipeline) selected — brainstorm started.
