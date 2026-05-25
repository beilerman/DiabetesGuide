import { Link, useLocation } from 'react-router-dom'

export default function NotFound() {
  const location = useLocation()

  return (
    <div className="mx-auto max-w-xl rounded-xl bg-white border border-stone-200 p-8 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Page not found</p>
      <h1 className="mt-2 text-3xl font-bold text-stone-950">That page is not available</h1>
      <p className="mt-3 text-sm text-stone-600">
        The path <span className="font-mono text-stone-800">{location.pathname}</span> does not match a current DiabetesGuide page.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
          Parks
        </Link>
        <Link to="/browse" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300 hover:text-teal-700">
          Browse
        </Link>
        <Link to="/more" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300 hover:text-teal-700">
          More
        </Link>
      </div>
    </div>
  )
}
