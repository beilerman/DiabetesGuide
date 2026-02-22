import { Link } from 'react-router-dom'
import { usePreferences } from '../../hooks/usePreferences'

export function Header() {
  const { highContrast, toggleContrast } = usePreferences()

  const navLinks = (
    <>
      <Link to="/search" className="hover:text-teal-600 transition-colors">Search</Link>
      <Link to="/browse" className="hover:text-teal-600 transition-colors">Browse</Link>
      <Link to="/insulin" className="hover:text-teal-600 transition-colors">Insulin Helper</Link>
      <Link to="/packing" className="hover:text-teal-600 transition-colors">Packing List</Link>
      <Link to="/guide" className="hover:text-teal-600 transition-colors">Guide</Link>
    </>
  )

  return (
    <header className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-50">
      <nav aria-label="Top navigation" className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-teal-600 hover:text-teal-700 transition-colors">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            <path d="M12 8v8m-4-4h8" strokeLinecap="round"/>
          </svg>
          <span className="hidden sm:inline">DiabetesGuide</span>
        </Link>

        {/* Desktop nav + contrast toggle */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600">
          {navLinks}
          <button
            onClick={toggleContrast}
            aria-label={highContrast ? 'Disable high contrast' : 'Enable high contrast'}
            className={`ml-2 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${highContrast ? 'bg-teal-600 text-white border-teal-600' : 'border-stone-300 text-stone-500 hover:bg-stone-50'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor"/>
            </svg>
          </button>
          <Link to="/settings" aria-label="Settings" className="w-8 h-8 rounded-lg flex items-center justify-center border border-stone-300 text-stone-500 hover:bg-stone-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </Link>
        </div>
      </nav>
    </header>
  )
}
