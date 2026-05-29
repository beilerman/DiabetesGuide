# Code Review — Pending Changeset on `main`

**Date:** 2026-05-18
**Reviewer:** ce-review (8 parallel agents)
**Repo:** beilerman/DiabetesGuide
**Branch:** `main` (uncommitted; no PR)
**Scope:** 41 modified + 37 untracked files (1,745 insertions / 14,919 deletions)

---

## Agents

| Agent | Verdict |
|---|---|
| kieran-typescript-reviewer | Solid; 3 P1, 6 P2, 4 P3 |
| security-sentinel | MEDIUM-HIGH risk: 2 P1 (W-9 leak, PII in source) + 4 P2 |
| performance-oracle | Good frontend posture; 2 P1, 6 P2, 6 P3 |
| data-integrity-guardian | Conditional GO; 3 P1, 5 P2, 5 P3 |
| schema-drift-detector | Every `00001` mutation is a legitimate retrofit, but pattern is a footgun |
| agent-native-reviewer | PASS — new libs exemplary; 6 hook-locked workflow gaps remain |
| learnings-researcher | 1 regression to a previously-fixed bug; 7 known patterns apply |
| code-simplicity-reviewer | ~3,500 LOC / 20 files deletable |

---

## Severity Summary

| | Count |
|---|---:|
| 🔴 P1 (block merge / immediate) | 10 |
| 🟡 P2 (should fix) | 18 |
| 🔵 P3 (nice-to-have) | 12 |
| **Total** | **40** |

> Already applied this session: `data/w9-output/` added to `.gitignore`. Confirmed via `git check-ignore`.

---

## 🔴 P1 — Block merge / immediate action

### P1-01 — Signed W-9 PDFs (SSN + signature + address) untracked but not gitignored
**Status (partial):** `.gitignore` now ignores `data/w9-output/`. PDFs still physically present in the working tree.
**Remaining action:**
- Move `data/w9-output/W9_Tax_Form.pdf`, `W9_Eilerman_redated.pdf`, `W9_Eilerman_prefilled.pdf` out of the repo entirely (e.g. `~/Documents/tax/`).
- Verify with `git log --all -- 'data/w9-output/**'` that no signed form was ever committed historically.

### P1-02 — Hardcoded PII in `scripts/build-w9-prefilled.ts:26-31`
Legal name + DBA + home street address + ZIP are baked into a script in a public repo. Once committed, lives in `git log` forever.
**Fix:** Move profile to `data/w9-output/profile.json` (now ignored). Script reads via `JSON.parse(readFileSync(...))`.

### P1-03 — `verify-post-migration.ts` has hard-coded stale row counts
Expects `parks=44, restaurants=782, menu_items=11551, nutritional_data=11551`. Prod is `48 / 989 / 18211 / 17333`. Also asserts `menu_items_without_nutrition == 0`, but 878 exist. **The verifier will report passing migrations as failures.**
**Fix:** Replace fixed counts with comparative invariants (non-negative; matches a snapshot taken at run start) or remove the script entirely.

### P1-04 — `scripts/dedupe-universal-parks.ts` is non-transactional, no dry-run, no idempotency
Runs N round-trips per dup-pair against prod (list → reparent → delete → backfill). A mid-run network blip leaves prod half-merged. A second run tries to delete a park that no longer exists and aborts.
**Fix:** Wrap each pair in a transaction (RPC or `apply_migration`); add `--dry-run`; precondition-check that `PAIRS` UUIDs still exist before each pair.

### P1-05 — `00001_initial_schema.sql` modified in place to mirror `00002` + partially `00003`
The applied baseline migration is being rewritten to inline DDL that lives in `00002`. Future `supabase db reset` against a fresh DB will work (idempotent `IF NOT EXISTS`), but new contributors see two sources of truth for the same DDL and the discipline of additive migrations is broken.
**Fix:** `git checkout HEAD -- supabase/migrations/00001_initial_schema.sql`. Let `00002` and `00003` own their changes. Verified by schema-drift agent: zero conflicts between `00001` (committed) + `00002` + `00003`; the inline mutation adds no value.

### P1-06 — `confidence_score` widened to `number | null` is a silent breaking change (`src/lib/types.ts:56`)
Existing comparisons like `nd.confidence_score >= 80` now produce `null >= 80 → false` (accidentally correct in most places), but `nd.confidence_score + 0 → 0` and `Math.round(null) → 0` will silently corrupt rollups in audit scripts.
**Fix:** Grep all reads of `confidence_score`; add `!= null` guards or default to `0` at the boundary. Required reads: `MenuItemCard.tsx:312` (already guarded), `scripts/audit/*`, `src/lib/confidence.ts`.

