---
status: pending
priority: p2
issue_id: 055
tags: [code-review, performance]
dependencies: []
---

# No list virtualization; thousands of heavy cards mount at once

## Problem Statement

Browse and ParkDetail render one heavy card (multiple SVGs, 4 DotMeter subtrees, badges) per item with no windowing. With finding 049 unfixed that was ~9,261 cards; even per-park views render hundreds. Tens of thousands of DOM nodes drive mobile memory pressure and scroll-time layout cost. Consider @tanstack/react-virtual.

## Resources

- Full review writeup: `audit/code-review-2026-05-30.md` (finding 055)
