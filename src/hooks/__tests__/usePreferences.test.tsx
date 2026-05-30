import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferences, __resetPreferencesState } from '../usePreferences'

const STORAGE_KEY = 'dg_preferences'

describe('usePreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.className = ''
    __resetPreferencesState()
  })

  it('starts with defaults', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current.highContrast).toBe(false)
    expect(result.current.fontScale).toBe(1.0)
    expect(result.current.carbGoal).toBe(60)
  })

  it('updates carb goal and persists', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => result.current.setCarbGoal(90))
    expect(result.current.carbGoal).toBe(90)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).carbGoal).toBe(90)
  })

  it('clamps font scale to the allowed range', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => result.current.setFontScale(5))
    expect(result.current.fontScale).toBe(1.6)
    act(() => result.current.setFontScale(0.1))
    expect(result.current.fontScale).toBe(0.8)
  })

  it('toggles high contrast and reflects it on the body class', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => result.current.toggleContrast())
    expect(result.current.highContrast).toBe(true)
    expect(document.body.classList.contains('high-contrast')).toBe(true)
  })

  // Regression for finding 050: the carb-goal-reverting bug. A stale instance
  // must not clobber another instance's write.
  it('keeps two simultaneously-mounted instances in sync (carb goal does not revert)', () => {
    const header = renderHook(() => usePreferences())
    const settings = renderHook(() => usePreferences())

    // Settings raises the carb goal.
    act(() => settings.result.current.setCarbGoal(90))
    expect(header.result.current.carbGoal).toBe(90)

    // Header toggles contrast; the carb goal must survive (previously it snapped
    // back to the stale instance's value).
    act(() => header.result.current.toggleContrast())
    expect(header.result.current.carbGoal).toBe(90)
    expect(settings.result.current.carbGoal).toBe(90)
    expect(settings.result.current.highContrast).toBe(true)
  })

  // Regression for finding 060: a corrupted/partial stored value must fall back
  // to defaults per-field rather than poisoning state.
  it('sanitizes a corrupted stored value to defaults', () => {
    __resetPreferencesState({
      highContrast: 'yes' as unknown as boolean,
      fontScale: NaN,
      carbGoal: -5,
    })
    const { result } = renderHook(() => usePreferences())
    expect(result.current.highContrast).toBe(false)
    expect(result.current.fontScale).toBe(1.0)
    expect(result.current.carbGoal).toBe(60)
  })
})
