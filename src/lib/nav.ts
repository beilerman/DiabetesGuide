export type NavItemId = 'home' | 'search' | 'browse' | 'meal-builder' | 'favorites' | 'menu'

export interface NavItem {
  id: NavItemId
  label: string
  href: string
  showInTopNav: boolean
  showInBottomNav: boolean
  activePathPrefixes?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/',
    showInTopNav: true,
    showInBottomNav: true,
    activePathPrefixes: ['/park', '/resort'],
  },
  {
    id: 'search',
    label: 'Search',
    href: '/search',
    showInTopNav: true,
    showInBottomNav: true,
  },
  {
    id: 'browse',
    label: 'Browse',
    href: '/browse',
    showInTopNav: true,
    showInBottomNav: false,
  },
  {
    id: 'meal-builder',
    label: 'Meal Builder',
    href: '/meal',
    showInTopNav: true,
    showInBottomNav: true,
  },
  {
    id: 'favorites',
    label: 'Favorites',
    href: '/plan',
    showInTopNav: true,
    showInBottomNav: true,
    activePathPrefixes: ['/favorites'],
  },
  {
    id: 'menu',
    label: 'Menu',
    href: '/more',
    showInTopNav: true,
    showInBottomNav: true,
    activePathPrefixes: [
      '/about',
      '/advice',
      '/contact',
      '/data-sources',
      '/guide',
      '/insulin',
      '/methodology',
      '/more',
      '/packing',
      '/privacy',
      '/settings',
    ],
  },
]

export function getTopNavItems(): NavItem[] {
  return NAV_ITEMS.filter(item => item.showInTopNav)
}

export function getBottomNavItems(): NavItem[] {
  return NAV_ITEMS.filter(item => item.showInBottomNav)
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const normalizedPathname = normalizePath(pathname)
  const itemPath = normalizePath(item.href)

  if (item.id === 'home') {
    return normalizedPathname === '/' || matchesPrefix(normalizedPathname, item.activePathPrefixes ?? [])
  }

  return normalizedPathname === itemPath || matchesPrefix(normalizedPathname, item.activePathPrefixes ?? [itemPath])
}

function normalizePath(path: string): string {
  if (path === '/') return '/'
  return path.replace(/\/+$/, '')
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => {
    const normalizedPrefix = normalizePath(prefix)
    return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`)
  })
}
