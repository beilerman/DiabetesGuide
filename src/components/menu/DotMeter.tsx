interface Props {
  value: number
  max: number
  colorFn: (value: number) => 'green' | 'amber' | 'rose'
  label?: string
}

// 600-weights clear WCAG 1.4.11 (3:1) as non-text graphics against white;
// the brighter 500-weights did not.
const dotColors = {
  green: 'bg-green-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
}

const emptyDot = 'bg-stone-300'

function getLevel(value: number, max: number): number {
  if (max <= 0) return 0
  const ratio = value / max
  if (ratio <= 0) return 0
  if (ratio <= 0.2) return 1
  if (ratio <= 0.4) return 2
  if (ratio <= 0.6) return 3
  if (ratio <= 0.8) return 4
  return 5
}

function getLevelLabel(level: number): string {
  if (level === 0) return 'none'
  if (level <= 1) return 'very low'
  if (level <= 2) return 'low'
  if (level <= 3) return 'moderate'
  if (level <= 4) return 'high'
  return 'very high'
}

export function DotMeter({ value, max, colorFn, label }: Props) {
  const level = getLevel(value, max)
  const color = colorFn(value)
  const filledClass = dotColors[color]
  const ariaText = `${label ? label + ': ' : ''}${level} of 5, ${getLevelLabel(level)}`

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="meter"
      aria-label={ariaText}
      aria-valuetext={ariaText}
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={5}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i < level ? filledClass : emptyDot}`}
        />
      ))}
    </div>
  )
}
