import type { ConfidenceSummary } from '../../lib/confidence'

interface Props {
  summary: ConfidenceSummary
  /** When 'compact', renders a single inline line. When 'detailed', renders a card. */
  variant?: 'compact' | 'detailed'
}

const SOURCE_BADGE: Record<ConfidenceSummary['source'], { bg: string; text: string }> = {
  official: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800' },
  usda: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800' },
  ai: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
  unknown: { bg: 'bg-stone-100 border-stone-200', text: 'text-stone-600' },
}

const FRESHNESS_BADGE: Record<ConfidenceSummary['freshness'], { bg: string; text: string } | null> = {
  fresh: null, // don't show badge when fresh
  stale: { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-800' },
  'very-stale': { bg: 'bg-rose-50 border-rose-300', text: 'text-rose-800' },
  unknown: { bg: 'bg-stone-100 border-stone-300', text: 'text-stone-700' },
}

export function NutritionConfidence({ summary, variant = 'compact' }: Props) {
  const sourceColors = SOURCE_BADGE[summary.source]
  const freshnessColors = FRESHNESS_BADGE[summary.freshness]

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full border ${sourceColors.bg} ${sourceColors.text} font-medium`}
          title={
            summary.confidenceScore != null
              ? `Confidence ${summary.confidenceScore}%`
              : 'No confidence score available'
          }
        >
          {summary.sourceLabel}
          {summary.confidenceScore != null && (
            <span className="ml-1 opacity-75">{summary.confidenceScore}%</span>
          )}
        </span>
        {freshnessColors && summary.freshnessLabel && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full border ${freshnessColors.bg} ${freshnessColors.text} font-medium`}
            role="alert"
          >
            {'\u26A0\uFE0F'} {summary.freshnessLabel}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5 text-[11px] text-stone-600">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full border ${sourceColors.bg} ${sourceColors.text} font-medium`}
        >
          {summary.sourceLabel}
          {summary.confidenceScore != null && (
            <span className="ml-1 opacity-75">{summary.confidenceScore}%</span>
          )}
        </span>
        {freshnessColors && summary.freshnessLabel && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full border ${freshnessColors.bg} ${freshnessColors.text} font-medium`}
            role="alert"
          >
            {'\u26A0\uFE0F'} {summary.freshnessLabel}
          </span>
        )}
      </div>
      {summary.warnForDosing && (
        <p className="text-[11px] text-stone-500 leading-snug">
          Verify carbs from a chain or park source before insulin dosing.
        </p>
      )}
    </div>
  )
}