### P1-07 — `scripts/estimate-nutrition-codex.ts:144` JSON extraction regex is unsound
`/\{[^{}]*"calories"[\s\S]*?\}/` cannot handle nested objects. If the model wraps `meta: {...}` before the macros object, extraction either fails or picks the wrong match. Today this silently logs items as "no JSON in response".
**Fix:** Brace-balancing parse, or use Codex `response_format` and parse the full last code block. (Or delete the file per simplicity P3-04.)

### P1-08 — `estimate-nutrition-ai-nameonly.ts:78` 429 handler sleeps but does not retry
On rate-limit it `await sleep(...)` then returns `null`. Caller counts it as a failure. Strictly worse than failing fast.
**Fix:** Retry the call after the sleep, or remove the sleep entirely.

### P1-09 — `applyFilters` grade sort recomputes `computeScore` O(n log n) times (`src/lib/filters.ts:117-119`)
For `sort by 'grade'` on 9,000 items: ~117,000 score computations instead of 9,000. Estimated 80–150ms wasted on `/browse?sort=grade` (Home links straight to it).
**Fix:** Pre-compute scores once into a `Map<id, number>`; sort against the map. Same pattern for `carbsAsc/Desc/caloriesAsc/Desc`.

### P1-10 — `useCompare.isInCompare` dep array changed `[items]` → `[]` (`src/hooks/useCompare.ts:95-97`)
Both versions of this callback are buggy: the old one closed over wrong variable; the new one reads module-level `sharedItems` but is frozen by empty deps, so `useMemo`/`useEffect` consumers will never re-fire when compare state changes.
**Fix:** Dep is `[items]` AND function body reads `items` (state), not `sharedItems` (module). Or move the whole hook into a Context.

---

## 🟡 P2 — Should fix

### Type safety / TS quality

- **P2-01** `scripts/audit/accuracy.ts:226` — severity downgraded `MEDIUM → LOW` unconditionally; tests at `accuracy.test.ts:67` lock this in for `source: 'official'`. Reintroduce a branch keeping `MEDIUM` for `official`.
- **P2-02** `src/components/menu/MenuItemCard.tsx:42` — sodium meter band/cap mismatch. Red triggers >1000mg, meter caps at 1500mg, so 1100mg shows 73% full while already red. Align thresholds and cap (e.g., max=2300, FDA daily).
- **P2-03** Supabase nested-join type literal duplicated in `scripts/estimate-nutrition-codex.ts:46-52`, `estimate-nutrition-ai-nameonly.ts:98-100`, `insert-allears-disney.ts`, `upgrade-chain-nutrition.ts:301`. Extract `RestaurantJoin` / `ParkJoin` into `scripts/lib/supabase-joins.ts`.
- **P2-04** `scripts/audit/external.ts:170-191` — `runStaleSelect` returns `unknown[] | null`, reassigned across branches. Type each selection explicitly so legacy-vs-current divergence isn't silent.
- **P2-05** `src/pages/Meal.tsx:43` — `carbOverride` keyed by `mealId`, but the `useEffect` that reset on `activeMealId` was removed. Add an explicit fallback when `!activeMealId`.

### Data integrity / migrations

- **P2-06** `scripts/audit/migrate-constraints.ts` CHECK constraints (`chk_fiber_lte_carbs`, `chk_sugar_lte_carbs`, `chk_calories_range`, `chk_sodium_range`, `chk_macros_non_negative`) have never been validated against existing data. ALTER TABLE … ADD CONSTRAINT does a full-table scan with locks. Pre-check counts manually, or use `NOT VALID` then `VALIDATE CONSTRAINT`.
- **P2-07** `fn_nutrition_soft_validate` trigger writes to `audit_log` on every nutritional_data insert/update — write-amplifier during backfills. Add a `SET LOCAL diabetes.skip_audit = 'on'` short-circuit, or detach during bulk loads.
- **P2-08** `upgrade-chain-nutrition.ts` / `upgrade-verified-nutrition.ts` overwrite without preserving precedence/history. Acceptable now, but document the order: run `verified` (conf=95) before `chain` (conf=90).
- **P2-09** `insert-allears-disney.ts` auto-creates parks AND restaurants on misses. With new `idx_parks_normalized_name_unique`, mismatch on normalization races. Use the same `lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))` as the index.
- **P2-10** `dedupe-universal-parks.ts` re-runs leave no signal — `console.error` on duplicate-shell insert but proceeds. Add an idempotency guard: skip pair if `dup_park_id` no longer exists.

### Security

