# Balanced Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Supabase schema invariants reproducible, reduce park-count transfer from thousands of rows to one row per park, and harden curated nutrition imports against concurrent inserts.

**Architecture:** An idempotent Supabase migration adds catalog grants, nutrition constraints, a one-row-per-item uniqueness rule, and a restricted `SECURITY INVOKER` aggregate RPC. The React data layer calls that RPC while retaining its existing local-cache and IndexedDB fallbacks; primary curated import scripts use conflict-aware writes against the new unique key.

**Tech Stack:** PostgreSQL/Supabase migrations, PostgREST RPC via `@supabase/supabase-js`, TypeScript, Vitest, React Query, IndexedDB.

---

### Task 1: Lock the database contract with a failing test

**Files:**
- Modify: `scripts/__tests__/static-deployment-assets.test.ts`
- Test: `scripts/__tests__/static-deployment-assets.test.ts`

**Step 1: Write the failing migration assertions**

Extend the migration test to require:

```ts
expect(migrations).toMatch(/uq_nutritional_data_menu_item_id/i)
expect(migrations).toMatch(/check\s*\(.*confidence_score.*between\s+0\s+and\s+100/is)
expect(migrations).toMatch(/get_park_menu_item_counts/i)
expect(migrations).toMatch(/security\s+invoker/i)
expect(migrations).toMatch(/revoke\s+execute.*from\s+public/is)
expect(migrations).toMatch(/grant\s+execute.*to\s+anon\s*,\s*authenticated/is)
expect(migrations).toMatch(/grant\s+select.*parks.*restaurants.*menu_items.*nutritional_data.*allergens.*to\s+anon/is)
```

Also require non-negative macro checks and `fiber <= carbs` / `sugar <= carbs` checks using stable constraint names rather than matching formatting details.

**Step 2: Run the focused test and confirm failure**

Run: `npx vitest run scripts/__tests__/static-deployment-assets.test.ts`

Expected: FAIL because the uniqueness rule, aggregate RPC, and explicit grants are absent.

**Step 3: Commit the failing contract test**

```powershell
git add scripts/__tests__/static-deployment-assets.test.ts
git commit -m "test(db): define catalog reliability contract"
```

### Task 2: Add the catalog reliability migration

**Files:**
- Create: `supabase/migrations/<generated>_catalog_reliability.sql`
- Test: `scripts/__tests__/static-deployment-assets.test.ts`

**Step 1: Discover the installed CLI command and generate the migration**

Run:

```powershell
npx supabase migration --help
npx supabase migration new catalog_reliability
```

Expected: a timestamped SQL file appears in `supabase/migrations/`.

**Step 2: Add the minimal idempotent SQL**

The migration must:

```sql
create unique index if not exists uq_nutritional_data_menu_item_id
  on public.nutritional_data (menu_item_id);

-- Add named checks through guarded DO blocks so existing installations remain idempotent.
-- Checks: confidence 0..100, calories/macros/sodium/cholesterol/alcohol non-negative,
-- fiber <= carbs, and sugar <= carbs. Add range ceilings only when production preflight proves them.

create or replace function public.get_park_menu_item_counts()
returns table (park_id uuid, item_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.park_id, count(m.id)::bigint
  from public.restaurants as r
  left join public.menu_items as m on m.restaurant_id = r.id
  group by r.park_id
$$;

revoke execute on function public.get_park_menu_item_counts() from public;
grant execute on function public.get_park_menu_item_counts() to anon, authenticated;

grant select on table public.parks, public.restaurants, public.menu_items,
  public.nutritional_data, public.allergens to anon, authenticated;

notify pgrst, 'reload schema';
```

Use `DO ... EXCEPTION WHEN duplicate_object` for named constraints. Do not delete or rewrite production data.

**Step 3: Run the migration contract test**

Run: `npx vitest run scripts/__tests__/static-deployment-assets.test.ts`

Expected: PASS.

**Step 4: Commit the migration**

```powershell
git add supabase/migrations scripts/__tests__/static-deployment-assets.test.ts
git commit -m "feat(db): enforce catalog reliability invariants"
```

### Task 3: Replace row-by-row park counting with the aggregate RPC

**Files:**
- Modify: `src/lib/offline-queries.ts`
- Modify: `src/lib/__tests__/offline-queries.test.ts`
- Modify: `src/lib/menu-counts.ts` only if the RPC-row mapper belongs with existing count helpers

**Step 1: Write failing RPC mapping and fallback tests**

Add tests that inject an aggregate-row fetcher into `fetchMenuItemCountsOffline`:

```ts
const fetchCountRows = vi.fn().mockResolvedValue([
  { park_id: 'park-1', item_count: 12 },
  { park_id: 'park-2', item_count: '7' },
])

const result = await fetchMenuItemCountsOffline({ fetchCountRows })
expect([...result]).toEqual([['park-1', 12], ['park-2', 7]])
```

