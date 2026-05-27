import { Link, useLocation } from 'react-router-dom'
import { getBottomNavItems, isNavItemActive, type NavItem, type NavItemId } from '../../lib/nav'

interface BottomNavProps {
  totalItemCount: number
}

export function BottomNav({ totalItemCount }: BottomNavProps) {
  const location = useLocation()
  const navItems = getBottomNavItems()

  return (
    <nav
      aria-label="Bottom navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <div className="grid grid-cols-5 h-16">
        {navItems.map(item => {
          const active = isNavItemActive(item, location.pathname)
          return (
            <Link
              key={item.id}
              to={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${navItemClass(active)} ${item.id === 'meal-builder' ? 'relative' : ''}`}
            >
              <div className="relative">
                <NavIcon id={item.id} active={active} />
                {item.id === 'meal-builder' && totalItemCount > 0 && (
                  <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                    {totalItemCount > 9 ? '9+' : totalItemCount}
                  </span>
                )}
              </div>
              <span className="px-0.5 text-center text-[11px] font-medium leading-tight">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function navItemClass(active: boolean): string {
  return `flex flex-col items-center justify-center gap-1 border-t-2 ${
    active
      ? 'border-teal-600 text-teal-700 font-semibold'
      : 'border-transparent text-stone-500 font-medium'
  }`
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
