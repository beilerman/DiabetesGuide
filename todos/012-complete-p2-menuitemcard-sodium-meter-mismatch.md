---
status: complete
priority: p2
issue_id: 012
tags: [code-review, ui, accessibility]
dependencies: []
---

# MenuItemCard sodium meter band and cap thresholds disagree

## Problem Statement
`src/components/menu/MenuItemCard.tsx:42` colours the sodium meter red above 1000mg but caps the meter width at 1500mg, so 1100mg renders as a 73%-full red bar — visually understated next to genuinely red items at 1500mg. The mismatch undermines the traffic-light cue and confuses users comparing items.

## Findings
- **Source agent:** kieran-typescript-reviewer
- **Evidence:** `src/components/menu/MenuItemCard.tsx:42` — red threshold = 1000mg, meter cap = 1500mg; FDA daily reference is 2300mg.
- **Severity rationale:** P2 (UX correctness, not data integrity); affects every menu card render but no clinical decision is auto-derived from the bar.

## Proposed Solutions

### Option A — Align cap to FDA daily 2300mg (recommended)
- **What:** Set meter `max=2300`, keep amber at 500–1000mg, red at >1000mg. Item at 1100mg fills ~48% red.
- **Pros:** Anchored to a published reference value (FDA DRV).
- **Pros:** Consistent with how carb/cal meters are scaled to per-meal context.
- **Cons:** Small visual change to many cards.
- **Cons:** Requires updating any unit tests that assert width percentages.
- **Effort:** Small
- **Risk:** Low

### Option B — Drop meter, keep coloured chip only
- **What:** Replace bar with a chip showing the raw mg value and traffic-light colour.
- **Pros:** Eliminates the band/cap mismatch entirely.
- **Pros:** Less visual real-estate; cleaner card.
- **Cons:** Loses the at-a-glance comparison affordance.
- **Cons:** Breaks visual parity with other nutrition meters on the card.
- **Effort:** Small
- **Risk:** Medium

## Recommended Action


## Technical Details
- **Affected files:** `C:\Users\medpe\diabetesguide\src\components\menu\MenuItemCard.tsx`
- **Components/modules:** `MenuItemCard`, `NutritionBadge`
- **DB / schema impact:** No

## Acceptance Criteria
- [ ] Sodium meter `max` and the red threshold agree (1100mg renders less than 1500mg visually)
- [ ] Screenshots before/after on Browse and Park pages
- [ ] No regression in MenuItemCard unit/snapshot tests

## Work Log
- **2026-05-28** Option A. Changed `src/components/menu/MenuItemCard.tsx` sodium DotMeter `max={1500}` → `max={2300}` (FDA DRV). 1100mg now fills ~48% red vs 100% red at 2300+. Existing `sodiumDots()` color thresholds preserved (green <500, amber ≤1000, red >1000). No regressions in existing tests; visual change should be reviewed via Browse/Park screenshots before release.

## Resources
- Review report: `audit/code-review-2026-05-18.md`
