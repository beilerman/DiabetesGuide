---
title: DiabetesGuide Public-QA Quality Batch (9 issues)
type: fix
status: active
date: 2026-06-01
---

# 🐛 DiabetesGuide Public-QA Quality Batch (9 issues)

## Overview

A batch of nine quality issues surfaced during public QA of the DiabetesGuide SPA. They split cleanly into four workstreams: **data quality** (category mis-tagging, suspicious nutrition values), **data-fetch / loading** (slow load + misleading "0 items", transient "Venue not found"), **filter UX** (Max Carbs label, restaurant count, search-as-filter badge), and **nutrition display** (legend describes a non-existent "median" basis, no add-to-meal confirmation).

Research grounded every item in current code. **Two reporter claims were partially incorrect and are corrected below** so we don't "fix" working code:

- **Issue #4** — the 0–5 bars *do* render (`DotMeter.tsx`) on the card and detail view. The real defect is the legend text "scale shows item vs. category **median**" — there is no median computation anywhere; the meter uses fixed per-macro thresholds. The meal builder page (`Meal.tsx`) renders no meter and no legend.
- **Issue #5** — "10g sugar listed under a PROTEIN-style slot" is a misread; `MenuItemDetail.tsx:249-259` maps every macro to its correct label. The genuine defect is that the grade formula weights **net carbs 40%**, so a low-carb / high-calorie item like *Bronte* (800 cal, 7 g carb, 0 g net) earns an **A** — clinically misleading for a diabetes audience.

## Enhancement Summary (deepened 2026-06-01)

Deepened with 8 parallel agents: frontend-races reviewer, TypeScript reviewer, data-integrity guardian, performance oracle, code-simplicity reviewer, accessibility (WCAG 2.2 AA) reviewer, and two researchers (TanStack Query v5 / React Router v7 docs; faceted-search + a11y UX). **Three findings corrected factual errors in the original plan** — do not implement the original B2/B3/A1 text without these deltas.

### ⚠️ Critical corrections (the plan was wrong)

1. **`staleTime` already exists — B2's premise is false.** `main.tsx:11` sets a global `staleTime: 5*60_000` + `retry: 1`. Back-nav is **already** cache-served. Do **not** add per-hook `staleTime`. The real 3–4 s cost is **payload over-fetch**: `offline-queries.ts:19-24` selects `restaurant:restaurants(*, park:parks(*))`, re-sending the identical park/restaurant JSON for every one of ~1000 items per batch (multi-MB). **Narrow the nested select → 40–70 % payload reduction** is the single biggest win, not staleTime.
2. **B3's `isError` is a dead wire.** The offline queryFns wrap network in `try { … } catch { return cached OR throw generic }`. For a warm-cache user `isError` is **never** true, and the original error class is **discarded before the component**. The three-state split (loading / error / absent) is **impossible above the queryFn** until the data layer rethrows a *typed* error (carry a discriminant / `cause`). **Fix `offline-queries.ts` first**, or B3 is hollow.
3. **A1 can silently corrupt/lose data.** Paginated `.range()` with **no `.order('id')`** can skip or duplicate rows across the 17 k catalog. The per-row autocommit loop leaves **partial, unrecorded state** on mid-run failure. And my own newly-added dessert term **`coppa` is cured-pork charcuterie** — a brand-new false positive of exactly the kind A1 exists to prevent.

