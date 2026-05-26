import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">About</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">About DiabetesGuide</h1>
        <p className="mt-3 text-stone-600">
          DiabetesGuide is an independent educational planning tool for theme park visits. It helps visitors compare menu
          items by carbohydrate, calories, estimated nutrition quality, and source confidence before they arrive at a restaurant.
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">What This App Is</h2>
        <p className="mt-2 text-sm text-stone-600">
          The app organizes public menu information, official nutrition where available, USDA-style estimates, and local
          trip-planning tools. Favorites, meals, settings, and checklist data are stored locally on this device.
        </p>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-bold text-amber-950">What This App Is Not</h2>
        <p className="mt-2 text-sm text-amber-900">
          DiabetesGuide is not a medical device, a replacement for your care team, or a guarantee that a restaurant item
          matches the nutrition shown here. Use your clinician-provided ratios, safety plan, and in-person verification.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Useful Links</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/data-sources" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
            Nutrition data sources
          </Link>
          <Link to="/privacy" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300">
            Privacy
          </Link>
          <Link to="/contact" className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:border-teal-300">
            Contact
          </Link>
        </div>
      </section>
    </div>
  )
}
