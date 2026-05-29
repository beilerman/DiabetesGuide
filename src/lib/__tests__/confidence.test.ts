import { describe, it, expect } from 'vitest'
import { summarizeConfidence } from '../confidence'

const NOW = Date.parse('2026-05-04T00:00:00Z')

function months(n: number): string {
  return new Date(NOW - n * 30 * 24 * 60 * 60 * 1000).toISOString()
}

describe('summarizeConfidence', () => {
  it('returns "no nutrition data" when nd is null', () => {
    const s = summarizeConfidence(null, NOW)
    expect(s.source).toBe('unknown')
    expect(s.uncertaintyG).toBeNull()
    expect(s.warnForDosing).toBe(true)
  })

  it('classifies official + high confidence + fresh as tight uncertainty and no warning', () => {
    const s = summarizeConfidence(
      { source: 'official', confidence_score: 90, updated_at: months(2) },
      NOW,
    )
    expect(s.source).toBe('official')
    expect(s.confidence).toBe('high')
    expect(s.freshness).toBe('fresh')
    expect(s.uncertaintyG).toBe(5)
    expect(s.warnForDosing).toBe(false)
  })

  it('flags freshness when updated_at is older than 12 months', () => {
    const s = summarizeConfidence(
      { source: 'official', confidence_score: 90, updated_at: months(14) },
      NOW,
    )
    expect(s.freshness).toBe('stale')
    expect(s.freshnessLabel).toMatch(/12 months/)
    expect(s.warnForDosing).toBe(true)
  })

  it('flags very-stale when updated_at is older than 24 months', () => {
    const s = summarizeConfidence(
      { source: 'official', confidence_score: 90, updated_at: months(30) },
      NOW,
    )
    expect(s.freshness).toBe('very-stale')
    expect(s.freshnessLabel).toMatch(/2 years/)
  })

  it('classifies api_lookup with medium confidence with a wider band', () => {
    const s = summarizeConfidence(
      { source: 'api_lookup', confidence_score: 60, updated_at: months(3) },
      NOW,
    )
    expect(s.source).toBe('usda')
    expect(s.confidence).toBe('medium')
    expect(s.uncertaintyG).toBe(12)
    expect(s.warnForDosing).toBe(false)
  })

  it('always warns for dosing on AI-estimated rows regardless of confidence', () => {
    const s = summarizeConfidence(
      { source: 'crowdsourced', confidence_score: 90, updated_at: months(1) },
      NOW,
    )
    expect(s.source).toBe('ai')
    expect(s.warnForDosing).toBe(true)
    expect(s.uncertaintyG).toBeGreaterThanOrEqual(12)
  })

  it('treats null updated_at as "never verified" and warns', () => {
    const s = summarizeConfidence(
      { source: 'official', confidence_score: 90, updated_at: null },
      NOW,
    )
    expect(s.freshness).toBe('unknown')
    expect(s.freshnessLabel).toMatch(/never verified/i)
    expect(s.warnForDosing).toBe(true)
  })

  it('handles empty shells (null confidence_score) by widening the band', () => {
    const s = summarizeConfidence(
      { source: 'crowdsourced', confidence_score: null, updated_at: months(1) },
      NOW,
    )
    expect(s.confidence).toBe('unknown')
    expect(s.uncertaintyG).toBe(25)
    expect(s.warnForDosing).toBe(true)
  })
})
