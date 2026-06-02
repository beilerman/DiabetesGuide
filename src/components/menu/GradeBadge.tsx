import type { Grade, GradeColors } from '../../lib/grade'
import { GRADE_CONFIG, GRADE_RUBRIC_SUMMARY } from '../../lib/grade'

interface Props {
  grade: Grade | null
  size?: 'sm' | 'md' | 'lg'
  /** When the grade is computed from low-confidence/estimated nutrition, show a
   * marker so a confident-looking letter never overstates its underlying data. */
  estimated?: boolean
}

const sizeMap = {
  sm: { outer: 24, font: 'text-xs', ring: 28, marker: 'h-3 w-3 text-[8px]' },
  md: { outer: 32, font: 'text-sm', ring: 36, marker: 'h-3.5 w-3.5 text-[9px]' },
  lg: { outer: 40, font: 'text-lg', ring: 44, marker: 'h-4 w-4 text-[10px]' },
}

export function GradeBadge({ grade, size = 'md', estimated = false }: Props) {
  const { outer, font, ring, marker } = sizeMap[size]
  const colors: GradeColors | null = grade ? GRADE_CONFIG[grade] : null
  const estimatedSuffix = estimated && grade ? ', estimated — verify before dosing' : ''

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: ring, height: ring }}
      role="img"
      aria-label={grade ? `Grade ${grade}: ${colors!.label}${estimatedSuffix}` : 'No grade available'}
      title={grade ? `Grade ${grade}: ${colors!.label}.${estimated ? ' Based on an estimate — verify before dosing.' : ''} ${GRADE_RUBRIC_SUMMARY}` : 'No grade available. Nutrition is missing or unavailable.'}
    >
      <div
        className={`flex items-center justify-center rounded-full font-bold ${font}`}
        style={{
          width: outer,
          height: outer,
          backgroundColor: colors?.bg ?? '#d6d3d1',
          color: colors?.text ?? '#78716c',
        }}
      >
        {grade ?? '?'}
      </div>
      {estimated && grade && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white font-bold leading-none text-amber-900 ring-1 ring-amber-700 ${marker}`}
          aria-hidden="true"
        >
          ~
        </span>
      )}
    </div>
  )
}