- **P2-11** `scripts/estimate-nutrition-codex.ts:121` spawns the Codex CLI agent with full `process.env` — including `SUPABASE_SERVICE_ROLE_KEY`. Scrub before spawn: `env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_URL: undefined }`.
- **P2-12** GitHub Actions pinned to floating `@v4`. Both workflows have `contents: write` and receive `SUPABASE_SERVICE_ROLE_KEY`. Pin to commit SHA (`actions/checkout@b4ffde65…`). Dependabot keeps them current.
- **P2-13** Prompt injection from menu_item names into Codex/Groq prompts. Strip control chars + cap length before interpolation. Atwater sanity checks reduce blast radius but won't catch deviations within the 15% band.

### Performance

- **P2-14** `scripts/audit/comprehensive.ts:424-430` — 5 tables × ~10 sequential pages = 50 round-trips per run (≈12–25s). Bump page size to 5000 (Supabase REST max is 10k).
- **P2-15** `scripts/upgrade-chain-nutrition.ts:327-338` — O(n × m) regex (9,261 × ~80 chains ≈ 740K tests) + serial per-match DB writes (~10–20s). Index by lowercased prefix; batch updates via `Promise.all` chunks of 10.
- **P2-16** `scripts/estimate-nutrition-codex.ts:269-283` and `estimate-nutrition-ai-nameonly.ts:118-143` — serial workers. Pool concurrency 3–10 with a semaphore; Groq free tier caps at 30 req/min.
- **P2-17** Migrations `00002` / `00003` unique-index creation lacks `CONCURRENTLY`. ≤18k rows = sub-second ACCESS EXCLUSIVE lock, survivable but worth a note in the runbook.

### Learnings (regressions / known patterns)

- **P2-18** `scripts/audit/accuracy.ts:5` — `BEVERAGE_NAME_PATTERN` includes bare `\bcoffee\b` and `\bmilk\b`. Will match "Coffee Cake Cookie", "Coconut Milk Bread" — reintroducing the false-positive class that `fix-false-positives.ts` originally cured. Port `NEGATIVE_PATTERNS` from `scripts/audit/utils.ts`. **Same risk:** `FRIED_PASTRY_PATTERN` `\bpie\b` matches "pieces", "pie crust".

---

## 🔵 P3 — Nice-to-have

### Agent-native gaps (UI-locked workflows)
- **P3-01** Extract `findBetterChoices()` from `BetterChoices.tsx` to `src/lib/recommendations.ts`.
- **P3-02** Extract trip-plan reducer from `useTripPlan` to `src/lib/trip-plan.ts` (pure `addItemToSlot`, `computeDayTotals`, etc.).
- **P3-03** Extract meal-cart reducer from `useMealCart` to `src/lib/meal-cart.ts`.
- **P3-04** Export `CompareItem` + `toCompareItem` + a pure compare reducer from `src/lib/compare.ts`.
- **P3-05** Favorites primitives (`addFavorite/removeFavorite`) + exported storage-key constant.
- **P3-06** Recent-search primitives lifted out of `Search.tsx` to `src/lib/recent-searches.ts`.

### Simplicity / dead code (delete or fold)
- **P3-07** Delete orphan `estimate-nutrition` variants: `-codex.ts`, `-final.ts`, `-gemini.ts`, `-keywords.ts`, `-keywords-v2.ts`, `-smart.ts`, `-ai-nameonly.ts`. The active script is `scripts/sync/estimate-nutrition.ts`. ~2,278 LOC deletable.
- **P3-08** Delete `scripts/run-codex-overnight.sh` (references deleted codex script).
- **P3-09** Move `scripts/build-w9-prefilled.ts`, `restamp-w9-date.ts`, `fw9-irs.pdf` to the `taxes/` project. They don't belong in DiabetesGuide. ~175 LOC.
- **P3-10** After one-shot data migrations run successfully: delete `insert-allears-disney.ts`, `insert-sparse-disney.ts`, `dedupe-universal-parks.ts`, `verify-post-migration.ts`. Git history is the artifact.
- **P3-11** Fold `scripts/audit/migrate-constraints.ts` (307 LOC of `console.log` SQL) into a real migration `supabase/migrations/00004_constraints.sql`.
- **P3-12** Delete `ADVISED_REVISIONS.md` and stale `.claude/worktrees/pensive-johnson/`.

### Bundle / dependencies
- **P3-13** Move `jspdf` from `devDependencies` to `dependencies` (`Plan.tsx` lazy-imports it; Vite emits chunk; CI prune would break).
- **P3-14** Consider dropping `canvas` from devDependencies — `parse-chain-pdf.ts` only calls `getTextContent()`, doesn't need canvas. Native build is #1 source of `npm install` flakiness on Windows.

