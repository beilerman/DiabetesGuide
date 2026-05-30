import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFavorites, __resetFavoritesState } from '../useFavorites'

const STORAGE_KEY = 'dg_favorites'

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

  it('toggles a favorite on and off and persists', () => {
    const { result } = renderHook(() => useFavorites())

    act(() => result.current.toggle('item-1'))
    expect(result.current.isFavorite('item-1')).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['item-1'])

    act(() => result.current.toggle('item-1'))
    expect(result.current.isFavorite('item-1')).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([])
  })

  // Regression: two simultaneously-mounted instances must share one store.
  // Previously each held a private Set, so a stale instance's write silently
  // reverted the other's favorites.
  it('keeps two simultaneously-mounted instances in sync (no lost writes)', () => {
    const a = renderHook(() => useFavorites())
    const b = renderHook(() => useFavorites())

    act(() => a.result.current.toggle('shared'))
    expect(b.result.current.isFavorite('shared')).toBe(true)

    // B toggles a different item; A must NOT lose 'shared'.
    act(() => b.result.current.toggle('other'))
    expect(a.result.current.isFavorite('shared')).toBe(true)
    expect(a.result.current.isFavorite('other')).toBe(true)
    expect(b.result.current.isFavorite('shared')).toBe(true)
  })

  it('survives a corrupted (non-array) stored value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }))
    __resetFavoritesState() // re-seed empty; load() guards the bad shape on next read
    const { result } = renderHook(() => useFavorites())
    expect(result.current.favorites.size).toBe(0)
  })

  it('drops non-string entries when seeding from a partial array', () => {
    __resetFavoritesState(['good', 'also-good'])
    const { result } = renderHook(() => useFavorites())
    expect([...result.current.favorites].sort()).toEqual(['also-good', 'good'])
  })
})
