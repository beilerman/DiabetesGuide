/**
 * Confidence-score cutoffs used by reports, audits, and the sync pipeline.
 *
 * Keep these in lock-step with `classifyConfidence()` in
 * `src/lib/confidence.ts`. Scripts run via tsx and don't share a TS project
 * with `src/`, so we mirror the constants here rather than importing across
 * the boundary. The numbers themselves are policy decisions about what
 * counts as a high-trust nutrition row in the daily audit.
 */

export const HIGH_CONFIDENCE = 80
export const MEDIUM_CONFIDENCE = 50
