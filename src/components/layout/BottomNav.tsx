import { Link, useLocation } from 'react-router-dom'
import { getBottomNavItems, getTopNavItems, isNavItemActive, type NavItem, type NavItemId } from '../../lib/nav'

interface BottomNavProps {
  totalItemCount: number
}

export function BottomNav({ totalItemCount }: BottomNavProps) {
  const location = useLocation()
  const mobileNavItems = getBottomNavItems()
  const desktopNavItems = getTopNavItems()

  return (
    <>
      <nav
        aria-label="Bottom navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-stone-200/70 shadow-lg z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      >
        <div className="grid grid-cols-5 h-16">
          {mobileNavItems.map(item => {
            const active = isNavItemActive(item, location.pathname)
            return (
              <Link
                key={item.id}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-center ${item.id === 'meal-builder' ? 'relative' : ''}`}
              >
                <span className={navItemClass(active)}>
                  <NavItemIconWithBadge item={item} active={active} totalItemCount={totalItemCount} />
                  <span className="px-0.5 text-center text-[11px] leading-tight">{item.label}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <nav
        aria-label="Sidebar navigation"
        className="hidden md:flex fixed left-0 top-[65px] bottom-0 z-30 w-20 flex-col border-r border-stone-200 bg-white/95 px-2 py-4 shadow-sm backdrop-blur lg:w-60 lg:px-4"
      >
        <div className="flex flex-1 flex-col gap-1">
          {desktopNavItems.map(item => {
            const active = isNavItemActive(item, location.pathname)
            return (
              <Link
                key={item.id}
                to={item.href}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={desktopNavItemClass(active)}
              >
                <NavItemIconWithBadge item={item} active={active} totalItemCount={totalItemCount} />
                <span className="sr-only font-display text-sm font-semibold lg:not-sr-only">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

function navItemClass(active: boolean): string {
  return `flex min-w-16 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-1.5 transition-colors ${
    active
      ? 'bg-teal-600 text-white font-semibold shadow-sm'
      : 'text-stone-500 font-medium'
  }`
}

function desktopNavItemClass(active: boolean): string {
  return `flex min-h-12 items-center justify-center gap-3 rounded-xl px-3 transition-colors lg:justify-start ${
    active
      ? 'bg-teal-600/10 text-teal-800 ring-1 ring-inset ring-teal-600/20'
      : 'text-stone-600 hover:bg-stone-100 hover:text-teal-700'
  }`
}

function NavItemIconWithBadge({
  item,
  active,
  totalItemCount,
}: {
  item: NavItem
  active: boolean
  totalItemCount: number
}) {
  return (
    <div className="relative flex-shrink-0">
      <NavIcon id={item.id} active={active} />
      {item.id === 'meal-builder' && totalItemCount > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
            active ? 'bg-white text-teal-800' : 'bg-teal-700 text-white'
          }`}
        >
          {totalItemCount > 9 ? '9+' : totalItemCount}
        </span>
      )}
    </div>
  )
}

function NavIcon({ id, active }: { id: NavItem['id']; active: boolean }) {
  const fill = active && usesFilledActiveIcon(id) ? 'currentColor' : 'none'

  switch (id) {
    case 'home':
      return (
        <svg className="h-6 w-6" aria-hidden="true" fill={fill} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'search':
      return (
        <svg className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'browse':
      return (
        <svg className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'meal-builder':
      return (
        <svg className="h-6 w-6" aria-hidden="true" fill={fill} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'favorites':
      return (
        <svg className="h-6 w-6" aria-hidden="true" fill={fill} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )
    case 'menu':
    default:
      return (
        <svg className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="6" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="18" r="2" />
        </svg>
      )
  }
}

function usesFilledActiveIcon(id: NavItemId): boolean {
  return id === 'home' || id === 'meal-builder' || id === 'favorites'
}
