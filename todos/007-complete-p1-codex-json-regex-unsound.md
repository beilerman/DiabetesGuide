---
status: complete
priority: p1
issue_id: 007
tags: [code-review, data-integrity]
dependencies: []
---

# estimate-nutrition-codex.ts JSON extraction regex cannot handle nested objects

## Problem Statement
`scripts/estimate-nutrition-codex.ts:144` uses `/\{[^{}]*"calories"[\s\S]*?\}/` to extract a JSON object from the model's response. The leading character class `[^{}]*` prohibits nested braces, so if the model wraps a `meta: {...}` object before the macros object, the regex either fails to match or matches the wrong substring. Today this silently logs items as "no JSON in response," meaning items with otherwise valid LLM output are dropped from the estimation pipeline without any error signal.

## Findings
- **Source agent:** data-integrity-guardian
- **Evidence:** `scripts/estimate-nutrition-codex.ts:144` — `const match = text.match(/\{[^{}]*"calories"[\s\S]*?\}/);`
- **Severity rationale:** Silent data loss in a backfill pipeline. Items are skipped without alert. Hard to detect without manual sampling.

## Proposed Solutions

### Option A — Brace-balancing parse (recommended)
- **What:** Replace regex with a small brace-balancing parser: scan forward from the first `{`, track depth, return the substring at depth 0. Or alternatively, search for the last fenced code block (` ```json ... ``` `) and parse its body via `JSON.parse`.
- **Pros:**
  - Correct for arbitrarily nested JSON.
  - Standard parsing approach; ~15 LOC.
  - Robust to model formatting variation.
- **Cons:**
  - Slightly more code than the regex.
  - Still needs validation that the parsed object contains `calories`.
- **Effort:** Small
- **Risk:** Low

### Option B — Use Codex response_format JSON mode
- **What:** Pass `response_format: { type: "json_object" }` to the Codex call so the entire response is parseable as JSON without extraction.
- **Pros:**
  - Eliminates extraction logic entirely.
  - Guaranteed valid JSON output from model.
- **Cons:**
  - Requires Codex CLI to support the flag (verify first).
  - Changes the prompt contract slightly.
- **Effort:** Small
- **Risk:** Medium (depends on CLI support)

### Option C — Delete the file (per P3-07)
- **What:** This script is one of several orphan `estimate-nutrition-*` variants; the active script is `scripts/sync/estimate-nutrition.ts`. Delete `-codex.ts` along with siblings.
- **Pros:**
  - ~2,278 LOC deletable across all variants.
  - Removes the bug entirely.
- **Cons:**
  - Loses the Codex-specific estimation path if it has unique value.
  - Coordinate with P3-07 / P3-08 deletion set.
- **Effort:** Small
- **Risk:** Low

## Recommended Action
*(blank — filled during triage)*

## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\estimate-nutrition-codex.ts`
- **Components/modules:** Codex-based nutrition estimation
- **DB / schema impact:** No (only affects which rows get inserted)

## Acceptance Criteria
- [ ] Either: regex replaced with a balanced-brace parser and a unit test covering nested-object cases passes; or: file deleted alongside the other orphan variants (P3-07).
- [ ] If kept: running the script against a sample response with `meta: {...}` before the macros extracts the macros correctly.
- [ ] If kept: items previously logged as "no JSON in response" are re-tested and either parse or fail with a clear error (not silently skip).

## Work Log
- **2026-05-28** Chose Option C (delete). Confirmed `scripts/estimate-nutrition-codex.ts` is an orphan — only `scripts/run-codex-overnight.sh` references it, and it is not in `package.json` scripts, CI, or the active CLAUDE.md pipeline. Deleted both files. The active estimation script is `scripts/estimate-nutrition-ai.ts` (mapped to `npm run estimate:ai`).

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Related findings: 008 (sibling estimate-nutrition script), P3-07 deletion set
