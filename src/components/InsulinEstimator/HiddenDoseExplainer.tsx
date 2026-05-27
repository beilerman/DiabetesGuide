import { Link } from 'react-router-dom'
import type { InsulinDoseResult, InsulinInputs, InsulinValidation } from '../../lib/insulin'
import { getHiddenDoseTriggers } from '../../lib/hidden-dose-triggers'

interface HiddenDoseExplainerProps {
  inputs: InsulinInputs
  validation: InsulinValidation
  result: InsulinDoseResult | null
  blockedByUnavailableNutrition?: boolean
}

export function HiddenDoseExplainer(props: HiddenDoseExplainerProps) {
  const triggers = getHiddenDoseTriggers(props)

  if (triggers.length === 0) return null

  return (
    <details className="mt-4 rounded-lg border border-stone-300 bg-white p-3 text-sm text-stone-700" open>
      <summary className="cursor-pointer font-semibold text-stone-900">
        Why is the dose hidden?
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {triggers.map(trigger => (
          <li key={trigger}>{trigger}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-stone-600">
        See the{' '}
        <Link to="/data-sources#estimator-safety" className="font-semibold text-teal-700 underline underline-offset-2">
          safety methodology
        </Link>
        .
      </p>
    </details>
  )
}
