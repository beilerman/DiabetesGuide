import { describe, it, expect } from 'vitest'
import {
  addRecentSearch,
  clearRecentSearches,
  normalizeQuery,
  RECENT_SEARCHES_STORAGE_KEY,
  DEFAULT_MAX_RECENT_SEARCHES,
} from '../recent-searches'

describe('recent-searches primitives', () => {
  it('exports a stable storage key', () => {
    expect(RECENT_SEARCHES_STORAGE_KEY).toBe('dg_recent_searches')
  })

  it('defaults to keeping 5 recent searches', () => {
    expect(DEFAULT_MAX_RECENT_SEARCHES).toBe(5)
  })

  it('normalizeQuery is case- and whitespace-insensitive', () => {
    expect(normalizeQuery('  Burger  ')).toBe('burger')
  })

  it('adds a new query to the front', () => {
    expect(addRecentSearch(['fries'], 'burger')).toEqual(['burger', 'fries'])
  })

  it('dedupes case-insensitively, moving the entry to the front', () => {
    expect(addRecentSearch(['fries', 'burger'], 'Burger')).toEqual(['Burger', 'fries'])
  })

  it('truncates to maxLen', () => {
    const long = ['a', 'b', 'c', 'd', 'e']
    expect(addRecentSearch(long, 'f', { maxLen: 5 })).toEqual(['f', 'a', 'b', 'c', 'd'])
  })

  it('ignores empty / whitespace queries', () => {
    expect(addRecentSearch(['a'], '   ')).toEqual(['a'])
    expect(addRecentSearch(['a'], '')).toEqual(['a'])
  })

  it('preserves the displayed casing of the new query (not normalized)', () => {
    // Users see what they typed, not lower-case mangling.
    expect(addRecentSearch([], 'Burger King')).toEqual(['Burger King'])
  })

  it('clearRecentSearches returns an empty array', () => {
    expect(clearRecentSearches()).toEqual([])
  })
})
