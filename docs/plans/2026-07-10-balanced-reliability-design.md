# Balanced Reliability Design

## Goal

Make the checked-in Supabase schema reproduce the database invariants the application relies on, reduce catalog-count transfer volume, and make primary nutrition imports safe under concurrent runs.

## Current State

The clean branch passes 330 unit tests. The live read-only database contains 46 parks, 962 restaurants, 17,306 menu items, and 17,201 nutrition rows. A production preflight found no duplicate nutrition rows, negative nutrition values, or confidence values outside 0-100.

The main reliability gaps are:

- `nutritional_data.menu_item_id` is treated as one-to-one throughout the application but is not unique in the committed schema.
- Several nutrition checks exist only in an SQL-printing audit script, so fresh environments do not receive them through migrations.
- park counts currently download every menu item's `restaurant_id` and aggregate in the browser.
- primary import scripts use read-then-insert behavior that can race when two runs target the same missing row.
- Supabase's 2026 Data API default change means fresh projects need explicit table and function grants.

## Architecture

Add one idempotent migration that:

- enforces one nutrition row per menu item;
- installs the nutrition constraints already supported by production data;
- creates a `SECURITY INVOKER` SQL function that returns one menu-item count row per park;
- revokes default function execution and grants it only to `anon` and `authenticated`;
- explicitly grants read access to the five public catalog tables for reproducible fresh deployments; and
- reloads the PostgREST schema cache.

The frontend will call the aggregate function and convert its rows into the existing `Map<string, number>` cache shape. On RPC failure it will retain the current cached-count and IndexedDB fallbacks. No UI or offline-storage schema changes are required.

The two primary curated nutrition import commands will preserve their confidence checks while using conflict-aware writes for the missing-row path. A concurrent insert will not create a duplicate or overwrite a row unexpectedly.

## Data Flow

1. Home/resort count consumers call `fetchMenuItemCountsOffline`.
2. The function invokes `get_park_menu_item_counts` through Supabase RPC.
3. Returned UUID/count rows are normalized into a `Map` and written to the existing local cache.
4. If the RPC fails, the function reads the cached map; if no map exists, it reconstructs counts from IndexedDB.

Nutrition imports continue to read the existing confidence before deciding whether a write is appropriate. Inserts use the unique `menu_item_id` conflict target, and updates retain confidence guards.

## Failure Handling and Deployment

Before migration application, read-only queries verify that production has no duplicate nutrition rows and satisfies every proposed check. The migration is applied before frontend code that calls the RPC. After application, verification checks:

- uniqueness and check constraints exist and are validated;
- the RPC returns the same per-park totals as the existing calculation;
- the anonymous client can execute the RPC but cannot write catalog data; and
- the full application test, lint, and build baseline remains green.

If migration application fails, the application remains on the old query path until the failure is corrected. The migration does not delete or rewrite production rows.

## Testing

- Static migration contract tests cover uniqueness, checks, function security, and explicit grants.
- Unit tests cover RPC row mapping plus both cache fallback levels.
- Import tests or narrowly scoped source-contract tests cover conflict-aware writes and confidence guards.
- Final verification runs focused tests, the complete Vitest suite, ESLint, and a production build.

## Non-goals

- search redesign or server-side full-text search;
- UI changes;
- IndexedDB schema changes;
- dependency upgrades; and
- migration of the broader audit-log/trigger system.
