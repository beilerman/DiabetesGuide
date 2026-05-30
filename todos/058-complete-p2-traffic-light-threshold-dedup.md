---
status: pending
priority: p2
issue_id: 058
tags: [code-review, quality]
dependencies: []
---

# Traffic-light thresholds duplicated across nutrition-colors and MenuItemCard

## Problem Statement

The carb/sugar/calorie/sodium green/amber bands are encoded twice: nutrition-colors.ts (Tailwind classes) and MenuItemCard.tsx (*Dots color names). They agree today only by manual coincidence; tuning one file creates a silent traffic-light/dot mismatch on the same card.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 058)
