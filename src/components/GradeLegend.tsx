import { Link } from 'react-router-dom'
import { GRADE_CONFIG, type Grade } from '../lib/grade'

export const GRADE_OPTIONS = Object.keys(GRADE_CONFIG) as Grade[]

interface GradeLegendProps {
  activeGrades: Grade[]
  onToggle: (grade: Grade) => void
}

export function GradeLegend({ activeGrades, onToggle }: GradeLegendProps) {
  return (
    <section className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2" aria-label="Grade filters">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-stone-700">Grade filters</p>
        <Link to="/data-sources#grade-rubric" className="text-xs font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800">
          What do grades mean?
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {GRADE_OPTIONS.map(grade => {
          const active = activeGrades.includes(grade)

          return (
            <button
              key={grade}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(grade)}
              className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-teal-300 hover:text-teal-700'
              }`}
              title={GRADE_CONFIG[grade].label}
            >
              {grade} - {GRADE_CONFIG[grade].label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
