---
status: complete
priority: p2
issue_id: 028
tags: [code-review, regression, data-integrity, audit]
dependencies: []
---

# audit/accuracy regex patterns reintroduce false-positive class fixed in 2024

## Problem Statement
`scripts/audit/accuracy.ts:5` defines `BEVERAGE_NAME_PATTERN` with bare `\bcoffee\b` and `\bmilk\b`, and `FRIED_PASTRY_PATTERN` includes bare `\bpie\b`. These will match "Coffee Cake Cookie", "Coconut Milk Bread", "pieces", and "pie crust" — exactly the false-positive class that `scripts/fix-false-positives.ts` was originally written to cure (Feb 2026 audit, per CLAUDE.md history). The regression also ignores the `NEGATIVE_PATTERNS` set already maintained in `scripts/audit/utils.ts`.

## Findings
- **Source agent:** learnings-researcher
- **Evidence:** `scripts/audit/accuracy.ts:5` — `BEVERAGE_NAME_PATTERN` and `FRIED_PASTRY_PATTERN`. Historical fix: `scripts/fix-false-positives.ts`; pattern library: `scripts/audit/utils.ts` `NEGATIVE_PATTERNS`.
- **Severity rationale:** P2 — a known previously-fixed bug being re-introduced. CLAUDE.md explicitly documents this class as "Data Quality Regex Gotchas".

## Proposed Solutions

### Option A — Import NEGATIVE_PATTERNS from utils.ts (recommended)
- **What:** In `accuracy.ts`, import `NEGATIVE_PATTERNS` from `./utils` and require `!NEGATIVE_PATTERNS.some(p => p.test(name))` before applying `BEVERAGE_NAME_PATTERN` / `FRIED_PASTRY_PATTERN`. Add fixtures: "Coffee Cake Cookie", "Coconut Milk Bread", "pieces of chicken" -> must NOT match.
- **Pros:** Single source of truth for negative-pattern exclusions.
- **Pros:** Codifies a previously-learned lesson and prevents future regression.
- **Cons:** Couples accuracy.ts to utils.ts pattern set.
- **Cons:** Requires fixture-based test suite extension.
- **Effort:** Small
- **Risk:** Low

### Option B — Refine each regex with negative lookaheads
- **What:** Replace `\bcoffee\b` with `\bcoffee\b(?!\s+(cake|cookie|crusted|rubbed))`, `\bmilk\b` with `\bmilk\b(?!\s+(bread|chocolate))`, `\bpie\b` with `\bpie\b(?!ces?|\s+crust)`.
- **Pros:** Self-contained; no cross-file import.
- **Pros:** Each pattern explains its own exclusions.
- **Cons:** Diverges from `NEGATIVE_PATTERNS` source of truth — two places to maintain.
- **Cons:** Hand-rolled lookaheads invite the next false-positive class.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\scripts\audit\accuracy.ts`, `C:\Users\medpe\diabetesguide\scripts\audit\__tests__\accuracy.test.ts`, reference `C:\Users\medpe\diabetesguide\scripts\audit\utils.ts`
- **Components/modules:** Accuracy audit regex set
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Fixtures "Coffee Cake Cookie", "Coconut Milk Bread", "Beer-battered Onion Rings", "pieces", "pie crust" do NOT match
- [ ] Fixtures "Black Coffee", "Whole Milk", "Apple Pie" DO match
- [ ] `accuracy.test.ts` covers the new fixtures
- [ ] CLAUDE.md "Data Quality Regex Gotchas" section unchanged or strengthened

## Work Log
- **2026-05-28** Variant of Option B (purpose-built compound-word guards in `accuracy.ts` rather than importing `utils.NEGATIVE_PATTERNS`, which is alcohol-specific and would over-match e.g. "Beer-battered Onion Rings"). Added two regexes: `NON_BEVERAGE_CONTEXT` (cake/cookie/bread/cheesecake/crusted/rubbed/braised/brined/marinated/infused/frosting/drizzle/cupcake/muffin/brownie/pastry/pancake/waffle) — short-circuits `isLikelyBeverage` so "Coffee Cake Cookie" and "Coconut Milk Bread" are no longer treated as beverages — and `NON_FRIED_CONTEXT` (`mac and cheese` family) — short-circuits the new `looksFriedOrPastry` helper so "Crispy Mac & Cheese" doesn't trip the fat=0 fried check. Added two regression fixtures in `accuracy.test.ts` for both classes. CLAUDE.md "Data Quality Regex Gotchas" content unchanged — this fix mirrors the documented lesson.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
- Historical fix: `scripts/fix-false-positives.ts`
- Negative-pattern library: `scripts/audit/utils.ts` `NEGATIVE_PATTERNS`
- Related findings: 011
