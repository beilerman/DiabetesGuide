---
status: complete
priority: p1
issue_id: 008
tags: [code-review, data-integrity, performance]
dependencies: []
---

# estimate-nutrition-ai-nameonly.ts 429 handler sleeps but does not retry

## Problem Statement
`scripts/estimate-nutrition-ai-nameonly.ts:78` handles HTTP 429 (rate-limit) by `await sleep(...)` and then returning `null`. The caller treats `null` as a permanent failure and moves on. The sleep effectively wastes time without giving the request a second chance — strictly worse than failing fast. Net effect: rate-limited items get dropped after a delay rather than retried, and the run takes longer while producing fewer successful estimations.

## Findings
- **Source agent:** code-simplicity-reviewer (also flagged by performance-oracle)
- **Evidence:** `scripts/estimate-nutrition-ai-nameonly.ts:78` — `await sleep(N); return null;` inside the 429 branch.
- **Severity rationale:** Inverts the intent of rate-limit handling. Burns wall-clock time while losing data. Hard to detect without sampling logs.

## Proposed Solutions

### Option A — Retry after sleep with exponential backoff (recommended)
- **What:** Replace `return null` with a retry loop: sleep, retry the LLM call, increment attempt counter, give up after N (e.g., 3) attempts with backoff `2^attempt * baseDelay`. Honor `Retry-After` header if present.
- **Pros:**
  - Actually uses the sleep productively.
  - Respects rate-limit semantics.
  - Standard pattern; reusable.
- **Cons:**
  - Adds ~10 LOC.
  - Must cap retries to prevent infinite loops on persistent 429.
- **Effort:** Small
- **Risk:** Low

### Option B — Remove the sleep entirely; fail fast
- **What:** On 429, return `null` immediately (no sleep). Caller records failure; operator re-runs the script later when quota resets.
- **Pros:**
  - Simplest possible behavior; current API surface unchanged.
  - Saves wall-clock time vs. current implementation.
- **Cons:**
  - Loses any chance at recovery within a single run.
  - Worse user experience (operator must re-run).
- **Effort:** Small
- **Risk:** Low

### Option C — Delete this file (per P3-07)
- **What:** Like `estimate-nutrition-codex.ts`, this is an orphan variant. Active script is `scripts/sync/estimate-nutrition.ts`.
- **Pros:**
  - Removes the bug.
  - Part of the ~2,278 LOC cleanup.
- **Cons:**
  - Loses any unique nameonly estimation behavior.
  - Coordinate with P3-07 deletion set.
- **Effort:** Small
- **Risk:** Low

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-ai-nameonly.ts`
- **Components/modules:** Groq-based nutrition estimation (name-only variant)
- **DB / schema impact:** No (only affects which rows get inserted)

## Acceptance Criteria
- [ ] Either: 429 handler retries the call after sleep (with cap on attempts); or: the sleep is removed and the function fails fast; or: file deleted (P3-07).
- [ ] If retry path chosen: integration test or manual run against rate-limited endpoint confirms successful retry within a single run.
- [ ] Logs distinguish "429 retry succeeded" from "429 retry exhausted" so operator can tell apart.

## Work Log
- **2026-05-28** Chose Option C (delete). Confirmed `scripts/estimate-nutrition-ai-nameonly.ts` is an orphan with zero callers (no `package.json` script, no CI, no docs reference). Deleted the file together with the codex variant under todo 007.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 007 (sibling estimate-nutrition script), P3-07 deletion set