### Misc TS / perf nits
- **P3-15** `src/lib/insulin.ts:76` — drop redundant `cf &&` in `Number.isFinite(cf) && cf && cf > 0`.
- **P3-16** `src/components/filters/FilterBar.tsx:21` — auto-open advanced panel when `advancedActiveCount > 0` so URL-shared filter state isn't hidden.
- **P3-17** Consolidate `HIGH_CONFIDENCE = 80` / `MEDIUM_CONFIDENCE = 50` thresholds. Currently hardcoded in `src/lib/confidence.ts`, `scripts/audit/comprehensive.ts` (×3), `scripts/sync/estimate-nutrition.ts` (×3), `final-quality-report.ts`. Export from one module.
- **P3-18** Add sodium sanity ceiling (≤6000 mg/item) to all new ingestion scripts (`parse-chain-pdf.ts`, `upgrade-*`, `insert-*`) — addresses the historical mg/kg confusion pattern documented in `MEMORY.md`.

---

## Go / No-Go for Production Scripts

Before running any of the new mutation scripts against the production Supabase project (`rcrzdpzwcbekgqgiwqcp`):

1. ✅ `data/w9-output/` is in `.gitignore` (done this session).
2. ☐ Move signed W-9 PDFs out of the repo working tree.
3. ☐ Scrub PII from `scripts/build-w9-prefilled.ts:26-31`.
4. ☐ Revert `supabase/migrations/00001_initial_schema.sql` to HEAD: `git checkout HEAD -- supabase/migrations/00001_initial_schema.sql`.
5. ☐ Fix `scripts/audit/verify-post-migration.ts` (P1-03) OR delete it (P3-10).
6. ☐ Add `--dry-run` mode to `dedupe-universal-parks.ts` AND wrap each pair in a transaction (P1-04).
7. ☐ Pre-check 00003 readiness:
   ```sql
   SELECT lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g')), COUNT(*)
   FROM parks GROUP BY 1 HAVING COUNT(*) > 1;
   ```
   Confirmed 0 today. Re-run within 5 minutes of applying 00003.
8. ☐ Pre-check `migrate-constraints.ts` CHECK constraints will pass:
   ```sql
   SELECT COUNT(*) FROM nutritional_data
   WHERE fiber > carbs OR sugar > carbs
      OR calories < 0 OR calories > 5000
      OR sodium < 0 OR sodium > 10000
      OR carbs < 0 OR fat < 0 OR protein < 0 OR sugar < 0 OR fiber < 0;
   ```
   Must return 0 before applying.
9. ☐ Run `upgrade-verified-nutrition.ts` BEFORE `upgrade-chain-nutrition.ts` so chain (conf=90) doesn't no-op against more-accurate verified data (conf=95).
10. ☐ For Codex/Groq backfills: disable `fn_nutrition_soft_validate` trigger or set `diabetes.skip_audit` session var to avoid `audit_log` write amplification.

---

## What's Working (keep doing this)

- `src/lib/insulin.ts` + `src/lib/__tests__/insulin.test.ts` — exemplary clinical-math extraction. Pure function, typed inputs/outputs, injected `now`, regression-named test (`'clinical fix: activity reduction applies to carb bolus only, not correction'`). This is the bar for anything dosing-adjacent. Apply the same pattern to audit scoring next.
- `src/lib/confidence.ts` + test — same pattern, equally well-shaped.
- Migrations preserve RLS public-read-only posture; no new write paths exposed to anon.
- `scripts/audit/utils.ts` `NEGATIVE_PATTERNS` correctly encodes the coffee/beer/wine compound-name history. (Counterexample for `accuracy.ts` — see P2-18.)
- Client bundle stays lean: `canvas` / `pdfjs-dist` / `pdf-lib` / `puppeteer` / `groq-sdk` / `googleapis` correctly in devDependencies. Verified `src/lib/supabase.ts` uses only `VITE_*` env vars; no service-role key reference in any `src/` file.
- Lazy-loaded `jspdf` via `Plan.tsx` keeps it out of the main chunk.

---

## Next Steps

1. Address P1 items in order. P1-01 + P1-02 are urgent (public-repo SSN leak risk); the rest are pre-merge blockers.
2. Review the Go/No-Go checklist before running any mutation script against prod.
3. Per-finding todo files live in `todos/` — use `/resolve-todo-parallel` or hand-pick.
4. Optional: run `/test-browser` to exercise affected pages (Home, Browse, Search, Meal, Plan, InsulinHelper).