### TanStack Query v5 flag discipline (B2 + B3) — name precisely, per query
- `isPending` = no data yet (v4's `isLoading`); **skeleton gate**. `isLoading` = `isPending && isFetching` (false on a *disabled* query). `isFetching` = any in-flight incl. background refetch — **never gate not-found/skeleton on it** (flickers on the 5-min refetch). `isError`/`isSuccess` per usual.
- **`enabled` trap:** a disabled `useMenuItems` (while `resolvedParkId` is undefined) reports `isPending: true` *forever*. Keep the explicit `isWaitingForLivePark` flag; never use `isPending` of a disabled query as a terminal gate.
- **Not-found gate (both pages):** order matters → `isPending` → skeleton; `isError` → "Couldn't load — retry"; `isSuccess && !park` → reuse `NotFound.tsx`. Error **before** not-found so a fetch failure never reads as "this venue doesn't exist." Split the *synchronous* `!resort || !category` checks (settle immediately) from the *async* `!park` check.
- **Counts/lists:** use `placeholderData: keepPreviousData` (v5 function import), **not** `initialData` (which marks placeholders canonical and kills the refetch). Render the count as preview-or-`null`→"Loading menu…", **never `0`**.
- **Regression-test caveat:** `useCatalogPreview` has `initialData`, so a previewed parkId resolves `park` synchronously and the race **cannot reproduce**. The B3 test MUST use a parkId **absent from `STATIC_CATALOG_PREVIEW`**, plus a cold-cache `isError` case asserting retry (not not-found).

### Per-issue deltas (supersede where they conflict with the body)

| Issue | Deepened decision |
|---|---|
| **A1** | Add `.order('id')` to paginated reads. Write an **undo manifest** `{id,name,from,to,rule}` to disk *before* any write; `--apply` replays the **reviewed** manifest (closes TOCTOU between dry-run and apply). Prefer a **single set-based SQL** statement (Supabase MCP `execute_sql` / migration) = one transaction; if staying per-row REST, **fail-stop on first error**, never log-and-continue. Pure exported `correctCategory(name, currentCategory)` + **two-sided Vitest fixtures** (truePositives + falsePositives) seeded with the documented traps **and** the new-term traps: `Coppa` (charcuterie)→stay entree, `Root Beer Float`, `Butterbeer Ice Cream`. Idempotency test (run twice → 0 moves). Re-check `getDisplayCategory()` doesn't re-override after apply. No PostgREST reload (DML, not DDL); service role bypasses RLS. |
| **A5.1 grade cap** | Cap the **grade letter, not the score** (score feeds the grade *sort* and the DotMeter — clamping it corrupts both). Put the cap in **one shared `gradeForItem(n)`** used by BOTH the card badge and `filters.ts:87-92`'s grade filter, or the badge says "C" while the C-filter hides it (split-brain). Threshold **≥700 cal → no better than C**, matching the existing `scoreCalories` 700 bucket (one calorie boundary in the file). Emit "High calorie — grade capped" via the existing `getDiabetesAnnotations` path. Apply the cap in `getGradeForItem` where full `NutritionInput` is in scope. |
| **A5.2 validateNutrition** | **Shrink** (simplicity + data-integrity agreed): ship only the **impossible-value flag** (`sugar>carbs \|\| fiber>carbs \|\| netCarbs<0`) through the existing annotation pipeline. **Drop the macro-sum/Atwater reconstruction** — it's the noisiest check and its alcohol exemption (which must key on a beverage+keyword *signal*, since `alcoholGrams` is null for most cocktails) guts its hit rate. If ever revived: `NutritionFlag[]` with a `code` discriminant reusing `AnnotationSeverity` and the existing `NutritionInput` (no third nutrition interface). |
| **A5.3 null "—"** | Keep (one-liner/field). **A11y:** a bare "—" announces as silence → reads as 0 (dangerous for dosing). Render `<span aria-hidden>—</span><span class="sr-only">Not available</span>`; a true `0` must still announce "0 grams". |
| **B2** | Drop staleTime work. (1) **Narrow the nested select** (biggest win). (2) Drive the header from the **already-built, currently-unused** `useMenuItemCount`/`useRestaurantCount` (head-count, <500 ms) + catalog-preview placeholder (wire preview into `ParkDetail`, which currently ignores it); never bind to `items.length`; show "Loading menu…" not `0`. (3) Optional: collapse the serial restaurant→items round-trips with a `restaurants!inner(...)` join filter — **validate vs live DB first** (naive `.eq('restaurant.park_id')` was silently ignored per CLAUDE.md; `!inner` honors it). (4) Precompute `getNutrition`/`getItemScore` once per item (WeakMap) — `filters.ts` recomputes 3–4×. (5) Raise `gcTime` to ~30–60 min. (6) `VenueMenu` renders all items unpaginated — add the `visible-items` pagination `ParkDetail` already has. |
| **B3** | Fix `offline-queries.ts` to rethrow a **typed** error first. Then the per-query v5 gate above. Reuse `NotFound.tsx`. |
| **C7** | `aria-valuetext` is the fix, not just the visible label: at the sentinel announce **"No limit"** / "150 g or more, no limit"; elsewhere `${n} grams`. Keep `aria-valuenow` numeric/in-range (don't suppress the number when the number *is* the meaning). Extract a single `MAX_CARB_CAP = 150` constant — the magic `150` lives in ~6 places today (the drift that caused the bug). |
| **C8** | Derive via a **shared typed helper** so `ParkDetail` + `VenueMenu` stay in parity (don't inline the template twice): `restaurantsWithMatches = new Set(filtered.map(i => i.restaurant_id).filter((id): id is string => id!=null)).size` (guard nullable id). Show "N of M restaurants" only when narrowed, "M" otherwise; never "0 of M" mid-load. Wrap in `aria-live="polite"`. *Simpler fallback if descoping: relabel "72 restaurants in this park" so the static number reads as a total.* |
| **C9** | Minimal fix (drop `filters.search` from `activeFilterCount`) is right, but **C8 and C9 want opposite answers about search** → name two predicates: `countActiveStructuredFilters` (badge — search excluded) vs `isResultSetNarrowed` (C8 header — search included). Full `search`-out-of-`Filters` extraction is an ~8-file refactor (`browse-url.ts` serializes it) → **file separately**, don't smuggle into this batch. "Clear all" still clears search. |
| **D4** | Reword legend ("0–5 vs. typical limits, fewer is better"); **explicitly CUT** the median-computation option (no product value over fixed thresholds). Add `aria-valuetext` to the `role="meter"` DotMeter ("4 of 5 — high") so it never announces a bare "4". Confirm in-app whether `Meal.tsx` shows the legend (it doesn't render DotMeter — likely embedded cards) → likely shrinks D4 to `MenuItemDetail` + `MenuItemCard` copy only. |
| **D6** | **Amend "reuse verbatim":** the card's 600 ms "Added ✓" is visual-only and **unannounced** (WCAG 4.1.3 gap). Add a persistent `role="status"` `aria-live="polite"` region — in **both** the detail page and the card — announcing "Added [item] — meal now N items, Kg carbs". Don't move focus; don't toggle the button's own accessible name as the signal. Test the region's text, not just the visual flip. |

### Cross-cutting a11y (WCAG 2.2 AA — the audience has diabetic retinopathy)
One consolidated **`aria-live="polite"` results region** (always in DOM, `aria-atomic`, debounced ~300–500 ms) carries counts + loading for B2/C8/C9; a second `role="status"` region carries action confirmations for D6. Announce real counts only on `isSuccess` ("Loading…", never "0 items"). Extend the planned Vitest tests to assert **live-region text**, the slider's sentinel `aria-valuetext`, and the "Not available" SR text — or these silently regress.

### Revised effort note
Net of the simplicity cuts (A5.2 shrunk, no staleTime work, D4 median cut) **minus** the new must-dos (A1 safeguards, offline-layer typed errors, a11y live regions, B2 payload-narrowing), scope is roughly flat but **re-weighted toward correctness/safety**. The payload-narrowing (B2#1) and the offline-layer typed error (B3) are the two highest-leverage additions.

---

## Problem Statement / Motivation

This is a diabetes-focused clinical-adjacent tool. Mis-categorized desserts hide from the Dessert filter, suspicious macros undermine trust, and an "A" grade on an 800-calorie item is actively misleading. The UX papercuts (misleading "0 items", transient not-found, ambiguous slider, silent add-to-meal) erode confidence in a tool people use while dosing insulin. None are individually large, but together they read as "this data can't be trusted."

## Research Summary (grounded references)

### Tech stack
React ^19.2 · React Router ^7.13 · TanStack Query ^5.90 · Vite ^7.2 · Tailwind ^4.1 · TypeScript ~5.9 · Supabase JS ^2.93 · Fuse.js ^7.1. Tests: Vitest + Playwright. Project ref `rcrzdpzwcbekgqgiwqcp`.

### Prior art / institutional knowledge (carry forward, don't duplicate)
- `docs/plans/2026-02-20-frontend-redesign-design.md` — origin of the A–F grade formula (net carbs 40 % / sugar-ratio 20 % / protein 15 % / fiber 15 % / calorie-density 10 %; −15 alcohol penalty) and the 5-dot meter spec. **The grade-vs-calorie tension (#5) is a design question against this doc, not a bug in isolation.**
- `docs/plans/2026-05-24-public-qa-remediation-plan.md` — already scoped "reclassify cocktails/wine/beer as beverage" and "missing/zero nutrition → 'Nutrition unavailable'." Issue #1 and parts of #5 are a **continuation** of that plan; reuse its approach rather than inventing a parallel one.
- `audit/quality-history.json` (2026-05-31): 17,306 items, quality score 67/100, 95.9 % calories present, 42.4 % trusted carbs, **105 orphan items**.
- `scripts/README.md`: ~136 one-off `fix-*` scripts were archived to `scripts/archive/` (not wired into anything). The dedicated category corrector `scripts/archive/fix-categories.ts` exists but shows **no evidence of ever being run with `--apply`** against the live 17 k catalog.

### Key file map

| Concern | File:line | Note |
|---|---|---|
| Routes | `src/App.tsx:46` (`/park/:parkId` → ParkDetail), `:70-71` (`/resort/...` → VenueList / VenueMenu) | Both a modern park page and a legacy venue page exist |
| Query hooks | `src/lib/queries.ts` | No `staleTime` on most hooks (refetch churn); IndexedDB fallback chain |
| All-parks cap | `src/lib/offline-queries.ts:25` | `DEFAULT_ALL_PARK_MENU_LIMIT = 3000` |
| Park header counts | `src/pages/ParkDetail.tsx:114-119` | Shows raw `items.length` + `restaurants?.length` — **not filtered** |
| Park not-found | `src/pages/ParkDetail.tsx:82` | `if (!park && !isLoading)` |
| Venue header counts | `src/pages/VenueMenu.tsx:87-88` | Uses `restaurants?.length` (static) · `displayedItemCount` (filtered) |
| Venue not-found | `src/pages/VenueMenu.tsx:60` | `if (!resort || !category || !park)` — **no `isLoading` guard** ← transient bug |
| Venue park lookup | `src/pages/VenueMenu.tsx:17-30` | preview→live handoff via `isWaitingForLivePark` |
| Filters core | `src/lib/filters.ts:34-124` | `applyFilters(items, filters)` |
| Filter bar | `src/components/filters/FilterBar.tsx` | all controls |
| Max Carbs slider | `FilterBar.tsx:244-256` | label `?? 'Any'`; thumb `?? 150`; `value===150 → null` |
| Active-filter count | `FilterBar.tsx:28-38` | `filters.search` counted as a filter (line 29) ← badge bug |
| Category override | `src/lib/display.ts:99-123` | `getDisplayCategory()` heuristic over stored category |
| Grade engine | `src/lib/grade.ts:75-108` | `computeScore` / `computeGrade`; net carbs 40 % |
| Item detail | `src/pages/MenuItemDetail.tsx:247` (legend), `:249-259` (macros), `:205-216` (Add to Meal) | labels correct; no toast |
| 0–5 meter | `src/components/menu/DotMeter.tsx:18-61` | exists & rendered; fixed `max` thresholds, **no median** |
| Card add-to-meal | `src/components/menu/MenuItemCard.tsx:94-112` | already has 600 ms "Added ✓" state — reuse pattern for detail page |
| Meal page | `src/pages/Meal.tsx` | no meter, no legend |
| Zero-carb warning | `src/lib/annotations.ts:40-47`; `src/lib/nutrition-trust.ts:119-124` | "Estimated zero carb — verify" |
| Category inference (root cause) | `scripts/seed.ts:38-45` & `scripts/import-all.ts:38-45` | weak regex, no gelato/affogato/shake; `return 'entree'` default |
| Good inference (sync path) | `scripts/scrapers/utils.ts:27-54` | name-based, has `gelato|shake|cocktail`, guards `crispy` |
| Dedup constraint | `supabase/migrations/00002_menu_items_dedup_constraint.sql` | UNIQUE(restaurant_id, lower(btrim(name))) |

### Live data sizing (read-only SELECT, 2026-06-01)
Total 17,306 items. By category: entree 8,039 · beverage 5,176 · dessert 1,579 · snack 1,444 · side 1,068.
**Entree rows that should be dessert/beverage:** ~252 by explicit keyword (114 dessert-named, 138 drink-named); true count est. **250–400** once theme-park-specific names (Amalfi, Bronte, Blue Lagoon Lemon-Sprits) are included. Gelateria Toscana alone: 35 mis-tagged entrees.

### Reconciliation with `docs/plans/2026-05-24-public-qa-remediation-plan.md` (verified shipped state)

Read in full and cross-checked against the live tree. Result: **no competing corrector exists** — the overlapping work was *deferred* in that plan, not implemented. Adjustments folded into the workstreams below.

| 2026-05-24 item | Status in tree (2026-06-01) | Effect on this plan |
|---|---|---|
| §4 Category audit (cocktails/wine/beer/soda/coffee/tea → beverage; sides/entrees via "tested regex with false-positive fixtures") | **NOT done** — no category script in recent commits; ~252 mis-tags live | **A1 IS the execution of §4.** Honor its explicit beverage list + its "false-positive fixtures" requirement. Origin: that plan §4. |
| §1.5 / §5 "missing or all-zero nutrition → 'Nutrition unavailable', don't award a real grade" | **DONE** — `nutrition-trust.ts` `'unavailable'` level; `grade.ts:76` returns `null` when calories **or** carbs null; `MenuItemCard.tsx:244`; `Meal.tsx:79` excludes from estimator | **Narrows A5#3:** the *all-missing* case is handled. Remaining gap = **partial nulls** (item has calories+carbs → gets a grade, but protein/sugar are null and render blank/0). That per-field case is the actual #5 defect for Frozen Sangria / Tea / Sparkling Italian Soda. |
| §2 404 / NotFound page | **DONE** — `src/pages/NotFound.tsx` wired in `App.tsx` | **B3 reuses `NotFound.tsx`** for the settled-and-genuinely-absent case; the transient-on-valid-URL race is net-new. |
| §6 "Max Carbs slider exposes current value + aria text" | **DONE** (value is shown) | **C7 is a refinement:** the remaining bug is the "Any" sentinel at 150 disagreeing with the thumb, not absence of a value readout. |
| §6 / interaction thesis "successful actions provide brief visible feedback"; "Add favorite action feedback" | **DONE on the card** (`MenuItemCard.tsx:94-112` 600 ms "Added ✓") | **D6 completes the same principle** on the detail page by reusing that exact pattern. |
| §1 item detail route `/item/:itemId` | **DONE** — `MenuItemDetail.tsx` live | Confirms the detail page targeted by #4/#5/#6 exists. |

Net-new in this batch (no 2026-05-24 coverage): **B2** (loading "0 items" + staleTime), **B3 race** (transient not-found on valid URL), **A5 grade calorie-cap** (Bronte), **C8** (restaurant count vs filters), **C9** (search-as-filter badge), **D4** (legend "median" mismatch).

---

## Workstream A — Data Quality

### A1. Category misclassification (Issue #1) — HIGH

**Root cause.** Bulk import used the weak `inferCategory()` in `scripts/seed.ts:38-45` / `import-all.ts:38-45`: the dessert regex lacks gelato/affogato/tiramisu/sundae-variant terms and the beverage branch only fires on a structured `type:'drink'` flag (never inspects the name), so gelato/cocktail/milkshake fall through to `return 'entree'`. The good name-based inference already lives at `scripts/scrapers/utils.ts:27-54` but only runs on newly-scraped items.

**Fix (two parts).**

1. **Retroactive correction (data) — executes 2026-05-24 §4.** Write `scripts/audit/recategorize.ts` (dry-run by default, `--apply` to write), porting the keyword rules from `scrapers/utils.ts` plus the patched terms the archived corrector was missing. Honor §4's explicit beverage list: **cocktails, wines, beer, soda, coffee, tea → `beverage`** (and sides/entrees via regex). Reuse the `FOOD_CONTEXT` negative-lookahead from `scripts/archive/fix-categories.ts:31` to avoid false positives ("wine-braised", "beer-batter", "Shrimp Cocktail", "Crispy Calamari"). Add the terms the archived script omitted: `affogato`, `tiramisu`, `coppa`, `zeppole`, `gelati`, and stop excluding `float|shake|milkshake` from the dessert/beverage rules. **Ship a Vitest fixture file of true/false positives (per §4's "false-positive fixtures" requirement)** — including the historical traps (crisp/beer/wine/cocktail) — and run the classifier against it before any `--apply`. Track corrected IDs in a `Set`; print a per-category diff; require explicit `--apply`.
   - `scripts/audit/recategorize.ts` (new)
   ```ts
   // dry-run summary shape
   type Recat = { id: string; name: string; from: Category; to: Category; rule: string }
   // SELECT id,name,category FROM menu_items WHERE category='entree' ...
   // apply only with --apply; NOTIFY pgrst,'reload schema' not needed (no DDL)
   ```
2. **Root-cause fix (code).** Replace the weak `inferCategory()` in both `seed.ts:38-45` and `import-all.ts:38-45` with the shared name-based version from `scrapers/utils.ts` (extract to a single shared module so all three import sites use one implementation). Prevents reintroduction on the next import.

**Validation.** Dry-run shows ~250–400 entree→dessert/beverage moves; manually eyeball the Gelateria Toscana 35; re-run `npm run audit:quality`; verify Dessert filter now surfaces gelato. Guard against the **reverse** "crisp" bug (CLAUDE.md) — savory "Crispy" items must stay entree.

### A5. Suspicious nutrition values + grade-vs-calorie (Issue #5) — HIGH

Three distinct sub-problems; treat separately.

1. **Grade ignores calories (the real Bronte bug).** `grade.ts:75-108` weights net carbs 40 %, calorie-density only 10 %, so 800 cal / 0 g net → A. **This is a design decision against `docs/plans/2026-02-20-frontend-redesign-design.md`** — *needs product input before changing the formula.* Minimum safe action: add a **calorie-cap guard** so an item ≥ ~700 cal cannot grade above (e.g.) **C** regardless of carb score, surfaced as an annotation ("High calorie — grade capped"). Implement in `computeGrade`/`computeScore` with a unit test.
2. **Internal-consistency validation (surface, don't silently mutate).** Add a pure `validateNutrition(n)` helper returning structured flags, rendered as trust annotations (reuse `src/lib/annotations.ts` + `nutrition-trust.ts` patterns, not a new system):
   - calories vs macros: `|stated − (P*4 + C*4 + F*9 + alcohol*7)|` beyond tolerance → "macros don't sum to calories" (exempt alcohol-bearing items, per CLAUDE.md known-gap).
   - sugar > carbs, fiber > carbs, net carbs < 0 → flag.
   - `Martini Mania` 0 g carb / 201 cal already hits the existing `nutrition-trust.ts:119-124` low-confidence-zero-carb rule — verify it shows; extend to non-beverage if needed.
3. **Partial-null fields (Frozen Sangria, Tea, Sparkling Italian Soda).** The *all-missing* case already ships ("Nutrition unavailable", grade suppressed — see Reconciliation). The remaining gap is **partial nulls**: an item with calories+carbs still earns a grade (`grade.ts:76` only nulls on missing calories/carbs), but its null `protein`/`sugar` render as blank or 0, implying real zeros. Fix at the display layer: render null macros as "—" / "Not available" on the card and detail page (these items keep their grade; only the empty fields change). No new "unavailable" system — extend the existing per-field formatting (`formatMaybeNumber` at `MenuItemDetail.tsx`).

**Scope guard.** Validation **flags/suppresses display**; it does not auto-edit the DB. Any bulk data correction is a separate, dry-run-first script.

---

## Workstream B — Data-Fetch / Loading

### B3. Transient "Venue not found" on a valid URL (Issue #3) — HIGH (worst UX)

**Root cause.** `VenueMenu.tsx:60` renders the not-found state on `if (!resort || !category || !park)` with **no `isLoading` guard**. On a cold load, `parks` is undefined → `park` is undefined → not-found flashes until the query resolves. `ParkDetail.tsx:82` is safer (`!park && !isLoading`) but still can't distinguish "parks loaded, id genuinely absent" from "parks failed to load".

**Fix.**
- Gate the not-found branch on settled-and-absent: render not-found only when `parks` query `isSuccess && !park` (and resort/category resolved). While `isLoading || isPending`, render the skeleton, never not-found. **Reuse the existing `src/pages/NotFound.tsx`** (shipped by 2026-05-24 §2) for the genuine-absent state instead of the inline markup at `VenueMenu.tsx:60`.
- Surface query **error** state distinctly (fetch failed → "Couldn't load — retry", not "not found"). React Query already retries; ensure `retry` is sane and `isError` is handled.
- Apply the same settled-vs-loading distinction to `ParkDetail.tsx:82`.
- Add a regression test (Vitest + mocked query) asserting the not-found state never renders while `isLoading`.

### B2. Misleading "0 items" + slow load (Issue #2) — MEDIUM

**Root cause.** Header binds to `items.length`, which is `0`/absent until the slow `useMenuItems` query resolves ~3–4 s later. **The slowness is payload, not refetch churn** — see Enhancement Summary: a global `staleTime: 5min` is *already* set in `main.tsx:11` (back-nav is already cached), and `offline-queries.ts:19-24` over-fetches `restaurant:restaurants(*, park:parks(*))`, re-sending the same park/restaurant blob ~1000×/batch.

**Fix** (details + measurements in the Enhancement Summary "B2" row):
- **Display:** while `isPending`, show a neutral indicator ("Loading menu…" / skeleton chip) instead of `0 items`; render a number only once data (or a preview count) is present.
- **Perf #1 (biggest win):** narrow the nested select to the fields the UI actually reads (`restaurant:restaurants(id,name,land,park_id, park:parks(id,name))`) → 40–70 % payload cut.
- **Perf #2:** drive the header from the already-built-but-unused `useMenuItemCount`/`useRestaurantCount` (head-count, <500 ms) + catalog-preview placeholder (wire preview into `ParkDetail`); never bind to `items.length`.
- **Do NOT** re-add `staleTime`. Optionally raise `gcTime` (~30–60 min), precompute nutrition/score once per item in `filters.ts`, and paginate `VenueMenu`'s list.

---

## Workstream C — Filter UX (all in `FilterBar.tsx`, low-risk)

### C7. Ambiguous "Max Carbs: Any" at 150 g (Issue #7)
*Refinement of 2026-05-24 §6 (value/aria readout already shipped).* `FilterBar.tsx:244-256`: label reads `?? 'Any'` while the thumb sits at `?? 150` and `value===150` maps to `null`. The remaining defect is the **sentinel disagreement**, not a missing readout. Decision: keep 150 = no-cap semantics but **relabel the max position "Any (150 g+)"** and show the live gram value at all other positions, so label and thumb never disagree. Keep the existing aria text in sync.

### C8. Restaurant count ignores filters (Issue #8)
`ParkDetail.tsx:114-119` / `VenueMenu.tsx:87-88` show static `restaurants?.length` while the item count drops with filters. Decision: **relabel as a total** ("72 restaurants" → keep, but compute matching count when filters active) — simplest correct fix is to derive `restaurantsWithMatches = new Set(filtered.map(i => i.restaurant_id)).size` and show "N of M restaurants" when any filter/search is active, else "M restaurants".

### C9. Search increments the filter badge (Issue #9)
`FilterBar.tsx:28-38` counts `filters.search` (line 29) toward `activeFilterCount`. Remove `filters.search` from that array so the badge reflects only structured filters. Give search its own affordance (a clear-"x" inside the input is enough; optionally a separate "searching: …" chip). Ensure "Clear all" still clears search even though it no longer counts.

---

## Workstream D — Nutrition Display

### D4. Legend describes a "median" basis that doesn't exist (Issue #4) — MEDIUM
**Corrected understanding:** bars render (`DotMeter.tsx`), but the legend at `MenuItemDetail.tsx:247` (and the copy in `MenuItemCard.tsx`) says "scale shows item vs. category **median** (0-5)" while `DotMeter` uses fixed per-macro `max` thresholds — there is no median anywhere. Two options:
- **(Recommended, low-effort, honest):** reword the legend to match reality — e.g. "0–5 scale vs. typical limits (fewer is better)". Update `MenuItemDetail.test.tsx:48` accordingly.
- **(Higher-effort, truer to design doc):** actually compute per-category medians and pass as the meter `max`. Defer unless product wants it.
Also verify whether the **meal builder** (`Meal.tsx`) is expected to show the meter at all — research found it shows neither meter nor legend, so the reporter's "meal builder shows the legend" likely refers to embedded `MenuItemCard`s. Confirm in-app before touching `Meal.tsx`.

### D6. "Add to Meal" has no on-page confirmation (Issue #6) — LOW
*Completes 2026-05-24's "successful actions provide brief visible feedback" principle on the detail page.* `MenuItemDetail.tsx:205-216` only updates the bottom-nav badge. The card already ships the pattern: `MenuItemCard.tsx:94-112` flips to a green "Added ✓" for 600 ms. **Reuse it verbatim** on the detail button (local `addingToMeal` state + timeout, swap label/colour) for consistency. A full toast system doesn't exist and isn't warranted. Add a Vitest assertion that the button shows confirmation after click.

---

## System-Wide Impact

- **Interaction graph:** the not-found guard (B3) and loading placeholders (B2) touch the same `useParks`/`useMenuItems` settle states — implement together to avoid conflicting `isPending`/`isError` logic (per-query, per the v5 flag discipline above). The B2 select-narrowing changes the shape written to IndexedDB — verify the offline fallback (`itemBelongsToPark`/`parkIdOf`) still works after trimming columns (keep `restaurant.park_id`).
- **Error propagation:** B3 must split three states (loading / error / genuinely-absent) where today there are two. Don't collapse fetch errors into "not found".
- **API-surface parity:** the header-count fix (C8) applies to **both** `ParkDetail` and `VenueMenu` — fix both or the inconsistency persists.
- **Data vs display:** A1 (data recat) and `display.ts:getDisplayCategory()` both decide category. After A1 fixes stored categories, re-check that `getDisplayCategory` heuristics don't re-override correct values.
- **State lifecycle:** the recategorize script (A1) and any validation-driven suppression (A5) must be **read-only by default**; only `--apply` writes. No DDL → no PostgREST schema reload needed.

## Acceptance Criteria

**Data**
- [ ] A1: dry-run report lists every entree→dessert/beverage move with the rule that fired; `--apply` corrects ~250–400 rows; Gelateria Toscana gelato/affogato/milkshake items now `dessert`/`beverage`; no savory "Crispy"/"-braised"/"Shrimp Cocktail" regressions; `seed.ts`+`import-all.ts` use the shared name-based inference.
- [ ] A5: items ≥ ~700 cal cannot grade above C (capped, annotated); `validateNutrition` flags sugar>carbs / fiber>carbs / negative net carbs / macro-sum mismatch (alcohol-exempt); null protein/sugar render "—", not 0; Martini Mania low-confidence warning visible.

**Data-fetch**
- [ ] B3: not-found never renders while loading (regression test); fetch error shows a retry affordance distinct from not-found; valid venue URL survives repeated hard reloads.
- [ ] B2: header shows a neutral loading indicator (not "0 items") until data resolves; back-navigation to a visited park is instant (staleTime); count appears before/independent of the full list where feasible.

**Filter UX**
- [ ] C7: slider label and thumb never disagree; max position clearly means "no cap".
- [ ] C8: restaurant count reflects matches (e.g. "N of M") when filters/search active, on both park and venue pages.
- [ ] C9: typing in search does **not** increment the structured-filter badge; "Clear all" still clears search.

**Nutrition display**
- [ ] D4: legend wording matches the actual meter basis (no false "median" claim); `MenuItemDetail.test.tsx` updated; meal-builder bar expectation confirmed in-app.
- [ ] D6: detail-page "Add to Meal" shows on-page confirmation (button-state pattern reused from the card); covered by a test.

**Global**
- [ ] `npm run build` (typecheck) clean; `npm test` (Vitest) green incl. new tests; data scripts run `--dry-run` first and typecheck via `tsconfig.scripts.json`.

## Suggested Sequencing

1. **B3** (transient not-found) — worst, smallest, isolated.
2. **C7 / C8 / C9** — three low-risk `FilterBar`/header edits, batchable.
3. **D6 + D4** — small display fixes reusing existing patterns.
4. **B2** — loading indicator + staleTime + count investigation.
5. **A1** — recategorize script (dry-run → review → apply) + shared inference refactor.
6. **A5** — grade calorie-cap + validation annotations (touch grade.ts last; needs a product call on the formula).

## Dependencies & Risks

- **A5 grade formula change needs a product decision** (origin: `2026-02-20-frontend-redesign-design.md`). The calorie-cap guard is the safe, ship-now subset; a full re-weight is deferred.
- **A1 = the deferred 2026-05-24 §4 category audit** (reconciled — no competing corrector exists; that work was never implemented). Inherit its requirements: explicit beverage list + tested false-positive fixtures.
- **Offline-layer typed errors (B3 prerequisite):** `offline-queries.ts` currently swallows error provenance into the cache-fallback. Changing it to rethrow typed errors is the prerequisite for B3's three-state split — verify the warm-cache offline path still serves cached data (only the *both-failed* path should surface as `isError`).
- **B2 select-narrowing** must keep `restaurant.park_id` or the IndexedDB `itemBelongsToPark`/`parkIdOf` fallbacks break.
- Regex false positives are the historical failure mode here (CLAUDE.md: "crisp", "beer", "wine") — A1 must dry-run and diff before `--apply`, tracking IDs in a Set.

## Sources & References

- Origin design (grades/meter): `docs/plans/2026-02-20-frontend-redesign-design.md`
- Reconciled origin (category audit §4, missing-nutrition §5, slider §6, feedback principle): `docs/plans/2026-05-24-public-qa-remediation-plan.md` — A1 executes its deferred §4; A5#3 / C7 / D6 build on its shipped work
- Data baseline: `audit/quality-history.json` (2026-05-31), `scripts/README.md`
- Code: `src/lib/grade.ts:75-108`, `src/components/menu/DotMeter.tsx:18-61`, `src/components/filters/FilterBar.tsx:28-38,244-256`, `src/pages/VenueMenu.tsx:60,87-88`, `src/pages/ParkDetail.tsx:82,114-119`, `src/pages/MenuItemDetail.tsx:205-216,247,249-259`, `scripts/seed.ts:38-45`, `scripts/import-all.ts:38-45`, `scripts/scrapers/utils.ts:27-54`, `scripts/archive/fix-categories.ts:31`
- Live DB sizing: read-only SELECT against project `rcrzdpzwcbekgqgiwqcp`, 2026-06-01
