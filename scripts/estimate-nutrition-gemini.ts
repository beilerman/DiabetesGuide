/**
 * Estimate nutrition for remaining items using Google Gemini
 */

import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL!
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY!

// Try to get Gemini key (check both commented and uncommented)
let geminiKey = envVars['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY
if (!geminiKey) {
  // Check for commented key in .env.local
  const commentedMatch = envContent.match(/^#\s*GEMINI_API_KEY=(.+)$/m)
  if (commentedMatch) {
    geminiKey = commentedMatch[1].trim()
    console.log('Note: Using commented GEMINI_API_KEY from .env.local')
  }
}

if (!geminiKey) {
  console.error('GEMINI_API_KEY not found in .env.local')
  console.error('Get one from: https://aistudio.google.com/apikey')
  process.exit(1)
}

const supabase = createClient(url, key)
const genAI = new GoogleGenerativeAI(geminiKey)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

async function fetchAll(table: string, select: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) { console.error(`Error fetching ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

// Skip patterns for items we can't estimate
const SKIP_PATTERNS = [
  /water/i,
  /\bcoffee\b(?!.*cake|.*cookie)/i,
  /\btea\b(?!.*cake)/i,
  /espresso/i,
  /americano/i,
  /^spirits$/i,
  /flight$/i,  // Beer/wine flights are too variable
  /souvenir/i,  // Non-food items
  /bucket$/i,
  /mug$/i,
  /tote$/i,
  /straw$/i,
]

async function estimateWithGemini(name: string, description: string, category: string): Promise<any | null> {
  const prompt = `Estimate nutrition for this theme park food item. Theme park portions are typically 1.5-2x larger than standard restaurant portions.

Item: ${name}
Description: ${description || 'No description available'}
Category: ${category}

Return ONLY a valid JSON object with these exact integer keys:
{"calories": X, "carbs": X, "fat": X, "protein": X, "sugar": X, "fiber": X, "sodium": X}

Do not include any other text, just the JSON object.`

  try {
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    // Validate
    if (!parsed.calories || parsed.calories < 10 || parsed.calories > 3000) return null

    return {
      calories: Math.round(parsed.calories),
      carbs: Math.round(parsed.carbs || 0),
      fat: Math.round(parsed.fat || 0),
      protein: Math.round(parsed.protein || 0),
      sugar: Math.round(parsed.sugar || 0),
      fiber: Math.round(parsed.fiber || 0),
      sodium: Math.round(parsed.sodium || 0),
    }
  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
      throw new Error('RATE_LIMITED')
    }
    return null
  }
}

async function main() {
  console.log('Fetching items needing nutrition estimation...\n')

  // Get items with null calories and descriptions
  const nutritionData = await fetchAll('nutritional_data', 'id, menu_item_id, calories')
  const nullCalorieItems = nutritionData.filter(n => n.calories === null)

  const menuItems = await fetchAll('menu_items', 'id, name, description, category')
  const menuItemMap = new Map(menuItems.map(m => [m.id, m]))

  // Filter to items with descriptions that we can estimate
  const toEstimate: { nutrition: any; menuItem: any }[] = []

  for (const nutrition of nullCalorieItems) {
    const menuItem = menuItemMap.get(nutrition.menu_item_id)
    if (!menuItem) continue

    const name = (menuItem.name || '').trim()

    // Skip items we can't estimate
    if (SKIP_PATTERNS.some(p => p.test(name))) continue

    // Must have a description
    if (!menuItem.description || menuItem.description.trim().length === 0) continue

    toEstimate.push({ nutrition, menuItem })
  }

  console.log(`Items with null calories: ${nullCalorieItems.length}`)
  console.log(`Items to estimate (with descriptions, excluding water/coffee): ${toEstimate.length}`)

  if (toEstimate.length === 0) {
    console.log('No items to estimate!')
    return
  }

  // Process items one at a time with delay to avoid rate limits
  const DELAY = 1500 // 1.5 seconds between requests (40/min to stay under limit)
  let estimated = 0
  let failed = 0
  let rateLimited = false

  console.log('\nStarting Gemini estimation...\n')

  for (let i = 0; i < toEstimate.length; i++) {
    const { nutrition, menuItem } = toEstimate[i]

    process.stdout.write(`[${i + 1}/${toEstimate.length}] ${menuItem.name.slice(0, 40).padEnd(40)} `)

    try {
      const estimate = await estimateWithGemini(
        menuItem.name,
        menuItem.description,
        menuItem.category
      )

      if (estimate) {
        const { error } = await supabase.from('nutritional_data')
          .update({
            ...estimate,
            source: 'crowdsourced',
            confidence_score: 35
          })
          .eq('id', nutrition.id)

        if (!error) {
          estimated++
          console.log(`✓ ${estimate.calories} cal`)
        } else {
          failed++
          console.log(`✗ DB error`)
        }
      } else {
        failed++
        console.log(`✗ Invalid response`)
      }
    } catch (error: any) {
      if (error.message === 'RATE_LIMITED') {
        console.log(`✗ Rate limited`)
        rateLimited = true
        console.log('\n⚠️  Hit Gemini rate limit. Stopping.')
        console.log(`   Estimated ${estimated} items before limit.`)
        console.log(`   Wait a few minutes and run again to continue.`)
        break
      }
      failed++
      console.log(`✗ Error`)
    }

    // Delay between requests
    if (i < toEstimate.length - 1 && !rateLimited) {
      await new Promise(r => setTimeout(r, DELAY))
    }
  }

  console.log('\n=== Results ===')
  console.log(`Estimated: ${estimated}`)
  console.log(`Failed: ${failed}`)

  // Final stats
  const { data: finalStats } = await supabase
    .from('nutritional_data')
    .select('calories')

  let withCal = 0
  let nullCal = 0
  for (const n of finalStats || []) {
    if (n.calories !== null && n.calories > 0) withCal++
    else nullCal++
  }

  console.log(`\n=== Final Coverage ===`)
  console.log(`Items with calories > 0: ${withCal} (${(withCal / (withCal + nullCal) * 100).toFixed(1)}%)`)
  console.log(`Items with null/zero: ${nullCal}`)
}

main().catch(console.error)
