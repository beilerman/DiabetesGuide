import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePreferences } from '../usePreferences'

beforeEach(() => {
  localStorage.clear()
  document.body.classList.remove('high-contrast')
  document.documentElement.style.fontSize = ''
})

describe('usePreferences', () => {
  it('keeps multiple hook consumers synchronized in the same page', () => {
    const first = renderHook(() => usePreferences())
    const second = renderHook(() => usePreferences())

    act(() => {
      first.result.current.toggleContrast()
    })

    expect(first.result.current.highContrast).toBe(true)
    expect(second.result.current.highContrast).toBe(true)
    expect(document.body.classList.contains('high-contrast')).toBe(true)
  })

  it('resets stored preferences back to defaults', () => {
    const first = renderHook(() => usePreferences())
    const second = renderHook(() => usePreferences())

    act(() => {
      first.result.current.setFontScale(1.4)
      first.result.current.setCarbGoal(90)
      first.result.current.toggleContrast()
    })

    act(() => {
      second.result.current.resetPreferences()
    })

    expect(first.result.current.fontScale).toBe(1)
    expect(first.result.current.carbGoal).toBe(60)
    expect(first.result.current.highContrast).toBe(false)
    expect(JSON.parse(localStorage.getItem('dg_preferences') ?? '{}')).toEqual({
      carbGoal: 60,
      fontScale: 1,
      highContrast: false,
    })
  })
})
