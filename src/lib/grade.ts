export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface GradeColors {
  bg: string
  text: string
  label: string
}

export const GRADE_CONFIG: Record<Grade, GradeColors> = {
  A: { bg: '#16a34a', text: '#ffffff', label: 'Diabetes-friendly' },
  B: { bg: '#65a30d', text: '#ffffff', label: 'Good choice' },
  C: { bg: '#ca8a04', text: '#ffffff', label: 'Plan your bolus' },
  D: { bg: '#ea580c', text: '#ffffff', label: 'Caution — high carb impact' },
  F: { bg: '#dc2626', text: '#ffffff', label: 'Consider alternatives' },
}

/**
 * Scoring context controls the carb / calorie / protein bands.
 *
 * 'entree' uses meal-sized bands so that a balanced 50–60g carb,
 * 500–700 cal entrée is not punished for simply being a meal. All other
 * categories (snack, side, beverage, dessert) keep tighter snack-sized bands.
 *
 * Default is 'snack' to preserve backward compatibility for callers that
 * don't pass a category (e.g. unit tests, ad-hoc nutrition checks).
 */
export type ScoringContext = 'entree' | 'snack'

interface NutritionInput {
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  alcoholGrams?: number | null
  /**
   * Menu item category. 'entree' triggers permissive meal-sized bands;
   * anything else uses snack-sized bands.
   */
  category?: 'entree' | 'snack' | 'beverage' | 'dessert' | 'side'
}

function contextFor(category?: NutritionInput['category']): ScoringContext {
  return category === 'entree' ? 'entree' : 'snack'
}

function scoreNetCarbs(netCarbs: number, ctx: ScoringContext): number {
  if (ctx === 'entree') {
    if (netCarbs <= 30) return 100
    if (netCarbs <= 45) return 80
    if (netCarbs <= 60) return 60
    if (netCarbs <= 80) return 40
    if (netCarbs <= 100) return 20
    return 0
  }
  if (netCarbs <= 15) return 100
  if (netCarbs <= 30) return 80
  if (netCarbs <= 45) return 60
  if (netCarbs <= 60) return 40
  if (netCarbs <= 80) return 20
  return 0
}

function scoreSugarRatio(sugar: number, carbs: number): number {
  if (carbs === 0) return 100
  const ratio = sugar / carbs
  if (ratio < 0.2) return 100
  if (ratio < 0.4) return 70
  if (ratio < 0.6) return 40
  return 10
}

function scoreProteinRatio(protein: number, carbs: number, ctx: ScoringContext): number {
  if (carbs === 0) return 100
  const ratio = protein / carbs
  if (ctx === 'entree') {
    // A balanced entrée with ~half as much protein as carbs (e.g. 25g
    // protein and 50g carbs) is reasonable; reward that, not just keto.
    if (ratio > 0.6) return 100
    if (ratio > 0.4) return 80
    if (ratio > 0.25) return 60
    return 30
  }
  if (ratio > 1.0) return 100
  if (ratio > 0.5) return 75
  if (ratio > 0.25) return 50
  return 20
}

function scoreFiber(fiber: number): number {
  if (fiber >= 8) return 100
  if (fiber >= 5) return 75
  if (fiber >= 2) return 50
  return 20
}

function scoreCalories(calories: number, ctx: ScoringContext): number {
  if (ctx === 'entree') {
    if (calories < 500) return 100
    if (calories < 700) return 75
    if (calories < 900) return 50
    return 25
  }
  if (calories < 300) return 100
  if (calories < 500) return 75
  if (calories < 700) return 50
  return 25
}

export function computeScore(n: NutritionInput): number | null {
  if (n.calories == null || n.carbs == null) return null

  // Zero-calorie items are automatic 100
  if (n.calories === 0 && n.carbs === 0) return 100

  const carbs = n.carbs ?? 0
  const sugar = n.sugar ?? 0
  const fiber = n.fiber ?? 0
  const protein = n.protein ?? 0
  const calories = n.calories ?? 0
  const netCarbs = Math.max(0, carbs - fiber)
  const ctx = contextFor(n.category)

  const weighted =
    scoreNetCarbs(netCarbs, ctx) * 0.4 +
    scoreSugarRatio(sugar, carbs) * 0.2 +
    scoreProteinRatio(protein, carbs, ctx) * 0.15 +
    scoreFiber(fiber) * 0.15 +
    scoreCalories(calories, ctx) * 0.1

  // Alcohol penalty
  const alcoholPenalty = (n.alcoholGrams ?? 0) > 0 ? 15 : 0

  return Math.max(0, Math.round(weighted - alcoholPenalty))
}

export function computeGrade(score: number | null): Grade | null {
  if (score == null) return null
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function getGradeForItem(n: NutritionInput): { score: number | null; grade: Grade | null; colors: GradeColors | null } {
  const score = computeScore(n)
  const grade = computeGrade(score)
  const colors = grade ? GRADE_CONFIG[grade] : null
  return { score, grade, colors }
}
