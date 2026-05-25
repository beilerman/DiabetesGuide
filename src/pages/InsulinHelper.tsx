import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { calculateInsulinDose, validateInsulinInputs, type ActivityLevel } from '../lib/insulin'

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

  const inputs = useMemo(() => ({
    carbs,
    bloodGlucose: bg,
    targetGlucose: target,
    insulinToCarbRatio: icr,
    correctionFactor: cf,
    activity,
  }), [bg, target, carbs, icr, cf, activity])
  const validation = useMemo(() => validateInsulinInputs(inputs), [inputs])
  const result = useMemo(() => calculateInsulinDose(inputs), [inputs])

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 mb-6">
        <p className="font-semibold text-amber-800">
          Educational tool only — not medical advice. Always consult your healthcare provider.
        </p>
      </div>

      <h1 className="text-2xl font-bold mb-6">Insulin Dose Helper</h1>

      <div className="space-y-4">
        <Field label="Blood Glucose (mg/dL)" value={bg} onChange={setBg} min={1} step="any" required />
        <Field label="Target Glucose (mg/dL)" value={target} onChange={v => setTarget(v || 120)} min={1} step="any" required />
        <Field label="Total Carbs (g)" value={carbs} onChange={setCarbs} min={0} step="any" required />
        <Field label="Insulin-to-Carb Ratio (ICR)" value={icr} onChange={setIcr} min={0.1} step="any" required />
        <Field label="Correction Factor" value={cf} onChange={setCf} min={1} step="any" required />

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
        </fieldset>
      </div>

      {!validation.isValid && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Enter required values</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
            {validation.messages.map(message => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-lg border bg-white p-4 space-y-2">
          <h2 className="font-semibold text-lg mb-2">Results</h2>
          <Row label="Carb Bolus" value={`${result.carbBolus} units`} />
          <Row label="Correction Dose" value={`${result.correction} units`} />
          <Row label="Activity Adjustment" value={`-${result.adjPct}%`} />
          <Row label="Suggested Total Dose" value={`${result.suggested} units`} bold />
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  min,
  step,
  required,
}: {
  label: string
  value: number | ''
  onChange: (v: number | '') => void
  min?: number
  step?: number | 'any'
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        className="mt-1 block w-full rounded border px-3 py-2"
        value={value}
        min={min}
        step={step}
        required={required}
        inputMode="decimal"
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
