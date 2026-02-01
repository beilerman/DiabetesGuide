import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessibilityControls } from '../ui/AccessibilityControls'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = (
    <>
      <Link to="/browse" className="hover:text-blue-600" onClick={() => setMenuOpen(false)}>Browse</Link>
      <Link to="/insulin" className="hover:text-blue-600" onClick={() => setMenuOpen(false)}>Insulin Helper</Link>
      <Link to="/packing" className="hover:text-blue-600" onClick={() => setMenuOpen(false)}>Packing List</Link>
      <Link to="/guide" className="hover:text-blue-600" onClick={() => setMenuOpen(false)}>Diabetes Guide</Link>
    </>
  )

  return (
    <header className="bg-white shadow-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold text-blue-600">
          DiabetesGuide
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4 text-sm">
          {navLinks}
          <AccessibilityControls />
        </div>

        {/* Hamburger button */}
        <button
          className="md:hidden flex flex-col gap-1 p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
        >
          <span className="block h-0.5 w-5 bg-gray-700" />
          <span className="block h-0.5 w-5 bg-gray-700" />
          <span className="block h-0.5 w-5 bg-gray-700" />
        </button>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden flex flex-col gap-3 px-4 pb-4 text-sm border-t">
          {navLinks}
          <AccessibilityControls />
        </div>
      )}
    </header>
  )
}
