---
status: pending
priority: p2
issue_id: 019
tags: [code-review, data-integrity, scripts]
dependencies: []
---

# insert-allears-disney can race the new normalized park-name unique index

## Problem Statement
`scripts/insert-allears-disney.ts` auto-creates parks and restaurants on lookup miss. With the new `idx_parks_normalized_name_unique` index on `lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))`, an insert whose JavaScript-side normalization differs from the SQL expression will hit a unique-violation only at write time, leaving the script to fail or duplicate.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/insert-allears-disney.ts` lookup/insert path; index in `supabase/migrations/00003_*` (per review).
- **Severity rationale:** P2 — happens only on first-write race; visible as a script abort, not silent corruption.

## Proposed Solutions

### Option A — Mirror the SQL normalization in JS (recommended)
- **What:** Use the same `lower(regexp_replace(name, /[^a-zA-Z0-9 ]/g, ''))` transform in JS before lookup; perform `upsert` with `onConflict: 'normalized_name'` rather than insert.
- **Pros:** Eliminates the normalization mismatch.
- **Pros:** `upsert` is naturally idempotent.
- **Cons:** Requires keeping JS and SQL transforms in lock-step.
- **Cons:** Need a regression test that proves they match.
- **Effort:** Small
- **Risk:** Low

### Option B — Pre-resolve all park IDs server-side
- **What:** Run a single SQL query that returns `(input_name, resolved_park_id)` for every name in the input batch; fail the batch up front on misses.
- **Pros:** Single round-trip; no race.
- **Pros:** Clear failure mode.
- **Cons:** Loses auto-creation behaviour (may be intentional).
- **Cons:** More refactor surface.
- **Effort:** Medium
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\insert-allears-disney.ts`, possibly `scripts/lib/normalize.ts`
- **Components/modules:** Disney AllEars ingestion script
- **DB / schema impact:** No (consumes existing index)

## Acceptance Criteria
- [ ] JS normalization output identical to SQL `lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))` for a sampled fixture set
- [ ] Insert path uses `upsert` with `onConflict` on the normalized expression
- [ ] Re-running the script is a no-op (idempotency)

## Work Log
- **2026-05-28** Deferred. JS `normalize()` in `scripts/insert-allears-disney.ts` (lines 48-57) does more than the SQL expression: it strips trailing `'s` so "Universal's" matches "Universal", maps `&` → `and`, collapses whitespace, and uses a single non-alphanumeric→space pass. SQL `idx_parks_normalized_name_unique` uses just `lower(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'))`. So the JS lookup is MORE aggressive than the SQL; the script could believe "Universal" and "Universal's" are the same park, fail to find one by SQL-normalized form, attempt to INSERT, and trip the unique constraint. Cleanest fix: switch the INSERT path to `.upsert({...}, { onConflict: '<index_name>', ignoreDuplicates: false }).select('id').single()` so the DB resolves the race; the local cache still uses the existing aggressive JS `normalize()` for lookup since the goal is "find any plausible match." Defer pending verification of the actual `onConflict` argument the Supabase JS client wants for an expression index (may require a named UNIQUE constraint instead of just an index). Low live risk today — only fires on first-write race or fresh DB seed.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 020
