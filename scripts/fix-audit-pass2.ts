import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const items: any[] = JSON.parse(readFileSync(join(__dirname, '..', 'audit-dump.json'), 'utf-8'))

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const updates: { menuItemId: string; name: string; update: Record<string, any>; reason: string }[] = []

  for (const item of items) {
    const nd = item.nutritional_data?.[0]
    if (!nd) continue
    const n = (item.name + ' ' + (item.description || '')).toLowerCase()
    const cal = nd.calories
    const carbs = nd.carbs
    const fat = nd.fat
    const protein = nd.protein
    const sodium = nd.sodium
    const sugar = nd.sugar

    // === Fix remaining extreme sodium (3000-4000 range missed by first pass) ===
    if (sodium != null && sodium > 3000) {
      // Scale to reasonable range based on food type
      let targetSodium: number
      if (/pickle|fried.*pickle/.test(n)) targetSodium = 1800
      else if (/soup|chowder|gumbo/.test(n)) targetSodium = 1500
      else targetSodium = Math.min(sodium, 2500)
      if (targetSodium < sodium) {
        updates.push({ menuItemId: item.id, name: item.name, update: { sodium: targetSodium, confidence_score: 35 }, reason: `sodium ${sodium} → ${targetSodium}` })
      }
    }

    // === Fix remaining high-sodium desserts ===
    if (item.category === 'dessert' && sodium != null && sodium > 600) {
      if (!/pretzel|salted|sea salt|bacon|caramel corn/.test(n)) {
        updates.push({ menuItemId: item.id, name: item.name, update: { sodium: 300, confidence_score: 35 }, reason: `dessert sodium ${sodium} → 300` })
      }
    }

    // === Fix above-range items the first pass missed (food types it didn't detect) ===
    // Generic entrees over 2000 cal that aren't buffets/platters
    if (item.category === 'entree' && cal > 2000 && !/platter|buffet|feast|sampler|combo|family/.test(n)) {
      const ratio = 1200 / cal
      updates.push({
        menuItemId: item.id, name: item.name,
        update: {
          calories: 1200,
          carbs: carbs != null ? Math.round(carbs * ratio) : null,
          fat: fat != null ? Math.round(fat * ratio) : null,
          protein: protein != null ? Math.round(protein * ratio) : null,
          sugar: sugar != null ? Math.round(sugar * ratio) : null,
          sodium: sodium != null ? Math.round(Math.min(sodium * ratio, 2200)) : null,
          confidence_score: 35
        },
        reason: `over-cal entree ${cal} → 1200`
      })
      continue
    }

    // Generic sides over 800 cal
    if (item.category === 'side' && cal > 800 && !/platter|loaded|sampler/.test(n)) {
      const ratio = 500 / cal
      updates.push({
        menuItemId: item.id, name: item.name,
        update: {
          calories: 500,
          carbs: carbs != null ? Math.round(carbs * ratio) : null,
          fat: fat != null ? Math.round(fat * ratio) : null,
          protein: protein != null ? Math.round(protein * ratio) : null,
          sugar: sugar != null ? Math.round(sugar * ratio) : null,
          sodium: sodium != null ? Math.round(Math.min(sodium * ratio, 1200)) : null,
          confidence_score: 35
        },
        reason: `over-cal side ${cal} → 500`
      })
      continue
    }

    // Generic desserts over 1000 cal (not shareable)
    if (item.category === 'dessert' && cal > 1000 && !/share|family|platter/.test(n)) {
      const ratio = 650 / cal
      updates.push({
        menuItemId: item.id, name: item.name,
        update: {
          calories: 650,
          carbs: carbs != null ? Math.round(carbs * ratio) : null,
          fat: fat != null ? Math.round(fat * ratio) : null,
          protein: protein != null ? Math.round(protein * ratio) : null,
          sugar: sugar != null ? Math.round(sugar * ratio) : null,
          sodium: sodium != null ? Math.round(Math.min(sodium * ratio, 500)) : null,
          confidence_score: 35
        },
        reason: `over-cal dessert ${cal} → 650`
      })
      continue
    }

    // Generic beverages over 600 cal (not milkshakes)
    if (item.category === 'beverage' && cal > 600 && !/shake|milkshake|frappuccino/.test(n)) {
      const ratio = 350 / cal
      updates.push({
        menuItemId: item.id, name: item.name,
        update: {
          calories: 350,
          carbs: carbs != null ? Math.round(carbs * ratio) : null,
          fat: fat != null ? Math.round(fat * ratio) : null,
          protein: protein != null ? Math.round(protein * ratio) : null,
          sugar: sugar != null ? Math.round(sugar * ratio) : null,
          sodium: sodium != null ? Math.round(Math.min(sodium * ratio, 100)) : null,
          confidence_score: 35
        },
        reason: `over-cal beverage ${cal} → 350`
      })
      continue
    }

    // === Fix remaining caloric math mismatches ===
    if (protein != null && carbs != null && fat != null && cal > 50) {
      const calculated = (protein * 4) + (carbs * 4) + (fat * 9)
      const diff = Math.abs(calculated - cal)
      const pctDiff = diff / cal

      if (pctDiff > 0.25 && diff > 80) {
        // Skip alcoholic drinks (alcohol gap expected)
        if (/beer|wine|cocktail|margarita|daiquiri|martini|mojito|mai tai|rum|vodka|whiskey|sangria|mimosa|prosecco|champagne|sake|butterbeer|punch|hurricane|lava flow/.test(n)) continue

        if (calculated > cal) {
          // Macros over-state: scale macros to match calories
          const ratio = cal / calculated
          updates.push({
            menuItemId: item.id, name: item.name,
            update: {
              carbs: Math.round(carbs * ratio),
              fat: Math.round(fat * ratio),
              protein: Math.round(protein * ratio),
              sugar: sugar != null ? Math.round(sugar * ratio) : null,
              confidence_score: 35
            },
            reason: `macro math: calc=${calculated} > stated=${cal}, scaling macros ×${ratio.toFixed(2)}`
          })
        } else {
          // Macros under-state: recalc calories from macros
          updates.push({
            menuItemId: item.id, name: item.name,
            update: { calories: calculated, confidence_score: 35 },
            reason: `macro math: calc=${calculated} < stated=${cal}, setting cal=${calculated}`
          })
        }
      }
    }

    // === Fix low protein meat items ===
    if (protein != null && cal > 200) {
      const protPct = (protein * 4) / cal * 100
      const meatPattern = /chicken|turkey|steak|beef|pork|lamb|ribs|brisket|salmon|fish|shrimp|lobster|crab|tuna|mahi/
      if (meatPattern.test(n) && !/salad|cake|pie|soup/.test(n) && protPct < 10) {
        const targetProt = Math.round((cal * 0.25) / 4) // 25% protein
        updates.push({
          menuItemId: item.id, name: item.name,
          update: { protein: targetProt, confidence_score: 35 },
          reason: `low protein meat: ${protein}g (${protPct.toFixed(0)}%) → ${targetProt}g (25%)`
        })
      }
    }

    // === Fix zero-protein savory items ===
    if (protein === 0 && cal > 200 && ['entree', 'snack'].includes(item.category)) {
      if (!/fruit|juice|bread|pretzel|fries|chips|corn|rice|popcorn/.test(n)) {
        const targetProt = Math.round((cal * 0.15) / 4)
        updates.push({
          menuItemId: item.id, name: item.name,
          update: { protein: targetProt, confidence_score: 35 },
          reason: `zero protein savory: 0g → ${targetProt}g`
        })
      }
    }
  }

  // Deduplicate (keep last update per item)
  const dedupMap = new Map<string, typeof updates[0]>()
  for (const u of updates) dedupMap.set(u.menuItemId, u)
  const deduped = [...dedupMap.values()]

  console.log(`Prepared ${deduped.length} fixes`)
  for (const u of deduped.slice(0, 30)) {
    console.log(`  ${u.name}: ${u.reason}`)
  }
  if (deduped.length > 30) console.log(`  ... and ${deduped.length - 30} more`)

  let applied = 0
  let errors = 0
  for (let i = 0; i < deduped.length; i++) {
    const { menuItemId, update } = deduped[i]
    const { error } = await sb.from('nutritional_data').update(update).eq('menu_item_id', menuItemId)
    if (error) { console.error(`Error: ${menuItemId}`, error.message); errors++ }
    else applied++
    if (applied % 100 === 0 && applied > 0) console.log(`Applied ${applied}/${deduped.length}...`)
    if (i % 20 === 0) await delay(100)
  }

  console.log(`\nDone! Applied ${applied} fixes, ${errors} errors`)
}

main().catch(console.error)
