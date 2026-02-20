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

export function alcoholColor(grams: number): string {
  if (grams <= 14) return 'bg-purple-100 text-purple-800 border-purple-200'
  if (grams <= 28) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-rose-100 text-rose-800 border-rose-200'
}
