import { describe, expect, it } from 'vitest'
import { correctCategory } from '../recategorize'

// Items that MUST be reclassified, with their expected target category.
const truePositives: Array<[name: string, current: string, expected: string, restaurant?: string]> = [
  // Gelateria Toscana cases from the bug report
  ['Affogato', 'entree', 'dessert'],
  ['"Affogato" Al Cioccolato', 'entree', 'dessert'],
  ['Mocha Tiramisù', 'entree', 'dessert'],
  ['Coppa del Nonno', 'entree', 'dessert'],
  ['Gelati Floats', 'entree', 'dessert'],
  ['Vanilla Milkshake', 'entree', 'dessert'],
  ['Zeppole Sundae', 'entree', 'dessert'],
  ['Pistachio Gelato', 'entree', 'dessert'],
  ['Lemon Sorbetto', 'entree', 'dessert'],
  // Drinks
  ['Sparkling Italian Soda', 'entree', 'beverage'],
  ['Frozen Sangria', 'entree', 'beverage'],
  ['Espresso Martini', 'entree', 'beverage'],
  ['Cold Brew Coffee', 'entree', 'beverage'],
  ['Iced Green Tea', 'entree', 'beverage'],
]

// Items that MUST NOT move — the historical traps plus the new-term traps the
// review flagged (coppa charcuterie, root beer float as a food, etc.).
const falsePositives: Array<[name: string, current: string, restaurant?: string]> = [
  ['Crispy Calamari', 'entree'],
  ['Crispy Chicken Sandwich', 'entree'],
  ['Beer-battered Onion Rings', 'entree'],
  ['Root Beer-brined Pork', 'entree'],
  ['Red Wine-braised Beef Short Rib', 'entree'],
  ['Shrimp Cocktail', 'entree'],
  ['Coffee Cake Cookie', 'dessert'],
  ['Coffee-rubbed Rib-Eye', 'entree'],
  // New-term traps introduced by this script — must be guarded:
  ['Coppa di Parma', 'entree'],                       // cured pork, not gelato
  ['Coppa, Salami & Provolone Board', 'entree'],      // charcuterie board
  ['Butterbeer Ice Cream', 'dessert'],                // already dessert, stays
  ['Tea-smoked Duck Breast', 'entree'],               // tea as a method, not a drink
  ['Chai-spiced Chicken', 'entree'],
  ['Prosciutto & Arugula Panino', 'entree'],          // savory food context
  // Traps surfaced by the live dry-run — these must NOT move:
  ['Coca-Cola® Cherry-braised Pork Sandwich', 'entree'],  // soda word + savory dish
  ['Tequila Spiked Shrimp Ceviche', 'entree'],            // spirit word + seafood dish
  ['Matcha-Raspberry Baymax Macaron', 'entree'],          // tea word + macaron
  ['Green Tea Soft-Serve', 'dessert'],                    // tea word + soft-serve dessert
  ['Extra day of refills for Freestyle® Cup', 'entree'], // "extra " + a cup refill, not a side
]

describe('correctCategory — true positives (must reclassify)', () => {
  it.each(truePositives)('%s (%s) → %s', (name, current, expected, restaurant) => {
    const result = correctCategory(name, current, restaurant)
    expect(result?.to).toBe(expected)
  })
})

describe('correctCategory — false positives (must NOT move)', () => {
  it.each(falsePositives)('%s stays %s', (name, current, restaurant) => {
    const result = correctCategory(name, current, restaurant)
    expect(result).toBeNull()
  })
})

describe('correctCategory — idempotency', () => {
  it('does not re-move an item already in its corrected category', () => {
    // Running the classifier on the *corrected* category yields no further move.
    for (const [name, current, , restaurant] of truePositives) {
      const first = correctCategory(name, current, restaurant)
      expect(first).not.toBeNull()
      const second = correctCategory(name, first!.to, restaurant)
      expect(second).toBeNull()
    }
  })
})
