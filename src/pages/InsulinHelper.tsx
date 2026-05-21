import { useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { AdvancedToolsGate } from '../components/ui/AdvancedToolsGate'
import { MedicalDisclaimer } from '../components/ui/MedicalDisclaimer'

export default function InsulinHelper() {
  return (
    <AdvancedToolsGate toolName="Insulin Dose Helper">
      <InsulinHelperContent />
    </AdvancedToolsGate>
  )
}

function InsulinHelperContent() {
  const [searchParams] = useSearchParams()
  const initialCarbs = Number(searchParams.get('carbs'))

  const [bg, setBg] = useState<number | ''>('')
  const [target, setTarget] = useState<number>(120)
  const [carbs, setCarbs] = useState<number | ''>(
    Number.isFinite(initialCarbs) && initialCarbs > 0 ? initialCarbs : ''
  )
  const [icr, setIcr] = useState<number | ''>('')
  const [cf, setCf] = useState<number | ''>('')
  const [activity, setActivity] = useState<'none' | 'mod' | 'high'>('none')

  const result = useMemo(() => {
    if (carbs === '' || icr === '' || bg === '') return null
    if (Number(icr) <= 0) return null

    const carbBolus = Number(carbs) / Number(icr)
    const cfVal = Number(cf)
    const bgVal = Number(bg)
    const correction = cfVal && bgVal !== target ? (bgVal - target) / cfVal : 0

    const baseDose = carbBolus + correction
    const adjPct = activity === 'mod' ? 0.25 : activity === 'high' ? 0.5 : 0
    const suggested = Math.max(0, baseDose * (1 - adjPct))

    return {
      carbBolus: Math.round(carbBolus * 10) / 10,
      correction: Math.round(correction * 10) / 10,
      adjPct: Math.round(adjPct * 100),
      suggested: Math.round(suggested * 10) / 10,
    }
  }, [bg, target, carbs, icr, cf, activity])

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <Link to="/more" className="hover:text-teal-600">More</Link>
        <span aria-hidden>›</span>
        <span className="text-rose-600 font-medium">Advanced</span>
        <span aria-hidden>›</span>
        <span className="text-stone-700">Dose Helper</span>
      </div>

      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-rose-600">Educational tool — not medical advice</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900">Insulin Dose Helper</h1>
        <p className="text-sm text-stone-600">
          Estimates a meal bolus using your prescribed insulin-to-carb ratio and correction factor. Always verify with your healthcare provider before dosing.
        </p>
      </header>

      <MedicalDisclaimer variant="strong" title="Verify every dose">
        Carbohydrate values in this app are <strong>estimates</strong>. Always confirm carb counts with the restaurant when possible, and only use ratios prescribed to you in writing.
      </MedicalDisclaimer>

      <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-stone-200 space-y-5">
        <h2 className="text-lg font-semibold text-stone-900">Inputs</h2>
        <Field label="Total Carbs (g)" value={carbs} onChange={setCarbs} placeholder="e.g. 60" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Blood Glucose (mg/dL)" value={bg} onChange={setBg} placeholder="e.g. 140" />
          <Field label="Target Glucose" value={target} onChange={v => setTarget(typeof v === 'number' ? v : 120)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Insulin-to-Carb Ratio" value={icr} onChange={setIcr} placeholder="e.g. 10" />
          <Field label="Correction Factor" value={cf} onChange={setCf} placeholder="e.g. 50" />
        </div>

        <fieldset>
          <legend className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-2">Activity Level</legend>
          <div className="grid grid-cols-3 gap-2">
            {([['none', 'None'], ['mod', 'Moderate -25%'], ['high', 'High -50%']] as const).map(([val, label]) => (
              <label
                key={val}
                className={`flex items-center justify-center gap-1 text-sm py-2 rounded-xl border cursor-pointer transition-colors ${
                  activity === val
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300'
                }`}
              >
                <input
                  type="radio"
                  name="activity"
                  checked={activity === val}
                  onChange={() => setActivity(val)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {result && (
        <section className="rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 border-2 border-teal-200 p-5 sm:p-6 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-teal-700">Estimated Breakdown</h2>
          <Row label="Carb Bolus" value={`${result.carbBolus} units`} />
          <Row label="Correction Dose" value={`${result.correction} units`} />
          {result.adjPct > 0 && <Row label="Activity Adjustment" value={`−${result.adjPct}%`} />}
          <div className="pt-3 border-t border-teal-300">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-teal-900">Suggested total</span>
              <span className="text-3xl font-bold text-teal-900">{result.suggested}<span className="text-base font-medium ml-1">units</span></span>
            </div>
          </div>
          <p className="text-xs text-teal-800 pt-2 border-t border-teal-300/60">
            This is an <strong>educational estimate only</strong>. Do not administer insulin based solely on this output — confirm with your healthcare provider or follow the written dosing plan from your care team.
          </p>
        </section>
      )}

      <MedicalDisclaimer variant="standard">
        If you do not have a personalized dosing plan from a clinician, <strong>do not use this calculator</strong>. Insulin dosing must be tailored to the individual.
      </MedicalDisclaimer>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: number | ''
  onChange: (v: number | '') => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        placeholder={placeholder}
        className="mt-1.5 block w-full rounded-xl border border-stone-300 px-3 py-2.5 text-base focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-teal-900">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
