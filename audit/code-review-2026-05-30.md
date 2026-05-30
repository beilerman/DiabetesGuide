# Code Review — 2026-05-30

## Summary

Whole-codebase compound-engineering review (8 parallel specialist agents:
security, TypeScript/quality, performance, architecture, frontend-races,
data-integrity, simplicity, agent-native). Scope: the React 19 + TS + Vite SPA
in `src/`, the Supabase schema/migrations, and the `scripts/` data pipeline.

Headline: the codebase is in **good** shape for its threat model. No new
security P1s — the service-role key never reaches the browser or a subprocess,
no secrets/PII are tracked in git (W-9/FA2026 confirmed gitignored and absent
from history), and prior hardening (todos 021–028) holds. The app tier shows
real, test-backed separation of concerns and 173/173 tests pass.

The new findings cluster in three areas the prior reviews hadn't reached:
(1) a **performance cliff** — the documented 3,000-item fetch cap is *never
actually passed by any caller*, so the app routinely pulls and holds the entire
~9,261-row joined corpus, then feeds it to non-memoized, non-virtualized lists;
(2) **multi-instance state races** — `useFavorites` and `usePreferences` never
got the shared-store treatment the newer hooks have, so a diabetic's curated
favorites and carb-goal can silently revert; and (3) a **correctness bug on a
decision surface** — the comparison modal's mistyped metric key can flag the
wrong item as the "healthier choice."

This document is the canonical writeup. Each finding is tracked by a lightweight
`todos/{id}-{status}-{priority}-{slug}.md` file. New findings: **049–068**
(5 × P1, 7 × P2, 8 × P3).

### Cross-check / discarded findings

- **Root `audit-*.json` dumps tracked in git (flagged by 2 agents): CONFIRMED
  REAL → fixed (finding 069).** `git ls-tree HEAD` lists `audit-dump.json`
  (~7.4 MB), `audit-report.json` (~2.4 MB), and `full-audit-report.json`
  (~167 KB) as tracked, and they were **not** in `.gitignore`. (An earlier note
  in this doc wrongly called this a false positive — that was a transient
  mis-read caused by a review sub-agent's staged `git rm` that I later reverted;
  on a clean tree the files are unambiguously tracked.) Fixed: `git rm --cached`
  the three (kept on disk) and added them to `.gitignore`. ~10 MB removed from
  future history.
- Several agent findings duplicate existing ledger entries and are **not**
  re-filed: GitHub-Action SHA pinning (022), `?carbs` clamp (026), PDF name
  sanitization (027), dead-code/`NutritionRing` (029), localStorage schema
  versioning (033), theme config dup (034), nutrition-getter unification (035),
  script boilerplate shared lib (036), W-9 tooling move (037), one-shot script
  cleanup (038), constraints-as-migration (039), pipeline orchestrator (040),
  adjust-portions idempotency (041), drop `canvas` (042), auto-fix dry-run +
  source downgrade (043), import/approve upsert dedup (044), `bg=0` validation
  (047), menu-counts N+1 (048).

---

## Implementation status (same session, 2026-05-30)

Findings actioned this session; verified with `npm run lint` (clean),
`tsc -b` (pass), and `vitest run` (**184/184 pass**, 11 new tests).

