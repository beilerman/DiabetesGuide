---
status: pending
priority: p2
issue_id: 025
tags: [code-review, performance, scripts]
dependencies: []
---

# upgrade-chain-nutrition is O(n*m) regex + serial DB writes

## Problem Statement
`scripts/upgrade-chain-nutrition.ts:327-338` matches every menu item (~9,261) against every chain restaurant pattern (~80) via regex — roughly 740K regex tests — then issues per-match DB updates serially. End-to-end this is 10–20s of unnecessary CPU + network time. Indexing by lowercased name prefix and batching writes with `Promise.all` chunks reduces both.

## Findings
- **Source agent:** performance-oracle
- **Evidence:** `scripts/upgrade-chain-nutrition.ts:327-338` — nested loops + serial `await update(...)`.
- **Severity rationale:** P2 — operational pain, not user-facing.

## Proposed Solutions

### Option A — Prefix index + chunked Promise.all (recommended)
- **What:** Build `Map<lowercasedFirstWord, ChainPattern[]>`, look up candidates per item; batch updates in chunks of 10 with `Promise.all`.
- **Pros:** Cuts regex tests by >90% in practice; parallelizes the writes.
- **Pros:** Pattern reusable for other matchers.
- **Cons:** Slightly more code than the simple double loop.
- **Cons:** Chunked writes need backoff on PG error.
- **Effort:** Medium
- **Risk:** Low

### Option B — Batch updates only
- **What:** Keep the O(n*m) regex pass, but switch from per-match update to `upsert` batches of 100 IDs at a time.
- **Pros:** Minimal code change; majority of the latency wins.
- **Pros:** Easier to reason about correctness.
- **Cons:** CPU cost of regex pass remains.
- **Cons:** Won't scale further as chain list grows.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\upgrade-chain-nutrition.ts`
- **Components/modules:** Chain nutrition matcher
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Full run completes in <5s on prod data
- [ ] Match set identical to baseline (regression test on a sample of 50 items)
- [ ] No new lint/type errors

## Work Log
- **2026-05-28** Deferred. Performance-only; no correctness issue. The script is an operator-triggered backfill, not a user-facing path. Current cost: ~9,000 items × ~80 patterns ≈ 720K regex tests + serial writes; the precedence-guard fix added under P2-018 means most rows now no-op without writing, so the regex pass is the dominant cost on re-runs. Recommended approach when picked back up: bucket patterns by `restaurantPattern` first-word (case-folded), iterate items once per bucket, then `Promise.all` chunks of 10 writes with a small `setTimeout` back-pressure between chunks. Pair with P2-026 since both want the same `scripts/lib/pool.ts` semaphore helper.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 018, 026
