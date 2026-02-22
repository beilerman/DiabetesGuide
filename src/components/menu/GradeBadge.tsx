import type { Grade, GradeColors } from '../../lib/grade'
import { GRADE_CONFIG } from '../../lib/grade'

interface Props {
  grade: Grade | null
  size?: 'sm' | 'md' | 'lg'
  themeColor?: string
}

const sizeMap = {
  sm: { outer: 24, font: 'text-xs', ring: 28 },
  md: { outer: 32, font: 'text-sm', ring: 36 },
  lg: { outer: 40, font: 'text-lg', ring: 44 },
}

export function GradeBadge({ grade, size = 'md', themeColor }: Props) {
  const { outer, font, ring } = sizeMap[size]
  const colors: GradeColors | null = grade ? GRADE_CONFIG[grade] : null

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: ring, height: ring }}
      role="img"
      aria-label={grade ? `Grade ${grade}: ${colors!.label}` : 'No grade available'}
    >
      {themeColor && (
        <div
          className="absolute inset-0 rounded-full opacity-30"
          style={{ border: `2px solid ${themeColor}` }}
        />
      )}
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
    </div>
  )
}
