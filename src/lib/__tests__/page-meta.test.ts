import { describe, expect, it } from 'vitest'
import { applyPageMeta, getPageMeta } from '../page-meta'

describe('getPageMeta', () => {
  it('returns route-specific titles and descriptions', () => {
    expect(getPageMeta('/browse')).toMatchObject({
      title: 'Browse Theme Park Menus - DiabetesGuide',
      description: expect.stringContaining('carbs'),
    })

    expect(getPageMeta('/item/abc123')).toMatchObject({
      title: 'Menu Item Details - DiabetesGuide',
      canonicalPath: '/item',
    })

    expect(getPageMeta('/missing-page')).toMatchObject({
      title: 'Page Not Found - DiabetesGuide',
      canonicalPath: '/404',
    })
  })
})

describe('applyPageMeta', () => {
  it('updates document title and common meta tags', () => {
    document.head.innerHTML = '<meta name="description" content="old" /><meta property="og:title" content="old" />'

    applyPageMeta({
      title: 'Search Menus - DiabetesGuide',
      description: 'Search across theme park menus.',
      canonicalPath: '/search',
    })

    expect(document.title).toBe('Search Menus - DiabetesGuide')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Search across theme park menus.')
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute('content', 'Search Menus - DiabetesGuide')
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://diabetesguide.app/search')
  })
})
