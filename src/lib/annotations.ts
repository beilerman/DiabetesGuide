export type AnnotationSeverity = 'green' | 'amber' | 'red' | 'teal'

export interface Annotation {
  text: string
  severity: AnnotationSeverity
}

interface AnnotationInput {
  calories: number | null
  carbs: number | null
  sugar: number | null
  fat: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  alcoholGrams: number | null
  category: string
  isFried: boolean
}

export function getDiabetesAnnotations(item: AnnotationInput): Annotation[] {
  const { calories, carbs, sugar, fat, protein, fiber, alcoholGrams, category, isFried } = item
  if (calories == null || carbs == null) return []

  const annotations: Annotation[] = []
  const s = sugar ?? 0
  const f = fiber ?? 0
  const p = protein ?? 0
  const fa = fat ?? 0
  const alc = alcoholGrams ?? 0
  const sugarRatio = carbs > 0 ? s / carbs : 0
  const proteinRatio = carbs > 0 ? p / carbs : (p > 0 ? 10 : 0)

  // Zero carb beverage — no impact
  if (carbs === 0 && category === 'beverage') {
    annotations.push({ text: 'Zero carb — no glucose impact', severity: 'green' })
    return annotations
  }

  // Liquid sugar (beverages with high sugar)
  if (category === 'beverage' && s > 25) {
    annotations.push({ text: 'Liquid sugar — fastest possible glucose spike', severity: 'red' })
  }

  // Alcohol warnings
  if (alc > 0 && carbs > 30) {
    annotations.push({ text: 'High carbs + alcohol — initial spike then delayed drop. Complex dosing.', severity: 'red' })
  } else if (alc > 0) {
    annotations.push({ text: 'Contains alcohol — may cause delayed hypoglycemia. Monitor BG for 12+ hours', severity: 'red' })
  }

  // High simple sugar
  if (sugarRatio > 0.6 && category !== 'beverage') {
    annotations.push({ text: 'High simple sugar — expect rapid glucose spike', severity: 'red' })
  } else if (sugarRatio > 0.4 && carbs > 40) {
    annotations.push({ text: 'Moderate sugar with high carbs — bolus early', severity: 'amber' })
  }

  // High fat + high carb (delayed absorption)
  if (fa > 40 && carbs > 40) {
    annotations.push({ text: 'High fat may delay carb absorption — consider extended bolus', severity: 'amber' })
  }

  // Fried + high carb
  if (isFried && carbs > 40 && fa <= 40) {
    annotations.push({ text: 'Fried + high carb — fat delays peak but doesn\'t reduce it', severity: 'amber' })
  }

  // Positive: high protein
  if (proteinRatio > 0.8) {
    annotations.push({ text: 'Strong protein — may blunt postprandial rise', severity: 'green' })
  }

  // Positive: good fiber
  if (f > 6 && carbs > 50) {
    annotations.push({ text: 'High fiber offsets some carb impact — watch net carbs', severity: 'teal' })
  } else if (f > 6) {
    annotations.push({ text: 'Good fiber content — slower carb absorption', severity: 'green' })
  }

  // Minimal impact (only skip if there are warning annotations)
  const hasWarnings = annotations.some(a => a.severity === 'red' || a.severity === 'amber')
  if (carbs < 15 && calories < 200 && !hasWarnings) {
    annotations.push({ text: 'Minimal glucose impact — may not need bolus', severity: 'green' })
  }

  return annotations
}
