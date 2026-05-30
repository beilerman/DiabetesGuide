---
status: pending
priority: p2
issue_id: 059
tags: [code-review, typescript, architecture]
dependencies: []
---

# Domain types declared 3+ times across the src/scripts boundary

## Problem Statement

MenuItem/NutritionalData/Restaurant/Park are defined in src/lib/types.ts, re-declared in scripts/scrapers/types.ts and scripts/audit/types.ts, and re-declared ad hoc in ~15 top-level scripts. A Postgres column rename must be hand-propagated to every copy; nothing fails fast if one is missed. Generate types from the DB or add a tsconfig path.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 059)