Add one test where the RPC throws and `readMenuItemCountsCache` supplies a map, and one where both RPC and cached map are unavailable so IndexedDB reconstruction is used.

**Step 2: Run focused tests and confirm failure**

Run: `npx vitest run src/lib/__tests__/offline-queries.test.ts`

Expected: FAIL because aggregate-row injection and mapping do not exist.

**Step 3: Implement the RPC fetcher and mapper**

Add a row type:

```ts
interface ParkMenuItemCountRow {
  park_id: string
  item_count: number | string
}
```

The production fetcher calls:

```ts
const { data, error } = await supabase.rpc('get_park_menu_item_counts')
if (error) throw error
return (data ?? []) as ParkMenuItemCountRow[]
```

Normalize only non-empty park IDs and finite non-negative counts. Replace the full `menu_items.restaurant_id` pagination path with this fetcher, leaving the current cache and IndexedDB fallback behavior intact.

**Step 4: Run focused tests**

Run: `npx vitest run src/lib/__tests__/offline-queries.test.ts`

Expected: PASS.

**Step 5: Commit the query improvement**

```powershell
git add src/lib/offline-queries.ts src/lib/__tests__/offline-queries.test.ts src/lib/menu-counts.ts
git commit -m "perf(data): aggregate park counts in Supabase"
```

### Task 4: Harden curated nutrition imports

**Files:**
- Modify: `scripts/import-ai-nutrition.ts`
- Modify: `scripts/import-researched-nutrition.ts`
- Create or modify: `scripts/__tests__/nutrition-import-contract.test.ts`

**Step 1: Write failing source-contract tests**

Read both scripts and assert their missing-row writes use the `menu_item_id` conflict target with duplicate-ignore behavior. Assert normal update paths retain a confidence predicate; keep the explicit `--force` path in `import-ai-nutrition.ts` exempt from that predicate.

**Step 2: Run the focused test and confirm failure**

Run: `npx vitest run scripts/__tests__/nutrition-import-contract.test.ts`

Expected: FAIL because both scripts currently use plain inserts and unguarded updates after a read.

**Step 3: Implement conflict-aware writes**

For missing rows, use:

```ts
supabase
  .from('nutritional_data')
  .upsert({ menu_item_id: itemId, ...fields }, {
    onConflict: 'menu_item_id',
    ignoreDuplicates: true,
  })
```

For non-forced updates, include a database-side confidence predicate so a concurrent higher-confidence write cannot be downgraded between the read and update. Preserve dry-run behavior, logging, and the explicit forced-correction behavior.

**Step 4: Run focused and script-related tests**

Run:

```powershell
npx vitest run scripts/__tests__/nutrition-import-contract.test.ts
npx tsc -p tsconfig.scripts.json --noEmit
```

Expected: PASS.

**Step 5: Commit the import hardening**

```powershell
git add scripts/import-ai-nutrition.ts scripts/import-researched-nutrition.ts scripts/__tests__/nutrition-import-contract.test.ts
git commit -m "fix(data): make nutrition imports conflict safe"
```

### Task 5: Preflight and apply the migration to production

**Files:**
- Read: generated `supabase/migrations/*_catalog_reliability.sql`
- Do not modify production rows during preflight

**Step 1: Run read-only production preflight**

Using the configured public client, verify:

- no duplicate `nutritional_data.menu_item_id` groups;
- no rows violate each proposed check;
- aggregate totals computed through existing public tables match current cached/catalog totals.

Expected: zero blockers. If any blocker exists, stop before DDL and revise the migration without deleting data.

**Step 2: Apply the exact committed migration**

Use the authenticated Supabase dashboard SQL editor or an already linked CLI session. Apply the committed migration file verbatim; do not hand-edit a production-only variant.

**Step 3: Verify the production schema and API**

Using the anonymous client:

```ts
await supabase.rpc('get_park_menu_item_counts')
```

Confirm it returns one row per park and matches the legacy calculation. Attempt a harmless write that must be rejected by RLS, and verify duplicate nutrition insertion is rejected inside a rolled-back transaction or through schema inspection without altering catalog data.

**Step 4: Record deployment evidence**

Add a concise deployment note to the implementation handoff containing the applied migration name, UTC application time, row totals, RPC result count, and verification outcomes. Do not store credentials or tokens.

### Task 6: Full verification and review

**Files:**
- Review all files changed by Tasks 1-5

**Step 1: Run full verification**

Run:

```powershell
npm test
npm run lint
npm run build
git diff HEAD~4 --check
```

Expected: all tests pass, lint has no errors, build succeeds, and diff check is clean.

**Step 2: Inspect repository state**

Run:

```powershell
git status --short
git log --oneline -6
```

Expected: only intentional committed changes on `improve/balanced-reliability`; the original checkout's unrelated audit edits remain untouched.

**Step 3: Perform a final correctness/security review**

Check RPC privileges, RLS behavior, migration idempotence, count fallback behavior, and confidence race handling. Fix and re-run verification for any concrete issue found.
