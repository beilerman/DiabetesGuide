import type { MenuItemWithNutrition, NutritionalData } from './types'
import { cleanDisplayText } from './display'

function normalize(value: string | null | undefined): string {
  return cleanDisplayText(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2019']s\b/g, '')
    .replace(/[\u2019']/g, '')
    .replace(/\buniversals\b/g, 'universal')
    .replace(/\bdisneys\b/g, 'disney')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function duplicateKey(item: MenuItemWithNutrition): string {
  const park = normalize(item.restaurant?.park?.name)
  return [park, normalize(item.name)].join('|||')
}

function nutritionScore(nutrition: NutritionalData | undefined): number {
  if (!nutrition) return 0
  const nutrients = [
    nutrition.calories,
    nutrition.carbs,
    nutrition.fat,
    nutrition.sugar,
    nutrition.protein,
    nutrition.fiber,
    nutrition.sodium,
    nutrition.cholesterol,
  ]
  return 100 + nutrients.filter(value => value != null).length + nutrition.confidence_score / 100
}

function itemScore(item: MenuItemWithNutrition): number {
  return nutritionScore(item.nutritional_data?.[0]) +
    (item.photo_url ? 10 : 0) +
    (item.description ? 3 : 0) +
    (item.price != null ? 1 : 0)
}

function withAvailability(
  item: MenuItemWithNutrition,
  group: MenuItemWithNutrition[],
): MenuItemWithNutrition {
  const restaurants = [...new Set(
    group
      .map(dupe => dupe.restaurant?.name?.trim())
      .filter((name): name is string => !!name),
  )].sort((a, b) => a.localeCompare(b))

  return {
    ...item,
    availability_count: Math.max(1, restaurants.length),
    availability_restaurants: restaurants,
  }
}

export function dedupeMenuItems(items: MenuItemWithNutrition[]): MenuItemWithNutrition[] {
  const groups = new Map<string, MenuItemWithNutrition[]>()
  const order: string[] = []

  for (const item of items) {
    const key = duplicateKey(item)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(item)
  }

  return order.map(key => {
    const group = groups.get(key)!
    const best = group.reduce((currentBest, item) =>
      itemScore(item) > itemScore(currentBest) ? item : currentBest,
    group[0])
    return withAvailability(best, group)
  })
}
