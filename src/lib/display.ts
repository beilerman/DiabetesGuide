import { getNutrition } from './nutrition'
import type { MenuItemWithNutrition, NutritionalData, MenuItem } from './types'

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '(c)',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  reg: '\u00ae',
  trade: 'TM',
}

function decodeEntity(entity: string): string {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const parsed = Number.parseInt(entity.slice(2), 16)
    return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : `&${entity};`
  }
  if (entity.startsWith('#')) {
    const parsed = Number.parseInt(entity.slice(1), 10)
    return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : `&${entity};`
  }
  return ENTITY_MAP[entity.toLowerCase()] ?? `&${entity};`
}

export function cleanDisplayText(value: string | null | undefined): string {
  if (!value) return ''

  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g, (_, entity: string) => decodeEntity(entity))
    .replace(/^[\s\-_*?.,:;|/\\]+/, '')
    .replace(/^\d+\.\s+(?=[A-Z][A-Z\s-]+$)/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getMenuItemDisplayName(item: Pick<MenuItemWithNutrition, 'name'>): string {
  return cleanDisplayText(item.name) || item.name
}

export function isLikelyMenuSectionHeader(name: string | null | undefined): boolean {
  const cleaned = cleanDisplayText(name)
  if (!cleaned) return true
  if (/^\d+%/.test(cleaned)) return false
  if (/^\d+\s+[A-Za-z]/.test(cleaned) && !/^\d+\.\s+/.test(name ?? '')) return false

  const normalized = cleaned.toLowerCase()
  return /^(choose|select|pick|build|create|customize|make it yours)\b/.test(normalized)
}

function hasAnyKnownMacro(nutrition: NutritionalData): boolean {
  return [
    nutrition.calories,
    nutrition.carbs,
    nutrition.fat,
    nutrition.sugar,
    nutrition.protein,
    nutrition.fiber,
    nutrition.sodium,
    nutrition.cholesterol,
    nutrition.alcohol_grams,
  ].some(value => value != null)
}

function allKnownValuesAreZero(nutrition: NutritionalData): boolean {
  const values = [
    nutrition.calories,
    nutrition.carbs,
    nutrition.fat,
    nutrition.sugar,
    nutrition.protein,
    nutrition.fiber,
    nutrition.sodium,
    nutrition.cholesterol,
    nutrition.alcohol_grams,
  ].filter((value): value is number => value != null)

  return values.length > 0 && values.every(value => value === 0)
}

function isConfirmedZeroNutritionItem(item: MenuItemWithNutrition, nutrition: NutritionalData): boolean {
  if (nutrition.source === 'official' && nutrition.confidence_score >= 70) return true
  const name = getMenuItemDisplayName(item).toLowerCase()
  return /\b(water|unsweetened tea|black coffee|diet soda|diet coke|diet pepsi)\b/.test(name)
}

export function hasUsableNutrition(item: MenuItemWithNutrition): boolean {
  const nutrition = getNutrition(item)
  if (!nutrition) return false
  if (!hasAnyKnownMacro(nutrition)) return false
  if (nutrition.calories == null && nutrition.carbs == null) return false
  if (allKnownValuesAreZero(nutrition) && !isConfirmedZeroNutritionItem(item, nutrition)) return false
  return true
}

export function getDisplayCategory(item: MenuItemWithNutrition): MenuItem['category'] {
  if (item.category === 'beverage') return item.category

  const name = getMenuItemDisplayName(item).toLowerCase()
  const nutrition = getNutrition(item)
  if (/\b(mug|tote|shirt|gift card|keychain|ornament|lanyard)\b/.test(name)) return item.category

  const hasFoodContext = /\b(pork|chicken|shrimp|crab(?:meat)?|lobster|mussels?|fish|salmon|tuna|steak|beef|turkey|dog|burger|fries|pasta|ravioli|gnocchi|flatbread|pizza|popcorn|potato|onion|rings?|pretzel|cheese|bisque|soup|chowder|pie|brownie|churro|cookie|cake|cupcake|cheesecake|pudding|ganache|chocolate|chocolat|fudge|caramel|cranachan|bananas?|bread|sandwich(?:es)?|wrap|salad|brine|battered|braised|glazed|rubbed|crusted|marinated|infused|sauce|reduction|compote|vinaigrette|soft-serve|ice cream|tiramisu|mousse|custard|sundae)\b/.test(name)

  if ((nutrition?.alcohol_grams ?? 0) > 0 && !hasFoodContext) return 'beverage'

  if (/\b(cabernet|merlot|pinot|chardonnay|champagne|prosecco|sangria|lager|ipa|stout|porter|cocktail|martini|margarita|mojito|soda|cola|coffee|latte|espresso|lemonade)\b/.test(name) && !hasFoodContext) {
    return 'beverage'
  }

  if (/\b(beer|ale|cider|wine|tea)\b/.test(name) && !hasFoodContext) {
    return 'beverage'
  }

  if (/\bold fashioned\b/.test(name) && !hasFoodContext) {
    return 'beverage'
  }

  return item.category
}

export function formatMaybeNumber(value: number | null | undefined, unit = ''): string {
  return value == null ? 'Not available' : `${value}${unit}`
}
