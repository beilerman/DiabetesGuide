export function carbColor(carbs: number): string {
  if (carbs <= 15) return 'bg-green-100 text-green-800'
  if (carbs <= 45) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

export function NutritionBadge({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  if (value == null) return null
  return (
    <span className="text-sm">
      <span className="font-medium">{label}:</span> {value}{unit}
    </span>
  )
}
