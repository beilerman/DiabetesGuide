import { Link } from 'react-router-dom'
import { buildInfo, formatBuildDate } from '../lib/build-info'

export default function Methodology() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Data Sources</p>
        <h1 className="mt-2 text-3xl font-bold text-stone-950">Nutrition Data Sources</h1>
        <p className="mt-3 text-stone-600">
          DiabetesGuide combines public menu information with nutrition sources that vary in reliability. Treat all values as planning aids, not clinical dosing instructions.
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Source Types</h2>
        <div className="mt-4 grid gap-3">
          <SourceBlock
            title="Official"
            body="Published restaurant, park, or chain nutrition information. These records receive the highest confidence when they are directly matched to the item."
          />
          <SourceBlock
            title="API lookup"
            body="Nutrition matched from external food databases such as USDA-style generic foods. These are useful estimates, but portions and recipes can differ at theme parks."
          />
          <SourceBlock
            title="Crowdsourced or estimated"
            body="Values inferred from menu descriptions, keyword models, or lower-confidence matching. These should be verified before using them for dosing decisions."
          />
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-bold text-amber-950">How to Read Confidence</h2>
        <p className="mt-2 text-sm text-amber-900">
          Items below 70% confidence are flagged as low-confidence estimates. A listed 0g carb value is not the same as unknown nutrition; unavailable nutrition is labeled separately and should not be treated as zero.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Catalog Snapshot</h2>
        <p className="mt-2 text-sm text-stone-600">
          The current catalog snapshot is dated <span className="font-semibold text-stone-900">{formatBuildDate(buildInfo.catalogSnapshotDate)}</span>.
          Build metadata is available on the <Link to="/about" className="font-semibold text-teal-700 underline underline-offset-2">About page</Link>.
        </p>
      </section>

      <section id="grade-rubric" className="scroll-mt-24 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Grade Rubric</h2>
        <p className="mt-2 text-sm text-stone-600">
          Item grades are a planning shorthand for diabetes-friendly choices. They weigh net carbs most heavily, then sugar ratio, protein, fiber, calories, and alcohol. The grade is not a medical recommendation.
        </p>
        <dl className="mt-4 grid gap-2 text-sm text-stone-700">
          <GradeRow grade="A" label="Diabetes-friendly" />
          <GradeRow grade="B" label="Good choice" />
          <GradeRow grade="C" label="Plan your bolus" />
          <GradeRow grade="D" label="Caution - high carb impact" />
          <GradeRow grade="F" label="Consider alternatives" />
        </dl>
      </section>

      <section id="estimator-safety" className="scroll-mt-24 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Estimator Safety Methodology</h2>
        <div className="mt-3 space-y-2 text-sm text-stone-600">
          <p>
            The carb and correction estimator hides dose output until required values are present and within conservative bounds for blood glucose, target glucose, insulin-to-carb ratio, correction factor, active insulin, and max bolus.
          </p>
          <p>
            Blood glucose below 70 mg/dL blocks insulin estimates and surfaces low-glucose treatment education. Blood glucose below target suppresses correction insulin rather than applying a negative correction.
          </p>
          <p>
            Insulin on board reduces correction insulin only. Activity adjustments reduce the carb bolus only. Totals above the configured max bolus are blocked instead of shown as a suggested dose.
          </p>
          <p>
            These guardrails are educational safeguards, not a replacement for pump settings, clinician instructions, or emergency care plans.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-stone-900">Report Problems</h2>
        <p className="mt-2 text-sm text-stone-600">
          Menus change frequently. Use the report link on any item detail page to send the item, restaurant, park, and page URL with your correction.
        </p>
        <Link to="/browse" className="mt-4 inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Browse items
        </Link>
      </section>
    </div>
  )
}

function SourceBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <h3 className="font-semibold text-stone-900">{title}</h3>
      <p className="mt-1 text-sm text-stone-600">{body}</p>
    </div>
  )
}

function GradeRow({ grade, label }: { grade: string; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
        {grade}
      </dt>
      <dd>{label}</dd>
    </div>
  )
}
