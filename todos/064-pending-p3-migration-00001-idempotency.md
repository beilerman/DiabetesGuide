---
status: pending
priority: p3
issue_id: 064
tags: [code-review, migration, data]
dependencies: []
---

# 00001_initial_schema.sql is not idempotent / has no transaction wrapper

## Problem Statement

00001 uses bare CREATE TYPE/TABLE/INDEX with no IF NOT EXISTS and no BEGIN/COMMIT, so a partial run leaves the schema half-built (documented in CLAUDE.md). 00002/00003 do this correctly. Do not retro-edit the committed migration; run 00001 in a transaction for fresh environments.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 064)
