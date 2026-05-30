# DiabetesGuide — Clean Compound Review (main @ 10c02b2)

Date: 2026-05-30. Performed AFTER resetting local main to the real `origin/main`
(118 commits of merged "codex" work) and removing stale `.worktrees/` that were
corrupting test runs and file reads.

## Baseline (verified green on real main)
- `tsc -b` ✅ · `eslint .` ✅ · `npm run build` ✅ · `vitest run` ✅ 216 suites / 0 fail

## Verdict
The codex-merged main is **architecturally sound, not "garbage."** Clean
two-file data-access seam (only `queries.ts` + `offline-queries.ts` import the
supabase client), pure tested `lib/` modules, strong security posture, and the
safety-critical insulin engine (`lib/insulin.ts`) is the best-built module
(range-validated, NaN-guarded, blocks over-max, IOB reduces correction only,
activity reduces carb bolus only). Keep the architecture; the work needed is
**consolidation + a few concrete bug fixes**, not rework.

## Findings (agreed across security / TS / perf / races / architecture / simplicity agents)

### P1 — correctness/race
- **useFavorites is the only state hook NOT on the shared-store pattern.** Plain
  per-instance `useState` + write-on-change effect, mounted in 8 components at
  once. Two co-resident instances silently clobber each other's writes → a
  favorited item's heart hollows out / curated "safe foods" list loses entries.
  Fix: convert to the module-level shared-store+listener pattern already used by
  `useMealCart`/`useTripPlan`/`useCompare`. Add multi-instance regression tests.

### P2 — correctness
- **Settings "Clear all app data" key list is incomplete.** `LOCAL_APP_STORAGE_KEYS`
  in `Settings.tsx` omits `dg_estimator_acknowledged_v1` and
  `dg_menu_item_counts_by_park_v1`, so a privacy-sensitive health app leaves data
  behind after a user clears it. Fix: centralize all `dg_*` keys in one
  `lib/storage-keys.ts` registry and derive the clear-list from it.
- **No cross-tab `storage` listener on any state hook.** Two open tabs (or a
  same-tab "clear data") silently clobber each other. Fix: one `storage`
  listener per store re-reading + notifying; wire Settings-clear to `__reset*`.
- **useOfflineStatus `getLastSync()` has no cancellation.** Connectivity flaps
  (in-park mobile) → out-of-order resolution shows a stale "synced" time +
  setState-after-unmount. Fix: cancellation token in the effect.
- **IndexedDB `items` index keyPath `restaurant.park.id` silently drops rows**
  whose nested join is null; offline park-scoped reads under-return and disagree
  with offline search (which has a `park_id` fallback). No `DB_VERSION` migration
  path exists. Fix: store a flat `park_id` on cached items and index that; add
  DB_VERSION migration/clear-on-shape-change.
- **Alcohol fidelity gap (data → dose).** `alcohol_grams` is in the schema and on
  the card/detail/filter, but NOT threaded through meal/trip/favorites grade
  paths, and `MealItem` has no `alcoholGrams` field (not summed in
  `computeTotals`). A cocktail in a meal is graded/totaled as zero-alcohol and
  feeds the insulin estimator under-represented. Fix: add `alcoholGrams` to
  `MealItem`, carry it through add-to-meal, sum it, feed the meal grade; add one
  shared `gradeFromNutrition(nd)` helper so grade inputs can't drift per surface.
- **Perf: location-view Browse renders ALL items, no windowing.** Default view
  groups up to 3,000 items and mounts every card (list view correctly slices to
  48). `MenuItemCard` is not `React.memo`'d and recomputes grade/annotations/
  confidence every render. `useMenuItemCounts` on Home pages ~9,261 rows the
  static catalog preview already covers (give it a long `staleTime`). Fix:
  window/virtualize location view (or default all-parks to list), memo the card +
  its derivations, lean on the preview for Home counts.
- **Multi-cache consolidation.** React Query + IndexedDB + Workbox SW + static
  preview overlap with 4 different TTLs and no single invalidation chokepoint.
  Not broken (source-of-truth ordering is coherent) but hard to reason about.
  Direction: narrow Workbox to app-shell/assets so there's one offline-data path;
  document the layering.

### P2/P3 — duplication / hygiene
- **Nutrition thresholds duplicated 3×** (nutrition-colors.ts `*Color`,
  MenuItemCard `*Dots`, grade.ts bands) — already drift in output type; one
  `NUTRITION_THRESHOLDS` + `level(metric,value)` source.
- **Two resort theme systems** (`park-themes.ts` vs `resort-config.ts`) with
  DIFFERENT hex for the same resort (WDW indigo vs purple) depending on which
  screen imports — pick one registry. Plus 3 emoji/icon maps.
- **Dead code:** `useCurrentTheme.ts` (zero consumers — verified). `Favorites.tsx`
  + `/favorites` route reachable only by direct URL (nav points to `/plan`'s
  Favorites tab which supersedes it) — redirect `/favorites` → `/plan`, delete page.
- **`getNutrition()` helper created but adopted in only 5 of ~14 sites** — finish
  or delete.
- **~10 MB regenerable JSON tracked in git** (`audit-dump.json` 7.7MB,
  `audit-report.json` 2.5MB, `full-audit-report.json`) + 31 `docs/screenshots/*.png`
  — `git rm --cached` + gitignore.
- **Persisted-state versioning inconsistent** — only `useTripPlan` has a
  versioned key + migrate-on-read; apply that discipline app-wide.

### Security — strong, only hardening notes
- Browser bundle uses anon key only; RLS SELECT-only on all tables; no XSS sinks;
  Contact page takes no user input; `?carbs=` is numeric-coerced. Confirmed clean.
- P2: real W-9 PII (`data/w9-output/` — name/address/SSN-adjacent) sits UNTRACKED
  but on local disk in this repo; gitignored and never committed, but should be
  removed and the tooling relocated to the `taxes/` project (todo 037).
- P3: `exec_sql` RPC helper (static DDL only, service-role only) — verify not
  granted to anon and retire in favor of migrations. LLM nutrition pipeline
  ingests scraped text but output is range-validated before any DB write.

## Recommended sequencing (when tooling is reliable)
1. Hygiene/safe: untrack audit JSONs+screenshots; delete `useCurrentTheme.ts`;
   complete Settings clear-data key registry; useOfflineStatus cancellation token.
2. Correctness: convert `useFavorites` to shared store (+tests); cross-tab
   `storage` listeners; flat `park_id` IndexedDB index + DB_VERSION migration.
3. Dedup: one nutrition-threshold source; one resort theme/emoji registry;
   redirect `/favorites`→`/plan`.
4. Larger: alcohol→MealItem→meal-grade→dose fidelity; Browse virtualization +
   MenuItemCard memo; cache-layer consolidation. Each its own PR with tests.

## Process note
This review is trustworthy (6 agents, each verified paths against real `src/` on
HEAD 10c02b2 in their own contexts). The earlier same-session confusion came from
working on a STALE local main (118 commits behind) with leftover codex
`.worktrees/` that made Glob/Read return duplicate/!corrupted file content. Those
worktrees are now removed. PRs #26 and #27 (built on the stale base) were closed;
their branches remain on origin for reference.
