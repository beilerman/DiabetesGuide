---
status: pending
priority: p2
issue_id: 056
tags: [code-review, race, offline]
dependencies: []
---

# Offline timing: lastSync read races itself; cache writes interleave and swallow quota errors

## Problem Statement

(a) useOfflineStatus runs getLastSync().then(setLastSyncState) on every isOnline change with no cancellation token, so rapid connectivity flaps can land an older read last (stale banner timestamp). (b) writeAllItems(items).catch(()=>{}) is fire-and-forget; a fallback readAllItems during a drop can race a half-written transaction, and a quota failure is silently swallowed.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 056)