| ID | Finding | Outcome |
|----|---------|---------|
| **049** | All-Parks fetch ignored the 3,000-item cap | **Fixed** — `useMenuItems` now passes `parkId ? {} : { limit: 3000 }` (per-park unbounded, all-parks capped). `src/lib/queries.ts:34` |
| **050** | `useFavorites`/`usePreferences` lost writes across mounted instances | **Fixed** — both converted to the module-level shared-store + listener-set pattern (matching `useMealCart`) with cross-tab `storage` sync. Added `useFavorites.test.tsx` + `usePreferences.test.tsx` (incl. multi-instance lost-write regression tests). |
| **052** | `npm run lint` red (set-state-in-effect) | **Fixed** — removed the redundant override-clearing effect in `Meal.tsx`; correctness already guaranteed by the derived `activeCarbOverride` guard. Lint now clean. |
| **060** | localStorage reads trusted `JSON.parse` shape | **Fixed** — `useFavorites` array/element-guards the parsed value; `usePreferences` sanitizes per-field (type + finite + non-negative carb goal). Covered by the new hook tests. |
| **061** | ParkDetail By-Land grouping did O(n·m) `restaurants.find` per item | **Fixed** — builds a `Map<id, Restaurant>` once; grouping is now O(n). `src/pages/ParkDetail.tsx` |
| **069** | ~10 MB regenerable `audit-*.json` dumps tracked in git | **Fixed** — `git rm --cached` the three root dumps (kept on disk) + added to `.gitignore`. |
| **051** | "Best choice" mistyped-key bug | **False positive** — live code already guards via `NaN`/`isNaN`; downgraded to a P3 type smell, no change. |

Remaining new findings (053–059, 062–068) left as pending ledger entries for triage.

> **Note on `git checkout`-reverted side work:** Two review sub-agents
> autonomously made out-of-scope edits during the run (a 134-file `scripts/`
> archival + W-9 tooling deletion, and a `useId` accessibility refactor of
> `AccessibilityControls.tsx`/`Settings.tsx`). Both were reverted to keep this
> batch surgical — they are real, sensible improvements but should be done as
> their own deliberate, tested changes (the script archival maps to ledger
> 037/038, and includes untracking the audit dumps which I did do here as 069).

---

## Findings

### 049 — "All Parks" fetch ignores the 3,000-item cap; pulls the whole ~9,261-row corpus (P1, performance)

**Status:** pending · **Effort:** M

**Problem.** `useMenuItems` calls `fetchMenuItemsOffline(parkId)` with no
options, so `limit` is `undefined` and the internal `cap` becomes `Infinity`.
The documented 3,000-item cap exists in code but is passed by **no** caller
(only the test file passes `limit`). On Browse/Search with "All Parks", the app
paginates the entire table via ~10 *sequential* `range()` round-trips of
fully-joined rows (nutrition + allergens + restaurant→park), then holds the
whole array in memory, writes it to IndexedDB, and feeds it to Fuse.js. This is
the single biggest perceived-perf issue on mobile.

**Fix.** Actually pass the cap for the all-parks path
(`fetchMenuItemsOffline(parkId, { limit: 3000 })`); parallelize the batches
(`Promise.all` over offsets once `count` is known) and trim the list-view
select (drop `allergens`/`description` until card expansion). Long-term: do
filtering/sorting server-side with indexed columns and paginate the UI.

**Files.** `src/lib/queries.ts:31-37`, `src/lib/offline-queries.ts:60,137-170`

---

### 050 — `useFavorites` and `usePreferences` lose writes across simultaneously-mounted instances (P1, race/data)

**Status:** pending · **Effort:** S

**Problem.** The two oldest hooks use a private `useState(load)` per call site
with a write-on-change effect — no shared module store, no `storage` listener.
Multiple components mount each hook at once (`usePreferences`: Header,
AccessibilityControls, Settings, Meal, MealCart; `useFavorites`: Browse,
Favorites, ParkDetail, Plan, Search, VenueMenu). The last writer wins the file
while every other stale instance keeps its old snapshot, so a later toggle from
a stale instance silently reverts the user's change. `carbGoal` feeds the
carb-goal progress bar and `highContrast` toggles a body class two instances
fight over (flicker for low-vision users). The newer hooks (`useMealCart`,
`useCompare`, `useTripPlan`) already do this correctly.

**Fix.** Promote both to the existing module-level shared-state + listener-set
pattern (one `sharedState`, one `Set<listener>`, write-once + notify). Add a
`window 'storage'` listener for cross-tab sync.

**Files.** `src/hooks/usePreferences.ts:19-26`, `src/hooks/useFavorites.ts:10-23`

---

