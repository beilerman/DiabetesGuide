import { isCalorieCapped } from './grade'

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
  /** When the underlying nutrition is a low-confidence estimate, reassuring
   * "zero impact" claims are downgraded so they don't discourage verification. */
  confidenceScore?: number
}

export function getDiabetesAnnotations(item: AnnotationInput): Annotation[] {
  const { calories, carbs, sugar, fat, protein, fiber, sodium, alcoholGrams, category, isFried, confidenceScore } = item
  if (calories == null || carbs == null) return []
  const isLowConfidence = confidenceScore != null && confidenceScore < 70

  const annotations: Annotation[] = []

  // Data sanity: sugar and fiber are components of carbohydrate, so neither can
  // exceed total carbs. When one does, the row is internally inconsistent — flag
  // it for verification rather than silently trusting the numbers.
  if ((sugar != null && sugar > carbs) || (fiber != null && fiber > carbs)) {
    annotations.push({ text: 'Values look inconsistent — sugar or fiber exceeds total carbs; verify before dosing', severity: 'amber' })
  }
  const s = sugar ?? 0
  const f = fiber ?? 0
  const p = protein ?? 0
  const fa = fat ?? 0
  const alc = alcoholGrams ?? 0
  const sugarRatio = carbs > 0 ? s / carbs : 0
  const proteinRatio = carbs > 0 ? p / carbs : (p > 0 ? 10 : 0)

  // Zero carb beverage — no impact. A low-confidence zero is not asserted as
  // safe; it's flagged for verification instead of given a reassuring green.
  if (carbs === 0 && category === 'beverage') {
    annotations.push(
      isLowConfidence
        ? { text: 'Estimated zero carb — verify before assuming no impact', severity: 'amber' }
        : { text: 'Zero carb — no glucose impact', severity: 'green' },
    )
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
    annotations.push({ text: 'Moderate sugar with high carbs — can raise glucose quickly', severity: 'amber' })
  }

  // High fat + high carb (delayed absorption)
  if (fa > 40 && carbs > 40) {
    annotations.push({ text: 'High fat may delay carb absorption — slower, more prolonged rise', severity: 'amber' })
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

  // Calorie-dense item whose letter grade was capped despite a low carb load —
  // explains why a low-carb item isn't graded A and nudges portion awareness.
  if (isCalorieCapped({ calories, carbs, fat, protein, sugar, fiber, sodium, alcoholGrams })) {
    annotations.push({ text: 'Calorie-dense — grade capped despite low carbs; mind the portion', severity: 'amber' })
  }

  // Minimal impact (only skip if there are warning annotations)
  const hasWarnings = annotations.some(a => a.severity === 'red' || a.severity === 'amber')
  if (carbs < 15 && calories < 200 && !hasWarnings) {
    annotations.push({ text: 'Low carbohydrate — small glucose impact', severity: 'green' })
  }

  return annotations
}
