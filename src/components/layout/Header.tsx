import { Link } from 'react-router-dom'

export function Header() {
  const navLinks = (
    <>
      <Link to="/browse" className="hover:text-teal-600 transition-colors">Browse</Link>
      <Link to="/insulin" className="hover:text-teal-600 transition-colors">Insulin Helper</Link>
      <Link to="/packing" className="hover:text-teal-600 transition-colors">Packing List</Link>
      <Link to="/guide" className="hover:text-teal-600 transition-colors">Diabetes Guide</Link>
    </>
  )

  return (
    <header className="bg-white shadow-sm border-b border-stone-200 sticky top-0 z-50">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Logo with icon */}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold text-teal-600 hover:text-teal-700 transition-colors">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            <path d="M12 8v8m-4-4h8" strokeLinecap="round"/>
          </svg>
          <span className="hidden sm:inline">DiabetesGuide</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600">
          {navLinks}
        </div>
      </nav>
    </header>
  )
}
