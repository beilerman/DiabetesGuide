import { describe, expect, it } from 'vitest'
import { averageIgnoringNulls } from '../utils.js'

describe('averageIgnoringNulls', () => {
  it('averages defined numbers', () => {
    expect(averageIgnoringNulls([10, 20, 30])).toBe(20)
  })

  it('skips nulls instead of treating them as zero', () => {
    // Critical: with `?? 0` the average would be (60 + 0 + 0) / 3 = 20.
    // Empty-shell rows in nutritional_data have confidence_score = null,
    // not 0 — counting them as zero phantom-drags the bucket average.
    expect(averageIgnoringNulls([60, null, null])).toBe(60)
  })

  it('skips undefined the same as null', () => {
    expect(averageIgnoringNulls([40, undefined, 80])).toBe(60)
  })

  it('returns null when every value is null/undefined', () => {
    expect(averageIgnoringNulls([null, null, undefined])).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(averageIgnoringNulls([])).toBeNull()
  })

  it('handles a single defined value', () => {
    expect(averageIgnoringNulls([null, 42, null])).toBe(42)
  })
})
