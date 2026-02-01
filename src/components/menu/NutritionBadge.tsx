// Traffic light color system for nutrition metrics

export function carbColor(carbs: number): string {
  if (carbs <= 30) return 'bg-green-100 text-green-800 border-green-200'
  if (carbs <= 60) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}

export function sugarColor(sugar: number): string {
  if (sugar < 10) return 'bg-green-100 text-green-800 border-green-200'
  if (sugar <= 25) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}

export function calorieColor(calories: number): string {
  if (calories < 400) return 'bg-green-100 text-green-800 border-green-200'
  if (calories <= 700) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}

export function sodiumColor(sodium: number): string {
  if (sodium < 500) return 'bg-green-100 text-green-800 border-green-200'
  if (sodium <= 1000) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}

interface NutritionRingProps {
  value: number
  max: number
  color: 'green' | 'amber' | 'rose'
  size?: number
}

export function NutritionRing({ value, max, color, size = 40 }: NutritionRingProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const circumference = 2 * Math.PI * 14 // radius = 14
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const colorClasses = {
    green: 'stroke-green-500',
    amber: 'stroke-amber-500',
    rose: 'stroke-rose-500',
  }

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-gray-200"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r="14"
        fill="none"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className={colorClasses[color]}
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  )
}

interface NutritionBadgeProps {
  label: string
  value: number | null
  unit: string
  size?: 'sm' | 'md' | 'lg'
  colorFn?: (value: number) => string
}

export function NutritionBadge({
  label,
  value,
  unit,
  size = 'md',
  colorFn
}: NutritionBadgeProps) {
  if (value == null) return null

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base font-semibold',
  }

  const colorClass = colorFn ? colorFn(value) : 'bg-stone-100 text-stone-700 border-stone-200'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border ${sizeClasses[size]} ${colorClass}`}>
      <span className="font-medium">{label}:</span>
      <span className="font-bold">{value}{unit}</span>
    </span>
  )
}
