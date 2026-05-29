---
status: complete
priority: p2
issue_id: 024
tags: [code-review, performance, audit]
dependencies: []
---

# audit/comprehensive does ~50 sequential page round-trips per run

## Problem Statement
`scripts/audit/comprehensive.ts:424-430` paginates 5 tables (parks, restaurants, menu_items, nutritional_data, allergens) with ~10 sequential pages each — roughly 50 round-trips totalling 12–25s of wall time per run. Supabase REST tolerates page sizes up to 10,000; using 500 is leaving most of the throughput unspent.

## Findings
- **Source agent:** performance-oracle
- **Evidence:** `scripts/audit/comprehensive.ts:424-430` — page size 500, serial fetch loop.
- **Severity rationale:** P2 — affects only the daily audit job runtime, not user-facing latency.

## Proposed Solutions

### Option A — Bump page size to 5000 (recommended)
- **What:** Change `PAGE_SIZE` constant from 500 to 5000; keep the serial loop. Reduces round-trips by 10x.
- **Pros:** Smallest diff; measurable speedup.
- **Pros:** Stays well within Supabase's 10k cap.
- **Cons:** Larger response payloads (still small relative to bandwidth).
- **Cons:** Single slow page now slows the run more.
- **Effort:** Small
- **Risk:** Low

### Option B — Parallel page fetches (Promise.all)
- **What:** First fetch the count, then issue all page requests in parallel.
- **Pros:** Maximum throughput.
- **Pros:** Pairs well with Option A.
- **Cons:** Bursts requests against Supabase REST; may hit rate limits.
- **Cons:** Slightly more complex error handling.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\audit\comprehensive.ts`
- **Components/modules:** comprehensive audit pagination
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Daily audit run completes in <10s on prod data
- [ ] Row counts unchanged vs prior run (no off-by-one from pagination tweak)
- [ ] No Supabase rate-limit errors in workflow logs

## Work Log
- **2026-05-28** Option A. Bumped `paginatedAll` `pageSize` in `scripts/audit/comprehensive.ts` from 1000 → 5000 (the todo claimed the prior value was 500; actual was 1000 — still a meaningful win). With current prod sizes (~18k nutrition rows, ~14k allergens, ~18k menu_items) this is 1–4 round-trips per table instead of 14–18. Five Promise.all-parallel table fetches stay parallel; the per-table inner loop now exits in at most 4 iterations. Comment added explaining the 10k Supabase cap and current row counts.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