### 051 — ComparisonModal "best choice" mistyped key (FALSE POSITIVE → downgraded P3)

**Status:** complete (verified no-op) · **Effort:** S

> **Correction (2026-05-30):** The original P1 below was filed against a
> corrupted file read. The *live* code already guards this: `getNumericValue`
> returns `NaN` for non-numeric/missing values, and `getBestIndex` does
> `if (isNaN(v)) continue` and `return isNaN(bestVal) ? -1 : bestIdx`. A
> missing/mistyped value can therefore **never** be flagged "best." No active
> bug exists. The only residual is a harmless type smell — the
> `key: keyof CompareItem | 'netCarbs' | 'grade'` union plus an
> `as keyof CompareItem` cast — where `'grade'` is unused as a metric key and
> `'netCarbs'` always routes through `format`. Optional P3 tightening; no code
> change made.

**Problem.** `MetricRow.key` is typed `keyof CompareItem | 'netCarbs' | 'grade'`,
but `'netCarbs'`/`'grade'` are not properties of `CompareItem`. `getValue` does
`item[metric.key as keyof CompareItem]`; the `as` launders away the mismatch, so
a future metric whose `key` is mistyped resolves to `undefined` and the function
returns `0`. `getBestIndex` then treats `0` as the lowest (best) carb/sugar/
sodium value and paints the green "best" dot on the wrong column. This is a
diabetes-decision surface — a typo silently highlights the less healthy item.

**Fix.** Drop the union hack. Split `MetricRow` into a discriminated union
(`{ kind: 'field'; key: keyof CompareItem }` vs
`{ kind: 'computed'; compute: (i) => number }`) so computed rows can't index
`CompareItem`, or require every derived row to carry a `format`/`compute` and
type `key` as a plain label string.

**Files.** `src/components/compare/ComparisonModal.tsx:38-67`

---

### 052 — `npm run lint` is red: set-state-in-effect in the dosing page (P1, quality/CI)

**Status:** pending · **Effort:** S

**Problem.** ESLint fails (exit 1) on the only lint error in the repo: a
`useEffect` in `Meal.tsx` that calls `setCarbOverride(null)` to clear a stale
override. The logic is already redundant — `activeCarbOverride` is derived
correctly on line 54 (`carbOverride?.mealId === activeMealId ? … : null`), so a
stale override can never reach `effectiveCarbs`. The effect costs an extra
render and breaks any CI gate on lint (the next person assumes a clean baseline).

**Fix.** Delete the effect (the derived guard makes it dead). Re-run
`npm run lint` to confirm clean.

**Files.** `src/pages/Meal.tsx:60-64`

---

### 053 — Offline data has three uncoordinated caches and an unversioned IndexedDB schema; can serve indefinitely-stale carb counts (P1, architecture)

**Status:** pending · **Effort:** M

**Problem.** Three caches sit on the same data with independent TTLs: React
Query in-memory (5-min stale), a best-effort IndexedDB write
(`writeAllItems(items).catch(()=>{})` — never invalidated, never aged out;
`getLastSync` is written but never *read* for staleness), and the Workbox
`supabase-api` runtime cache (24h `NetworkFirst`). On a SW cache hit the
IndexedDB fallback is bypassed; nothing reasons about "is the menu fresh." The
IndexedDB schema is `DB_VERSION = 1` with an upgrade fn that only *creates*
stores — when `MenuItemWithNutrition` changes shape (it has churned:
`alcohol_grams`, `source_detail`, `updated_at` were added), old PWA rows
deserialize with missing fields and the deep `restaurant.park.id` index can
break silently. For a nutrition tool feeding insulin decisions, a stale carb
count with no freshness signal is the worst failure mode.

**Fix.** Pick IndexedDB as the durable offline store; narrow/remove the SW
`/rest/` rule so the same payload isn't double-cached with conflicting TTLs.
Read `getLastSync` to drive a "data may be stale" note in `OfflineBanner`. Store
a `schemaVersion` in the `metadata` store and `clearOfflineData()` + refetch on
mismatch; treat `DB_VERSION` as a real migration lever tied to the type version.

