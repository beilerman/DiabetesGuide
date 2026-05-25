import { useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Header } from './Header'
import { OfflineBanner } from './OfflineBanner'
import { useMealCart } from '../../hooks/useMealCart'
import { ComparisonTray } from '../compare/ComparisonTray'
import { ComparisonModal } from '../compare/ComparisonModal'
import { useCompare } from '../../hooks/useCompare'

export function Layout() {
  const location = useLocation()
  const { totalItemCount } = useMealCart()
  const { compareCount } = useCompare()
  const [showCompareModal, setShowCompareModal] = useState(false)
  const showCompareTray = location.pathname.startsWith('/browse') || location.pathname.startsWith('/item/')

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname.startsWith('/park/') || location.pathname.startsWith('/resort')
    return location.pathname.startsWith(path)
  }

  const navItemClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1 border-t-2 ${
      active
        ? 'border-teal-600 text-teal-700 font-semibold'
        : 'border-transparent text-stone-500 font-medium'
    }`

  return (
    <div className="min-h-screen bg-stone-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <Header />
      <OfflineBanner />
      <main id="main-content" className={`mx-auto max-w-7xl px-4 py-6 md:pb-6 ${showCompareTray && compareCount > 0 ? 'pb-36' : 'pb-24'}`}>
        <Outlet />
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-28 pt-6 text-xs text-stone-500 md:pb-8">
        <div className="border-t border-stone-200 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>DiabetesGuide v1.0 - educational nutrition planning for theme park visits.</p>
          <p>
            <Link to="/guide" className="font-medium text-stone-700 hover:text-teal-700">About</Link>
            <span className="mx-2">|</span>
            <a href="mailto:contact@diabetesguide.app" className="font-medium text-stone-700 hover:text-teal-700">Contact</a>
          </p>
        </div>
      </footer>

      {showCompareTray && <ComparisonTray onOpenModal={() => setShowCompareModal(true)} />}
      {showCompareModal && <ComparisonModal onClose={() => setShowCompareModal(false)} />}

      {/* Bottom navigation for mobile */}
      <nav aria-label="Main navigation" className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
        <div className="grid grid-cols-5 h-16">
          {/* Parks */}
          <Link
            to="/"
            aria-current={isActive('/') ? 'page' : undefined}
            className={navItemClass(isActive('/'))}
          >
            <svg className="w-6 h-6" aria-hidden="true" fill={isActive('/') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs font-medium">Parks</span>
          </Link>

          {/* Search */}
          <Link
            to="/search"
            aria-current={isActive('/search') || isActive('/browse') ? 'page' : undefined}
            className={navItemClass(isActive('/search') || isActive('/browse'))}
          >
            <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xs font-medium">Search</span>
          </Link>

          {/* Meal */}
          <Link
            to="/meal"
            aria-current={isActive('/meal') || isActive('/insulin') ? 'page' : undefined}
            className={`${navItemClass(isActive('/meal') || isActive('/insulin'))} relative`}
          >
            <div className="relative">
              <svg className="w-6 h-6" aria-hidden="true" fill={isActive('/meal') || isActive('/insulin') ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {totalItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-teal-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalItemCount > 9 ? '9+' : totalItemCount}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Meal</span>
          </Link>

          {/* Plan */}
          <Link
            to="/plan"
            aria-current={isActive('/favorites') || isActive('/plan') ? 'page' : undefined}
            className={navItemClass(isActive('/favorites') || isActive('/plan'))}
          >
            <svg
              className="w-6 h-6"
              aria-hidden="true"
              fill={isActive('/favorites') || isActive('/plan') ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span className="text-xs font-medium">Plan</span>
          </Link>

          {/* More */}
          <Link
            to="/more"
            aria-current={isActive('/more') || isActive('/guide') || isActive('/packing') || isActive('/advice') || isActive('/settings') ? 'page' : undefined}
            className={navItemClass(isActive('/more') || isActive('/guide') || isActive('/packing') || isActive('/advice') || isActive('/settings'))}
          >
            <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="6" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="12" cy="18" r="2"/>
            </svg>
            <span className="text-xs font-medium">More</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
