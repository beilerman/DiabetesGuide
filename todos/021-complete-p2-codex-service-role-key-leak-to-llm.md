---
status: complete
priority: p2
issue_id: 021
tags: [code-review, security, secrets]
dependencies: []
---

# estimate-nutrition-codex spawns Codex CLI with full process.env (service role key leak)

## Problem Statement
`scripts/estimate-nutrition-codex.ts:121` spawns the Codex CLI subprocess inheriting the parent's full `process.env`, which contains `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `USDA_API_KEY`, and `GROQ_API_KEY`. The Codex agent has no need for any Supabase or API credentials, and sending them widens the trust boundary unnecessarily — a prompt-injection or malicious model response could exfiltrate them.

## Findings
- **Source agent:** security-sentinel
- **Evidence:** `scripts/estimate-nutrition-codex.ts:121` — `spawn(...)` invocation with no `env` override.
- **Severity rationale:** P2 — file may also be deleted per P3-07; if kept, leak surface is non-trivial because Codex sessions are agentic.

## Proposed Solutions

### Option A — Scrub env on spawn (recommended)
- **What:** Build an explicit allowlist env object containing only `PATH`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, and any Codex-specific keys. Drop everything else.
- **Pros:** Defense-in-depth; least-privilege subprocess.
- **Pros:** Trivial to implement.
- **Cons:** Need to discover what Codex actually needs (likely just PATH and home).
- **Cons:** Future env additions need to opt in explicitly.
- **Effort:** Small
- **Risk:** Low

### Option B — Delete the script entirely (per P3-07)
- **What:** Remove `estimate-nutrition-codex.ts` and related orphan variants; consolidate on `scripts/sync/estimate-nutrition.ts`.
- **Pros:** Eliminates the entire risk surface.
- **Pros:** Removes ~2,278 LOC of dead code (simplicity P3-04/P3-07).
- **Cons:** Loses the codex-specific path if needed later.
- **Cons:** May surprise anyone relying on the script locally.
- **Effort:** Small
- **Risk:** Low

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-codex.ts`
- **Components/modules:** Codex CLI subprocess spawn
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Either the script is deleted, OR the spawn explicitly scrubs Supabase/API keys
- [ ] Verified via `strings` or env-dump test that subprocess does not see service role key
- [ ] CI grep ensures no other script spawns subprocesses with full `process.env`

## Work Log
- **2026-05-28** Auto-resolved by P1-007. Chose Option B — `scripts/estimate-nutrition-codex.ts` deleted along with its sole caller `scripts/run-codex-overnight.sh`. No surviving call site spawns the Codex CLI with inherited `process.env`, so the service-role-key leak surface is gone. (If Codex spawning is reintroduced later, add the env-allowlist pattern from Option A.)

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 023 (prompt injection vector compounds risk)