**Files.** `src/lib/offline-db.ts`, `src/lib/offline-queries.ts`,
`vite.config.ts` (VitePWA), `src/main.tsx`

---

### 054 — `MenuItemCard` recomputes grade + annotations + confidence on every render, unmemoized (P2, performance)

**Status:** pending · **Effort:** S

**Problem.** Each card calls `summarizeConfidence`, `getGradeForItem`
(`computeScore`), and `getDiabetesAnnotations` directly in render, with no
`useMemo` and no `React.memo` on the component. Parents render a flat
`filtered.map(...)` of hundreds–thousands of cards, so any filter change — the
carbs slider fires `onChange` per pixel — re-runs all three derivations for
every mounted card per event. Classic input jank on mobile.

**Fix.** Wrap `MenuItemCard` in `React.memo`; `useMemo` the derived
grade/annotations/confidence keyed on `item.id`. Debounce the slider/search so
`applyFilters` isn't re-run per pixel (see also 007). Pair with 050 so toggling
one favorite doesn't invalidate `isFavorite` identity for all cards.

**Files.** `src/components/menu/MenuItemCard.tsx:67-96`, `src/pages/Browse.tsx`

---

### 055 — No list virtualization; thousands of heavy cards mount at once (P2, performance)

**Status:** pending · **Effort:** M

**Problem.** Browse and ParkDetail render one fairly heavy card (multiple SVGs,
4 DotMeter subtrees, badges) per item with no windowing. With 049 unfixed that's
~9,261 cards; even per-park views render hundreds. Tens of thousands of DOM
nodes drive mobile memory pressure (a leading cause of tab eviction) and
scroll-time layout/paint cost.

**Fix.** Introduce `@tanstack/react-virtual` (same ecosystem already in use) for
the Browse and ParkDetail lists. Interim: render-cap the visible set with a
"load more" sentinel.

**Files.** `src/pages/Browse.tsx:122-133`, `src/pages/ParkDetail.tsx:143-180`

---

### 056 — Offline timing: `lastSync` read races itself on connectivity flaps; cache writes interleave with reads and swallow quota failures (P2, race/integrity)

**Status:** pending · **Effort:** S

**Problem.** Two issues in the offline path. (a) `useOfflineStatus` runs
`getLastSync().then(setLastSyncState)` on every `isOnline` change with no
cancellation token or unmount guard; rapid offline↔online flaps (subway, park
Wi-Fi handoff) can land an older read last, showing a stale "synced N ago" in
the banner whose entire job is freshness. (b) `writeAllItems(items).catch(()=>{})`
is fire-and-forget; a fallback `readAllItems()` during a network drop can race a
half-written transaction, and a quota failure (9,261 rows is not small) is
silently swallowed — the offline cache quietly stops updating with no signal.

**Fix.** (a) Add a per-effect `active` token (or AbortController) and only set
state if still active. (b) Serialize cache writes through a single in-flight
promise chain (or await `tx.done` before any fallback read path), and replace
`.catch(()=>{})` with `.catch(err => console.warn('offline cache write failed', err))`.

**Files.** `src/hooks/useOfflineStatus.ts:21-23`,
`src/lib/offline-queries.ts:89,110,127,157`, `src/lib/offline-db.ts:77-94`

---

### 057 — `escapeSearch` strips characters instead of escaping them; online/offline search diverge (P2, correctness)

**Status:** pending · **Effort:** S

**Problem.** `escapeSearch` deletes `, ( ) ' "` rather than escaping them, so a
search for `Mac & Cheese (Large)` or `Mom's Pretzel` queries a *different*
string than typed — and the offline fallback uses the raw unescaped query, so
the two paths can return different results for the same input. Apostrophes are
common in menu names.

