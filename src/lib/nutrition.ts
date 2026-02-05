import type { MenuItemWithNutrition, NutritionalData } from './types'

/**
 * Extract the first nutritional_data entry for a menu item.
 * Centralizes the repeated `item.nutritional_data?.[0]` pattern.
 */
export function getNutrition(
  item: MenuItemWithNutrition,
): NutritionalData | undefined {
  return item.nutritional_data?.[0]
}
