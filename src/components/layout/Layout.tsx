import { Outlet, useLocation, Link } from 'react-router-dom'
import { Header } from './Header'
import { MealCart } from '../meal-tracker/MealCart'

export function Layout() {
  const location = useLocation()

  const isActive = (path: string) => location.pathname.startsWith(path) || (path === '/' && location.pathname === '/')

  return (
    <div className="min-h-screen bg-stone-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <MealCart />

      {/* Bottom navigation for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
        <div className="grid grid-cols-5 h-16">
          {/* Browse */}
          <Link
            to="/browse"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/browse') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            {isActive('/browse') ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            )}
            <span className="text-xs font-medium">Browse</span>
          </Link>

          {/* Meal Tracker */}
          <Link
            to="/"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/') && location.pathname === '/' ? 'text-teal-600' : 'text-stone-500'}`}
          >
            {isActive('/') && location.pathname === '/' ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                <circle cx="12" cy="12" r="5"/>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="5"/>
              </svg>
            )}
            <span className="text-xs font-medium">Parks</span>
          </Link>

          {/* Favorites - placeholder for future feature */}
          <button
            className="flex flex-col items-center justify-center gap-1 text-stone-400 cursor-not-allowed"
            disabled
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span className="text-xs font-medium">Favorites</span>
          </button>

          {/* Insulin Helper */}
          <Link
            to="/insulin"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/insulin') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            {isActive('/insulin') ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
            <span className="text-xs font-medium">Insulin</span>
          </Link>

          {/* More */}
          <Link
            to="/guide"
            className={`flex flex-col items-center justify-center gap-1 ${isActive('/guide') || isActive('/packing') ? 'text-teal-600' : 'text-stone-500'}`}
          >
            {isActive('/guide') || isActive('/packing') ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="6" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="12" cy="18" r="2"/>
              </svg>
            )}
            <span className="text-xs font-medium">More</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
