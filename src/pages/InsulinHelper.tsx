import { useState, useMemo, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import {
  INSULIN_LIMITS,
  calculateInsulinDose,
  getHypoglycemiaTreatmentPlan,
  validateInsulinInputs,
  type ActivityLevel,
} from '../lib/insulin'
import { hasEstimatorAcknowledgement, saveEstimatorAcknowledgement } from '../lib/estimator-ack'
import { HiddenDoseExplainer } from '../components/InsulinEstimator/HiddenDoseExplainer'
import { STORAGE_KEYS } from '../lib/storage-keys'

function parseInitialCarbs(value: string | null): number | '' {
  if (value == null) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : ''
}

// Clinician-set values (ICR, correction factor, target, IOB, max bolus) rarely
// change between visits, so persist them — a returning in-line user only enters
// blood glucose and carbs. Shares STORAGE_KEYS.insulinSettings with the Meal
// Builder estimator so the two stay in sync.
interface StoredInsulinSettings {
  icr: number | ''
  cf: number | ''
  target: number | ''
  activeInsulin: number | ''
  maxBolus: number | ''
}

function loadStoredInsulinSettings(): Partial<StoredInsulinSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.insulinSettings)
    return raw ? (JSON.parse(raw) as Partial<StoredInsulinSettings>) : {}
  } catch {
    return {}
  }
}