**Fix.** Escape rather than delete (PostgREST filter values can be wrapped in
double quotes to safely contain commas/parens), and apply identical
normalization to both the online `.or()` branch and the offline branch so they
agree.

**Files.** `src/lib/offline-queries.ts:75-77`

---

### 058 — Traffic-light thresholds duplicated across `nutrition-colors.ts` and `MenuItemCard` dot helpers (P2, quality)

**Status:** pending · **Effort:** S

**Problem.** The carb/sugar/calorie/sodium green/amber bands are encoded twice:
`nutrition-colors.ts` (`carbColor`/`sugarColor`/…, returns Tailwind classes) and
`MenuItemCard.tsx` (`carbDots`/`calDots`/…, returns color names). They agree
today only by manual coincidence; the next person who tunes the sugar amber cap
in one file creates a silent traffic-light/dot mismatch on the same card. (This
is the bad kind of duplication — magic numbers that must stay in lock-step.)

**Fix.** Define the bands once (e.g. `NUTRITION_LEVELS = { carbs:[30,60], … }`)
in `nutrition-colors.ts` and derive both the class function and the dot-color
function from it; move the `*Dots` helpers out of `MenuItemCard`.

**Files.** `src/components/menu/nutrition-colors.ts:1-23`,
`src/components/menu/MenuItemCard.tsx:24-46`

---

### 059 — Domain types declared 3+ times across the src/scripts boundary with no shared/generated source (P2, type-safety)

**Status:** pending · **Effort:** M

