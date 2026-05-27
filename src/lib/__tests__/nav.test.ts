import { describe, expect, it } from 'vitest'
import { getBottomNavItems, getTopNavItems, isNavItemActive } from '../nav'

describe('navigation metadata', () => {
  it('uses the same shared labels for top and bottom navigation where items overlap', () => {
    expect(getBottomNavItems().map(item => item.label)).toEqual([
      'Home',
      'Search',
      'Meal Builder',
      'Favorites',
      'Menu',
    ])

    const topLabels = getTopNavItems().map(item => item.label)
    for (const item of getBottomNavItems()) {
      expect(topLabels).toContain(item.label)
    }
  })

  it('matches route families for active navigation state', () => {
    const [home, search, , mealBuilder, favorites, menu] = getTopNavItems()

    expect(isNavItemActive(home, '/resort/wdw/theme-parks')).toBe(true)
    expect(isNavItemActive(search, '/search')).toBe(true)
    expect(isNavItemActive(mealBuilder, '/meal')).toBe(true)
    expect(isNavItemActive(favorites, '/plan')).toBe(true)
    expect(isNavItemActive(menu, '/settings')).toBe(true)
  })
})
