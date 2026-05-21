import type { MenuItemWithNutrition } from './types'

/**
 * Event/festival keywords that mark a name prefix as metadata rather than
 * part of the actual dish title.
 */
const EVENT_KEYWORDS =
  /festival|food\s*&\s*wine|flower\s*&\s*garden|holidays around the world/i

/**
 * Some menu items arrive with an event prefix baked into the title, e.g.
 * "2026 FESTIVAL OF THE ARTS- Artist Palette Jumbo Chocolate Chip Cookie".
 * The festival is already conveyed by the booth and the is_seasonal flag, so
 * strip the prefix and return just the dish name.
 *
 * Only a multi-word prefix containing an event keyword and followed by a
 * separator is removed, so hyphenated dish names ("Beer-battered Cod",
 * "Red Wine-braised Beef") are left untouched.
 */
export function cleanItemName(raw: string | null | undefined): string {
  const name = (raw ?? '').trim()
  const match = name.match(/^([^-–—:]+?)\s*[-–—:]\s+(.+)$/)
  if (match) {
    const prefix = match[1].trim()
    const rest = match[2].trim()
    if (rest.length >= 3 && /\s/.test(prefix) && EVENT_KEYWORDS.test(prefix)) {
      return rest
    }
  }
  return name
}

/** Return a copy of the items with event prefixes stripped from their names. */
export function cleanItemNames(
  items: MenuItemWithNutrition[],
): MenuItemWithNutrition[] {
  return items.map(item => {
    const cleaned = cleanItemName(item.name)
    return cleaned === item.name ? item : { ...item, name: cleaned }
  })
}
