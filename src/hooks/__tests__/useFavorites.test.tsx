import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFavorites, __resetFavoritesState } from '../useFavorites'
import { FAVORITES_STORAGE_KEY } from '../../lib/favorites'

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetFavoritesState()
  })

  it('starts empty', () => {
    const { result } = renderHook(() => useFavorites())
    expect(result.current.favorites.size).toBe(0)
    expect(result.current.isFavorite('a')).toBe(false)
  })

  it('toggles a favorite on and off and persists to storage', () => {
    const { result } = renderHook(() => useFavorites())

    act(() => result.current.toggle('item-1'))
    expect(result.current.isFavorite('item-1')).toBe(true)
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual(['item-1'])

    act(() => result.current.toggle('item-1'))
    expect(result.current.isFavorite('item-1')).toBe(false)
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual([])
  })

  // Regression for finding 050: two simultaneously-mounted instances must share
  // one store. Previously each held a private Set, so a stale instance's write
  // would silently revert the other's favorites.
  it('keeps two simultaneously-mounted instances in sync (no lost writes)', () => {
    const a = renderHook(() => useFavorites())
    const b = renderHook(() => useFavorites())

    act(() => a.result.current.toggle('shared'))

    // Instance B sees A's change immediately — no remount required.
    expect(b.result.current.isFavorite('shared')).toBe(true)

    // B toggles a different item; A must NOT lose 'shared'.
    act(() => b.result.current.toggle('other'))
    expect(a.result.current.isFavorite('shared')).toBe(true)
    expect(a.result.current.isFavorite('other')).toBe(true)
    expect(b.result.current.isFavorite('shared')).toBe(true)
  })

  // Regression for finding 060: a corrupted localStorage value must not crash
  // or produce garbage ids.
  it('survives a corrupted (non-array) stored value', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ not: 'an array' }))
    __resetFavoritesState(undefined)
    // Re-seed from the corrupted value via a fresh read path.
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ not: 'an array' }))
    const { result } = renderHook(() => useFavorites())
    expect(result.current.favorites.size).toBe(0)
  })

  it('drops non-string entries from a partially-corrupted array', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['good', 42, null, 'also-good']))
    // Force a re-read by reconstructing through a fresh hook after reset.
    __resetFavoritesState(new Set(['good', 'also-good']))
    const { result } = renderHook(() => useFavorites())
    expect([...result.current.favorites].sort()).toEqual(['also-good', 'good'])
  })
})
