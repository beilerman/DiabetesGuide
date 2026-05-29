import { describe, it, expect } from 'vitest'
import { addFavorite, removeFavorite, toggleFavorite, FAVORITES_STORAGE_KEY } from '../favorites'

describe('favorites primitives', () => {
  it('exports a stable storage key', () => {
    // The key is part of the public contract — any future change breaks
    // existing users' localStorage. Keep this assertion as the canary.
    expect(FAVORITES_STORAGE_KEY).toBe('dg_favorites')
  })

  it('addFavorite returns a new set with id present', () => {
    const before = new Set<string>(['a'])
    const after = addFavorite(before, 'b')
    expect(after.has('b')).toBe(true)
    expect(after).not.toBe(before)
  })

  it('addFavorite is idempotent for an existing id', () => {
    const before = new Set<string>(['a'])
    const after = addFavorite(before, 'a')
    expect([...after]).toEqual(['a'])
  })

  it('removeFavorite drops the id', () => {
    const before = new Set<string>(['a', 'b'])
    const after = removeFavorite(before, 'a')
    expect(after.has('a')).toBe(false)
    expect(after.has('b')).toBe(true)
  })

  it('removeFavorite is idempotent for missing ids', () => {
    const before = new Set<string>(['a'])
    const after = removeFavorite(before, 'z')
    expect([...after]).toEqual(['a'])
  })

  it('toggleFavorite adds when absent, removes when present', () => {
    const empty = new Set<string>()
    const added = toggleFavorite(empty, 'x')
    expect(added.has('x')).toBe(true)
    const removed = toggleFavorite(added, 'x')
    expect(removed.has('x')).toBe(false)
  })

  it('always returns a fresh Set (reference inequality) so React re-renders', () => {
    const before = new Set<string>(['a'])
    expect(addFavorite(before, 'b')).not.toBe(before)
    expect(removeFavorite(before, 'a')).not.toBe(before)
    expect(toggleFavorite(before, 'a')).not.toBe(before)
  })
})
