---
status: pending
priority: p3
issue_id: 063
tags: [code-review, data, safety, scripts]
dependencies: []
---

# cleanup-duplicate-parks.ts deletes with no --dry-run and weaker normalization

## Problem Statement

It is the one delete-script lacking a dry-run guard, and groups by lower().trim() rather than the canonical normalizeParkName. Ordering is safe, but a mis-group could delete the wrong canonical park and CASCADE away its restaurants. Add --dry-run and reuse normalizeParkName.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 063)
