import { describe, it, expect } from 'vitest'
import { updateGraduation } from '../graduation.js'
import type { GraduationState } from '../types.js'

function makeState(overrides: Partial<GraduationState> = {}): GraduationState {
  return {
    mode: 'daily',
    consecutiveCleanDays: 0,
    lastAudit: '2026-02-25',
    autoFixesApplied: 0,
    graduationThreshold: 14,
    history: [],
    ...overrides,
  }
}

describe('updateGraduation', () => {
  it('increments clean day counter on clean run', () => {
    const state = makeState({ consecutiveCleanDays: 5 })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 10 }, 0)
    expect(result.consecutiveCleanDays).toBe(6)
  })

  it('resets counter when HIGH findings exist', () => {
    const state = makeState({ consecutiveCleanDays: 10 })
    const result = updateGraduation(state, { high: 1, medium: 0, low: 0 }, 0)
    expect(result.consecutiveCleanDays).toBe(0)
  })

  it('resets counter when auto-fixes were applied', () => {
    const state = makeState({ consecutiveCleanDays: 10 })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 5 }, 3)
    expect(result.consecutiveCleanDays).toBe(0)
  })

  it('graduates to weekly after 14 clean days', () => {
    const state = makeState({ consecutiveCleanDays: 13 })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 2 }, 0)
    expect(result.consecutiveCleanDays).toBe(14)
    expect(result.mode).toBe('weekly')
  })

  it('reverts to daily if weekly run has HIGH findings', () => {
    const state = makeState({ mode: 'weekly', consecutiveCleanDays: 20 })
    const result = updateGraduation(state, { high: 1, medium: 0, low: 3 }, 0)
    expect(result.mode).toBe('daily')
    expect(result.consecutiveCleanDays).toBe(0)
  })

  it('keeps history to 30 entries', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      high: 0,
      medium: 0,
      low: 0,
      autoFixes: 0,
    }))
    const state = makeState({ history })
    const result = updateGraduation(state, { high: 0, medium: 0, low: 1 }, 0)
    expect(result.history).toHaveLength(30)
    // Oldest entry should have been dropped; newest is today's
    expect(result.history[0].date).toBe('2026-01-02')
    expect(result.history[29].date).toBe(new Date().toISOString().slice(0, 10))
  })
})
