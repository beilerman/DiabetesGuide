import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { calculateBolus, type ActivityLevel } from '../lib/insulin'

export default function InsulinHelper() {
  const [searchParams] = useSearchParams()
  const initialCarbs = Number(searchParams.get('carbs'))

  const [bg, setBg] = useState<number | ''>('')
  const [target, setTarget] = useState<number>(120)
  const [carbs, setCarbs] = useState<number | ''>(
    Number.isFinite(initialCarbs) ? initialCarbs : ''
  )
  const [icr, setIcr] = useState<number | ''>('')
  const [cf, setCf] = useState<number | ''>('')
  const [activity, setActivity] = useState<ActivityLevel>('none')

  const result = useMemo(() => {
    if (carbs === '' || icr === '' || bg === '') return null
    return calculateBolus({
      carbs: Number(carbs),
      bg: Number(bg),
      target,
      icr: Number(icr),
      cf: cf === '' ? null : Number(cf),
      activity,
    })
  }, [bg, target, carbs, icr, cf, activity])

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 mb-6">
        <p className="font-semibold text-amber-800">
          Educational estimator only — not medical advice or a dosing device.
          Always confirm with your healthcare provider before taking insulin.
        </p>
      </div>

      <h1 className="text-2xl font-bold mb-2">Carb Counting Estimator</h1>
      <p className="text-sm text-stone-600 mb-6">
        Estimates a meal bolus from your own ratios. Discuss results with your provider.
      </p>

      <div className="space-y-4">
        <Field label="Blood Glucose (mg/dL)" value={bg} onChange={setBg} />
        <Field label="Target Glucose (mg/dL)" value={target} onChange={v => setTarget(v || 120)} />
        <Field label="Total Carbs (g)" value={carbs} onChange={setCarbs} />
        <Field label="Insulin-to-Carb Ratio (ICR)" value={icr} onChange={setIcr} />
        <Field label="Correction Factor" value={cf} onChange={setCf} />

        <fieldset>
          <legend className="text-sm font-medium mb-1">Activity Level</legend>
          <div className="flex gap-4">
            {([['none', 'None'], ['mod', 'Moderate'], ['high', 'High']] as const).map(
              ([val, label]) => (
                <label key={val} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="activity"
                    checked={activity === val}
                    onChange={() => setActivity(val)}
                  />
                  {label}
                </label>
              )
            )}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Activity reduction is applied to the carb bolus only; correction is unchanged.
          </p>
        </fieldset>
      </div>

      {result && (
        <div className="mt-6 rounded-lg border bg-white p-4 space-y-2">
          <h2 className="font-semibold text-lg mb-2">Breakdown</h2>
          <Row label="Carb bolus (pre-activity)" value={`${result.carbBolusRaw} units`} />
          <Row label="Activity adjustment" value={`-${result.activityPct}%`} />
          <Row label="Carb bolus (after activity)" value={`${result.carbBolus} units`} />
          <Row label="Correction" value={`${result.correction} units`} />
          <Row
            label="Estimated bolus to discuss with provider"
            value={`${result.total} units`}
            bold
          />
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | ''
  onChange: (v: number | '') => void
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        className="mt-1 block w-full rounded border px-3 py-2"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    </label>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-lg' : 'text-sm'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
