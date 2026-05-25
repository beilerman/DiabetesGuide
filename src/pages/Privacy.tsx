export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Privacy</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">Privacy Statement</h1>
        <p className="mt-3 text-stone-600">
          DiabetesGuide is designed as a local planning tool. Favorites, meal items, trip plans, display preferences, and estimator settings are stored in your browser.
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">What Stays Local</h2>
        <p className="mt-2 text-sm text-stone-600">
          Meal carts, saved favorites, carb goals, contrast settings, checklist state, trip plans, and estimator inputs are stored with browser storage on the device you use.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">What the App Fetches</h2>
        <p className="mt-2 text-sm text-stone-600">
          The app downloads public park, restaurant, menu, and nutrition data from the DiabetesGuide backend and caches portions of it for offline use.
        </p>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-bold text-amber-950">Health Information</h2>
        <p className="mt-2 text-sm text-amber-900">
          Do not enter private medical notes into report emails. Estimator values are educational and should be based on your clinician-provided plan.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Contact</h2>
        <p className="mt-2 text-sm text-stone-600">
          Questions or correction reports can be sent to{' '}
          <a href="mailto:contact@diabetesguide.app" className="font-semibold text-teal-700 hover:text-teal-800">
            contact@diabetesguide.app
          </a>
          .
        </p>
      </section>
    </div>
  )
}