**Problem.** `MenuItem`/`NutritionalData`/`Restaurant`/`Park` are defined in
`src/lib/types.ts`, re-declared in `scripts/scrapers/types.ts` and
`scripts/audit/types.ts`, and re-declared ad hoc in ~15 top-level scripts
(`git grep "interface MenuItem"` → 15 files + types.ts). A Postgres column
rename must be hand-propagated to every copy; nothing fails fast if one is
missed. `scripts/lib/supabase-joins.ts` documents the rationale ("scripts don't
share a TS project with src/") — but that's the gap, not a justification.

**Fix.** Generate types from the DB (`supabase gen types typescript`) into one
file both `src/` and `scripts/` import, or add a tsconfig path so scripts import
`src/lib/types.ts` directly. Complements 036 (shared script helpers) and 045
(confidence constants).

**Files.** `src/lib/types.ts`, `scripts/scrapers/types.ts`,
`scripts/audit/types.ts`, ~15 `scripts/*.ts`

---

### 060 — Several localStorage reads trust `JSON.parse` shape without an array/element guard (P2, robustness)

**Status:** pending · **Effort:** S

**Problem.** `useMealCart`/`useTripPlan` do exemplary `unknown`→sanitize
parsing, but `getRecentSearches` (`Search.tsx`), `useFavorites` (`new Set(JSON.parse(...))`),
and `PackingList.tsx` do not — a corrupted `dg_recent_searches` holding
`{"x":1}` renders `[object Object]` chips; a non-iterable in favorites throws
inside the (caught) `try`. Inconsistent rigor across the persistence hooks.

**Fix.** Add a one-line guard mirroring the cart/trip hooks:
`Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []`.
Roll into 033's persistence-store work if done together.

**Files.** `src/pages/Search.tsx:12-19`, `src/hooks/useFavorites.ts:6`,
`src/pages/PackingList.tsx:16`

---

### 061 — `ParkDetail` By-Land grouping does an O(n·m) `restaurants.find` per item (P3, performance)

**Status:** pending · **Effort:** S

**Problem.** Inside the grouping loop each filtered item runs
`restaurants.find(r => r.id === item.restaurant_id)` — a linear scan per item
(items × restaurants), re-run whenever `filtered`/`restaurants` change. Pure
waste that adds to the per-filter compute budget already strained by 054.

**Fix.** Build a `Map<id, restaurant>` once (`useMemo` on `restaurants`) and
look up O(1).

**Files.** `src/pages/ParkDetail.tsx:48-59`

---

### 062 — `adjust-portions.ts` fetches without pagination; only the first ~1000 items get adjusted (P3, correctness)

**Status:** pending · **Effort:** S

**Problem.** Unlike its siblings, `adjust-portions.ts` reads all `menu_items`
with a nested join and no `.range()` pagination, relying on the implicit
PostgREST 1000-row default. With ~9,261 items it silently processes only the
first ~1000, leaving most of the catalog un-adjusted — making the script's
effect non-deterministic relative to catalog size. (Distinct from 041, which is
about idempotency.)

**Fix.** Use the canonical paginated `fetchAllItems()` helper from
`scripts/audit/utils.ts`.

**Files.** `scripts/adjust-portions.ts:201-207`

---

### 063 — `cleanup-duplicate-parks.ts` deletes parks with no `--dry-run` and weaker normalization than the canonical helper (P3, data-safety)

**Status:** pending · **Effort:** S

**Problem.** It's the one delete-script lacking a dry-run guard, and groups by
`lower().trim()` rather than the canonical `normalizeParkName`. Ordering is safe
(reassign restaurants, then delete 0-restaurant parks), but a mis-group from the
weaker normalization could delete the wrong canonical and CASCADE away its
restaurants. Every other dedup script (`fix-duplicate-parks`, `fix-duplicates`,
`remove-non-food-items`) has `--dry-run`.

**Fix.** Add `--dry-run` (print-only) and reuse `normalizeParkName`.

**Files.** `scripts/cleanup-duplicate-parks.ts:51,86-137`

---

### 064 — `00001_initial_schema.sql` is not idempotent / has no transaction wrapper (P3, migration)

**Status:** pending · **Effort:** S

**Problem.** `00001` uses bare `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX` with
no `IF NOT EXISTS` and no `BEGIN/COMMIT`, so a partial run leaves the schema
half-built — the exact failure documented in CLAUDE.md. `00002`/`00003` do this
correctly. The migration README rightly says not to mutate `00001` in place, so
this is a re-run-hazard note rather than an edit.

**Fix.** For fresh environments, run `00001` inside a transaction; consider a
documented "reset" path. Do not retro-edit the committed migration.

**Files.** `supabase/migrations/00001_initial_schema.sql`

---

### 065 — `?carbs=` deep-link into InsulinHelper is read only at mount; a re-link feeds a stale carb count into the estimate (P3, race/safety)

**Status:** pending · **Effort:** S

**Problem.** `const initialCarbs = Number(searchParams.get('carbs'))` seeds
`useState`, whose initializer runs once. If the user is already on `/insulin`
and the floating MealCart "Use in Insulin Helper" link fires again with a new
`?carbs=`, the URL updates in place, the page re-renders, but `carbs` state is
untouched — the new number is dropped and the diabetic computes a bolus against
the old value. (Distinct from 026, which clamps the value; this is staleness on
re-link.)

**Fix.** Sync the param via an effect watching `searchParams` (tracking whether
the user has manually edited the field), or drive the calculator inline as
`Meal.tsx` already does well.

**Files.** `src/pages/InsulinHelper.tsx:7-13`,
`src/components/meal-tracker/MealCart.tsx:48`

---

### 066 — Split `buildTripPlanPdf` from `save()` and reuse `computeDayTotals` (P3, refactor/agent-native)

**Status:** pending · **Effort:** S

**Problem.** `exportTripPlanPdf` lives in `lib/` and is mostly pure but ends in
`doc.save(...)` (browser-only), so a Node script/agent can't get the PDF bytes
(e.g. to email a plan). It also re-implements `computeDayTotals` as inline
reducers that already exist in the trip-plan logic.

**Fix.** `buildTripPlanPdf(plan, parkNames, resortName): jsPDF` (pure, returns
the doc) + a thin `exportTripPlanPdf` wrapper calling `.save()`. Have both the
PDF builder and the hook delegate to one `computeDayTotals`/`computeTripTotals`
(pairs with 030).

**Files.** `src/lib/export-pdf.ts:13,176`

---

### 067 — Stray `C:Users…` path-bug directories at repo root; find and fix the offending path construction (P3, cleanup)

**Status:** pending · **Effort:** S

**Problem.** Two empty directories literally named
`C:Usersmedpediabetesguidedatachains/` and
`C:Usersmedpediabetesguidedocsplans/` exist (untracked) — a script passed an
absolute Windows path where a relative segment was expected (likely a
`path.join(root, absolutePath)` / mis-joined `mkdirSync`). The real targets
(`data/chains/`, `docs/plans/`) exist correctly alongside them. They'll recur on
Windows until the path bug is found.

**Fix.** Delete the two stray dirs; grep scripts for the `mkdirSync`/`path`
construction that produced an absolute-path-as-name and fix it.

**Files.** repo root (stray dirs); offending script TBD via grep.

---

### 069 — ~10 MB of regenerable `audit-*.json` dumps tracked in git (P3, repo hygiene) — FIXED

**Status:** complete · **Effort:** S

**Problem.** `audit-dump.json` (~7.4 MB), `audit-report.json` (~2.4 MB), and
`full-audit-report.json` (~167 KB) were tracked in git and absent from
`.gitignore`, despite being regenerated on demand by `scripts/audit/*` /
`full-audit.ts`. They bloat every clone and every diff, permanently in history.
Two review agents flagged this; an intermediate note in this doc wrongly
dismissed it as a false positive (a transient mis-read from a sub-agent's staged
`git rm` that was later reverted). On a clean tree, `git ls-tree HEAD` confirms
all three were tracked.

**Fix (applied).** `git rm --cached` the three files (kept on disk so the audit
tooling still works) and added a `# Root audit dumps` block to `.gitignore`.
Verified: no longer tracked (`git ls-files`), now ignored (`git check-ignore`),
still present on disk.

**Files.** `.gitignore`; removed-from-index: `audit-dump.json`,
`audit-report.json`, `full-audit-report.json`

---

### 068 — ComparisonModal: dead render branch + redundant non-null assertions (P3, quality)

**Status:** pending · **Effort:** S

**Problem.** `{typeof val === 'number' ? val : val}` renders `val` either way
(collapse to `{val}`). Several `!` assertions are locally guarded but fragile
(`VenueMenu.tsx:45` `groups.get(rKey)!`, `filters.ts:67,91`,
`GradeBadge.tsx:25`) — they rot when the guard moves. Use get-or-insert / narrow
instead.

**Fix.** Collapse the dead branch; replace the redundant `!`s with the existing
guards' narrowed values.

**Files.** `src/components/compare/ComparisonModal.tsx:136`,
`src/pages/VenueMenu.tsx:45`, `src/lib/filters.ts:67,91`,
`src/components/menu/GradeBadge.tsx:25`

---

## Positives worth recording

- **Security posture is solid for the threat model.** Service-role key never in
  the browser or spawned subprocesses; no secrets/PII tracked or in history;
  LLM prompt-injection sanitization (`scripts/lib/sanitize-llm-input.ts`) is
  genuinely well done; insulin math has proper input guards and floors at 0.
- **App-tier architecture is clean.** UI never imports the Supabase client
  (only `queries.ts`/`offline-queries.ts` do) — hold this as an invariant. Pure
  domain logic in `src/lib` is framework-free and unit-tested.
- **Agent-readiness PASS.** Core capabilities (grade, insulin, filter, search,
  recommendations) are pure importable functions; pipeline scripts are
  env-driven with dry-run and JSON output.
- **The `scripts/audit/` + `scripts/sync/` + `scripts/lib/` core** (dry-run,
  batched updates, machine-readable results, tests) is the model the ~120 legacy
  one-shots should follow (tracked: 038).
- **Float→INTEGER rounding and enum-value discipline** are now consistently
  correct across every write path (the historical breakers are gone).
- 173/173 tests pass; `tsc -b` clean.
