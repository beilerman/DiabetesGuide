export type NutritionLevel = 'green' | 'amber' | 'rose'

/**
 * Single source of truth for the traffic-light bands.
 *
 * Both the badge color classes (`carbColor`/`sugarColor`/… below) and the
 * DotMeter color names used in `MenuItemCard` derive from `nutritionLevel()`, so
 * the thresholds can never drift between the two surfaces. This matters on a
 * diabetes decision surface — a card's number badge and its dot meter must agree
 * on whether a value is "safe" / "caution" / "limit".
 *
 * Boundary semantics are preserved exactly as the original per-metric functions:
 * carbs treat the green ceiling as inclusive (`<= 30`), the others as exclusive
 * (`< 10`, `< 400`, `< 500`). The amber ceiling is inclusive for all.
 *
 * Thresholds match the documented spec (CLAUDE.md "Traffic Light Nutrition
 * Colors"): Carbs ≤30 green / 31–60 amber; Sugar <10 / 10–25; Calories <400 /
 * 400–700; Sodium <500 / 500–1000.
 */
export const NUTRITION_BANDS = {
  carbs: { greenMax: 30, amberMax: 60, greenInclusive: true },
  sugar: { greenMax: 10, amberMax: 25, greenInclusive: false },
  calories: { greenMax: 400, amberMax: 700, greenInclusive: false },
  sodium: { greenMax: 500, amberMax: 1000, greenInclusive: false },
} as const

export type NutritionMetric = keyof typeof NUTRITION_BANDS

export function nutritionLevel(metric: NutritionMetric, value: number): NutritionLevel {
  const { greenMax, amberMax, greenInclusive } = NUTRITION_BANDS[metric]
  const isGreen = greenInclusive ? value <= greenMax : value < greenMax
  if (isGreen) return 'green'
  if (value <= amberMax) return 'amber'
  return 'rose'
}

const LEVEL_CLASSES: Record<NutritionLevel, string> = {
  green: 'bg-green-100 text-green-800 border-green-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200',
}

export function carbColor(carbs: number): string {
  return LEVEL_CLASSES[nutritionLevel('carbs', carbs)]
}

export function sugarColor(sugar: number): string {
  return LEVEL_CLASSES[nutritionLevel('sugar', sugar)]
}

export function calorieColor(calories: number): string {
  return LEVEL_CLASSES[nutritionLevel('calories', calories)]
}

export function sodiumColor(sodium: number): string {
  return LEVEL_CLASSES[nutritionLevel('sodium', sodium)]
}

export function alcoholColor(grams: number): string {
  if (grams <= 14) return 'bg-purple-100 text-purple-800 border-purple-200'
  if (grams <= 28) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}
