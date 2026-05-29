---
status: pending
priority: p2
issue_id: 026
tags: [code-review, performance, scripts, llm]
dependencies: []
---

# Nutrition-estimation scripts process items strictly serially

## Problem Statement
`scripts/estimate-nutrition-codex.ts:269-283` and `scripts/estimate-nutrition-ai-nameonly.ts:118-143` process items one at a time via `for ... await`, even though Groq's free tier permits 30 req/min and there's no per-request dependency. A semaphore-bounded pool of 3–10 concurrent workers cuts wall time proportionally without exceeding the rate cap.

## Findings
- **Source agent:** performance-oracle
- **Evidence:** `scripts/estimate-nutrition-codex.ts:269-283`, `scripts/estimate-nutrition-ai-nameonly.ts:118-143` — strictly serial loops.
- **Severity rationale:** P2 — long-running offline scripts; not a user-facing path.

## Proposed Solutions

### Option A — Semaphore-bounded worker pool (recommended)
- **What:** Use a small `p-limit`-style helper (or 20-line inline semaphore) with concurrency 5; respect the 30 req/min cap by adding a token-bucket throttle.
- **Pros:** ~5x wall-time reduction.
- **Pros:** Reusable utility across all batch scripts.
- **Cons:** New dependency or 20-line inline helper to test.
- **Cons:** Failure-mode handling more complex than serial.
- **Effort:** Small
- **Risk:** Low

### Option B — Batch the LLM API call (multiple items per prompt)
- **What:** Send 5-item batches in one prompt; parse N rows from response.
- **Pros:** Fewer total requests against rate cap.
- **Pros:** Lower per-call overhead.
- **Cons:** Batch prompts are harder to validate; one item's failure poisons the batch.
- **Cons:** Prompt-injection blast radius scales with batch size.
- **Effort:** Medium
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-codex.ts`, `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-ai-nameonly.ts`, possibly `scripts/lib/pool.ts`
- **Components/modules:** LLM nutrition estimators
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Pool size and rate-limit tokens configurable via env var
- [ ] No HTTP 429 errors during a 200-item smoke run
- [ ] Wall time reduced >=3x vs serial baseline

## Work Log
- **2026-05-28** Deferred / partially obsolete. The two scripts the todo cited (`estimate-nutrition-codex.ts`, `estimate-nutrition-ai-nameonly.ts`) were deleted under P1-007/008. The active LLM estimator is `scripts/estimate-nutrition-ai.ts`, which already batches 5 items per Groq call and throttles to ~10 req/min (line 417 `RATE_LIMIT_DELAY = 6000`) — well under the 30 req/min free-tier cap. The original ~5x parallelism win would require pushing closer to the cap with 2–3 concurrent batches (BATCH_SIZE 5 × 3 = 15 req every 6s ≈ 25 req/min). Net win on a 2,000-item monthly backfill: ~40min → ~15min. Defer; not blocking, and accidental 429 storms would burn through the 14.4K/day quota faster than the speedup is worth.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 023 (sanitization applies inside the worker)