export default function InsulinHelper() {
  const [searchParams] = useSearchParams()

  const [stored] = useState(loadStoredInsulinSettings)
  const [bg, setBg] = useState<number | ''>('')
  const [target, setTarget] = useState<number | ''>(stored.target ?? '')
  const [carbs, setCarbs] = useState<number | ''>(parseInitialCarbs(searchParams.get('carbs')))
  const [icr, setIcr] = useState<number | ''>(stored.icr ?? '')
  const [cf, setCf] = useState<number | ''>(stored.cf ?? '')
  const [activeInsulin, setActiveInsulin] = useState<number | ''>(stored.activeInsulin ?? 0)
  const [maxBolus, setMaxBolus] = useState<number | ''>(stored.maxBolus ?? INSULIN_LIMITS.maxBolus.default)
  const [activity, setActivity] = useState<ActivityLevel>('none')
  const [acknowledged, setAcknowledged] = useState(hasEstimatorAcknowledgement)

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.insulinSettings,
      JSON.stringify({ icr, cf, target, activeInsulin, maxBolus }),
    )
  }, [icr, cf, target, activeInsulin, maxBolus])

  const inputs = useMemo(() => ({
    carbs,
    bloodGlucose: bg,
    targetGlucose: target,
    insulinToCarbRatio: icr,
    correctionFactor: cf,
    activeInsulin,
    maxBolus,
    activity,
  }), [bg, target, carbs, icr, cf, activeInsulin, maxBolus, activity])
  const validation = useMemo(() => validateInsulinInputs(inputs), [inputs])
  const result = useMemo(() => calculateInsulinDose(inputs), [inputs])
  const hypoPlan = useMemo(() => getHypoglycemiaTreatmentPlan(bg), [bg])
  const doseHidden =
    !validation.isValid ||
    result?.status === 'blocked' ||
    (typeof carbs === 'number' && carbs <= 0)
  const estimatorLiveMessage = doseHidden
    ? getDoseHiddenLiveMessage(validation, result, carbs)
    : `Dose estimate visible. Suggested total dose ${result?.suggested} units.`

  const handleAcknowledge = () => {
    saveEstimatorAcknowledgement()
    setAcknowledged(true)
  }

  return (
    <>
      {!acknowledged && createPortal(
        <EstimatorAckModal onAcknowledge={handleAcknowledge} />,
        document.body,
      )}
      <div className="mx-auto max-w-6xl" inert={!acknowledged}>
      <div className="rounded-lg bg-amber-50 border border-amber-300 p-4 mb-6">
        <p className="font-semibold text-amber-900">
          Educational estimator only - not medical advice. Use only ratios and limits from your care team.
        </p>
      </div>

      <h1 className="text-2xl font-bold mb-2">Carb & Correction Estimator</h1>
      <p className="text-sm text-stone-600 mb-6">
        The estimate is hidden until required values are complete and within conservative safety ranges.
      </p>
      <div
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="estimator-live-status"
      >
        {estimatorLiveMessage}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-start">
      <section aria-labelledby="estimator-inputs-heading" className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 id="estimator-inputs-heading" className="sr-only">Estimator inputs</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Blood Glucose (mg/dL)"
          value={bg}
          onChange={setBg}
          min={INSULIN_LIMITS.bloodGlucose.min}
          max={INSULIN_LIMITS.bloodGlucose.max}
          step={1}
          required
        />
        <Field
          label="Target Glucose (mg/dL)"
          value={target}
          onChange={setTarget}
          min={INSULIN_LIMITS.targetGlucose.min}
          max={INSULIN_LIMITS.targetGlucose.max}
          step={1}
          helper="Use the target your clinician gave you."
          required
        />
        <Field
          label="Total Carbs (g)"
          value={carbs}
          onChange={setCarbs}
          min={INSULIN_LIMITS.carbs.min}
          max={INSULIN_LIMITS.carbs.max}
          step={1}
          required
        />
        <Field
          label="Insulin-to-Carb Ratio (grams per unit)"
          value={icr}
          onChange={setIcr}
          min={INSULIN_LIMITS.insulinToCarbRatio.min}
          max={INSULIN_LIMITS.insulinToCarbRatio.max}
          step={0.5}
          required
        />
        <Field
          label="Correction Factor (mg/dL per unit)"
          value={cf}
          onChange={setCf}
          min={INSULIN_LIMITS.correctionFactor.min}
          max={INSULIN_LIMITS.correctionFactor.max}
          step={1}
          required
        />
        <Field
          label="Active Insulin / IOB (units)"
          value={activeInsulin}
          onChange={setActiveInsulin}
          min={INSULIN_LIMITS.activeInsulin.min}
          max={INSULIN_LIMITS.activeInsulin.max}
          step={0.1}
          helper="Used to reduce correction insulin only."
        />
        <Field
          label="Max Bolus Limit (units)"
          value={maxBolus}
          onChange={setMaxBolus}
          min={INSULIN_LIMITS.maxBolus.min}
          max={INSULIN_LIMITS.maxBolus.max}
          step={0.5}
          helper="Set this to your pump or clinician-provided max bolus."
          required
        />

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium mb-1">Planned Activity</legend>
          <div className="flex flex-wrap gap-3">
            {([['none', 'None'], ['mod', 'Moderate - carb bolus -25%'], ['high', 'High - carb bolus -50%']] as const).map(
              ([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="activity"
                    checked={activity === val}
                    onChange={() => setActivity(val)}
                    className="accent-teal-600"
                  />
                  {label}
                </label>
              )
            )}
          </div>
        </fieldset>
      </div>
      </section>

      <section aria-labelledby="estimator-results-heading" className="lg:sticky lg:top-24">
      <h2 id="estimator-results-heading" className="sr-only">Estimator results and safety messages</h2>
      {validation.status === 'hypoglycemia' && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4" role="alert">
          <h2 className="font-semibold text-red-900">Low blood glucose - no bolus estimate shown</h2>
          <p className="mt-2 text-sm text-red-800">
            Treat the low first: take 15g fast-acting carbohydrate, recheck in 15 minutes, and follow your care plan.
            Seek urgent help for severe symptoms or if you cannot safely treat the low.
          </p>
          {hypoPlan && (
            <div className="mt-3 rounded-lg border border-red-200 bg-white/70 p-3">
              <h3 className="text-sm font-semibold text-red-950">{hypoPlan.headline}</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-red-100 px-3 py-2">
                  <span className="block text-xs font-medium uppercase tracking-wide text-red-700">Fast carbs</span>
                  <span className="text-lg font-bold text-red-950">{hypoPlan.fastCarbsGrams}g</span>
                </div>
                <div className="rounded-md bg-red-100 px-3 py-2">
                  <span className="block text-xs font-medium uppercase tracking-wide text-red-700">Recheck</span>
                  <span className="text-lg font-bold text-red-950">{hypoPlan.recheckMinutes} min</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-red-900">{hypoPlan.guidance}</p>
              {hypoPlan.urgent && (
                <p className="mt-2 text-sm font-semibold text-red-950">
                  If symptoms are severe, you cannot swallow safely, or glucose is not rising, use your emergency plan and seek urgent help.
                </p>
              )}
              <p className="mt-2 text-xs text-red-700">
                General 15-15 education based on CDC and NIDDK low blood glucose guidance; your care plan takes priority.
              </p>
            </div>
          )}
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {validation.messages.map(message => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {!validation.isValid && validation.status !== 'hypoglycemia' && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Dose hidden until values are valid</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
            {validation.messages.map(message => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {doseHidden && (
        <HiddenDoseExplainer
          inputs={inputs}
          validation={validation}
          result={result}
        />
      )}

      {result && !doseHidden && (
        <div
          className={`mt-6 rounded-lg border p-4 space-y-2 ${
            result.status === 'blocked'
              ? 'border-red-300 bg-red-50'
              : result.status === 'warning'
                ? 'border-amber-300 bg-amber-50'
                : 'border-teal-200 bg-white'
          }`}
          aria-live="polite"
        >
          <h2 className="font-semibold text-lg mb-2">Results</h2>
          {result.messages.length > 0 && (
            <ul className={`list-disc pl-5 text-sm ${result.status === 'blocked' ? 'text-red-800' : 'text-amber-800'}`}>
              {result.messages.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <Row label="Carb Bolus" value={`${result.carbBolus} units`} />
          {result.adjPct > 0 && (
            <Row label="Carb Bolus After Activity" value={`${result.activityAdjustedCarbBolus} units`} />
          )}
          <Row label="Correction Dose" value={`${result.correction} units`} />
          <Row label="Active Insulin Applied" value={`-${result.iobAdjustment} units`} />
          <Row label="Correction After IOB" value={`${result.correctionAfterIob} units`} />
          <Row label="Activity Adjustment" value={`-${result.adjPct}% of carb bolus`} />
          {result.suggested == null ? (
            <Row label="Suggested Total Dose" value="Blocked" bold />
          ) : (
            <Row label="Suggested Total Dose" value={`${result.suggested} units`} bold />
          )}
        </div>
      )}
      </section>
      </div>
      </div>
    </>
  )
}

function EstimatorAckModal({ onAcknowledge }: { onAcknowledge: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog on open and trap Tab. The single focusable
  // control means preventing Tab's default keeps focus on the button — focus
  // cannot escape to the page behind the consent gate (also marked inert).
  useEffect(() => {
    buttonRef.current?.focus()
    const node = dialogRef.current
    if (!node) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') event.preventDefault()
    }
    node.addEventListener('keydown', handleKeyDown)
    return () => node.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/70 px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="estimator-ack-title"
        className="max-w-lg rounded-xl border border-amber-300 bg-white p-5 shadow-xl"
      >
        <h2 id="estimator-ack-title" className="text-lg font-bold text-stone-950">
          Before using this estimator
        </h2>
        <div className="mt-3 space-y-2 text-sm text-stone-700">
          <p>This is an educational carb and correction estimator, not medical advice or an automated dosing device.</p>
          <p>Use only insulin ratios, correction factors, targets, and max-bolus limits prescribed by your care team.</p>
          <p>For children, pregnancy, illness, exercise, pump settings, or hypoglycemia risk, confirm your plan with a clinician.</p>
        </div>
        <button
          ref={buttonRef}
          type="button"
          onClick={onAcknowledge}
          className="mt-5 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          I understand
        </button>
      </div>
    </div>
  )
}

function getDoseHiddenLiveMessage(
  validation: ReturnType<typeof validateInsulinInputs>,
  result: ReturnType<typeof calculateInsulinDose>,
  carbs: number | '',
): string {
  if (validation.status === 'hypoglycemia') {
    return 'Dose hidden because blood glucose is low. Treat the low before considering insulin.'
  }
  if (!validation.isValid) {
    return `Dose hidden: ${validation.messages[0] ?? 'required values are incomplete or outside safety ranges.'}`
  }
  if (result?.status === 'blocked') {
    return `Dose hidden: ${result.messages[0] ?? 'calculated dose is blocked by safety limits.'}`
  }
  if (typeof carbs === 'number' && carbs <= 0) {
    return 'Dose hidden: total carbs are 0g, so no meal-carb dose is shown.'
  }
  return 'Dose hidden until values are valid.'
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  helper,
  required,
}: {
  label: string
  value: number | ''
  onChange: (v: number | '') => void
  min?: number
  max?: number
  step?: number
  helper?: string
  required?: boolean
}) {
  const fieldId = useId()
  const helperId = `${fieldId}-helper`
  const validationId = `${fieldId}-validation`
  const outOfRange =
    typeof value === 'number' &&
    ((min != null && value < min) || (max != null && value > max))
  const invalid = Boolean((required && value === '') || outOfRange)
  const validationHint = getFieldValidationHint(label, value, min, max, required)
  const describedBy = [
    helper ? helperId : null,
    validationHint ? validationId : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <label htmlFor={fieldId} className="text-sm font-medium text-stone-800">{label}</label>
      <input
        id={fieldId}
        type="number"
        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-stone-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200 ${
          invalid ? 'border-amber-400 bg-amber-50' : 'border-stone-300 bg-white'
        }`}
        value={value}
        min={min}
        max={max}
        step={step}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="decimal"
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
      {helper && <span id={helperId} className="mt-1 block text-xs text-stone-500">{helper}</span>}
      {validationHint && (
        <span id={validationId} className="mt-1 block text-xs font-medium text-amber-800" aria-live="polite">
          {validationHint}
        </span>
      )}
    </div>
  )
}

function getFieldValidationHint(
  label: string,
  value: number | '',
  min?: number,
  max?: number,
  required?: boolean,
): string | null {
  const name = getPlainFieldName(label)
  const unit = getFieldUnit(label)

  if (required && value === '') {
    return `${name} is required.`
  }

  if (
    typeof value === 'number' &&
    ((min != null && value < min) || (max != null && value > max))
  ) {
    const range = min != null && max != null
      ? `between ${min} and ${max}${unit ? ` ${unit}` : ''}`
      : min != null
        ? `at least ${min}${unit ? ` ${unit}` : ''}`
        : `no more than ${max}${unit ? ` ${unit}` : ''}`
    return `${name} must be ${range}.`
  }

  return null
}

function getPlainFieldName(label: string): string {
  const withoutUnit = label.replace(/\s*\([^)]*\)/g, '').trim()
  return withoutUnit.charAt(0).toUpperCase() + withoutUnit.slice(1).toLowerCase()
}

function getFieldUnit(label: string): string | null {
  const match = label.match(/\(([^)]+)\)/)
  return match?.[1] ?? null
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? 'font-bold text-lg' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
