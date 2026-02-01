import { Link } from 'react-router-dom'

export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold text-blue-600">
          DiabetesGuide
        </Link>
        <div className="flex gap-4 text-sm">
          <Link to="/browse" className="hover:text-blue-600">Browse</Link>
          <Link to="/insulin" className="hover:text-blue-600">Insulin Helper</Link>
          <Link to="/packing" className="hover:text-blue-600">Packing List</Link>
          <Link to="/guide" className="hover:text-blue-600">Diabetes Guide</Link>
        </div>
      </nav>
    </header>
  )
}
