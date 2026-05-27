export default function Contact() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Contact</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">Contact DiabetesGuide</h1>
        <p className="mt-3 text-stone-600">
          Use contact for nutrition corrections, broken links, accessibility problems, and park menu updates.
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Email</h2>
        <p className="mt-2 text-sm text-stone-600">
          Send corrections to{' '}
          <a href="mailto:contact@diabetesguide.app" className="font-semibold text-teal-700 hover:text-teal-800">
            contact@diabetesguide.app
          </a>
          .
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Do not include blood glucose logs, insulin settings, diagnoses, or other private health details in email.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Nutrition Corrections</h2>
        <p className="mt-2 text-sm text-stone-600">
          The best correction reports include the item name, restaurant, park, source link or photo of published nutrition,
          and the date you saw it. Item detail pages include a report link that pre-fills non-health item context.
        </p>
      </section>
    </div>
  )
}
