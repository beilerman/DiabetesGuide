/**
 * Estimate nutrition for menu items using Groq AI (Llama 3.3 70B).
 * Processes items that have descriptions but missing nutrition data.
 *
 * Groq free tier: 14,400 requests/day, 30 requests/minute
 * Much more generous than Gemini's free tier!
 *
 * Usage: npx tsx scripts/estimate-nutrition-ai.ts
 */

import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
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

const url = envVars['SUPABASE_URL'] || process.env.SUPABASE_URL
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY
const groqKey = envVars['GROQ_API_KEY'] || process.env.GROQ_API_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}
if (!groqKey) {
  console.error('Set GROQ_API_KEY in env')
  console.error('Get one from: https://console.groq.com/keys')
  process.exit(1)
}

const supabase = createClient(url, key)
const groq = new Groq({ apiKey: groqKey })

// Validation ranges for nutrition values (per serving)
const VALID_RANGES = {
  calories: { min: 20, max: 3000 },
  carbs: { min: 0, max: 400 },
  fat: { min: 0, max: 200 },
  protein: { min: 0, max: 150 },
  sugar: { min: 0, max: 200 },
  fiber: { min: 0, max: 50 },
  sodium: { min: 0, max: 5000 },
} as const

interface NutritionEstimate {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

interface MenuItem {
  id: string
  name: string
  description: string
  category: string
  is_fried: boolean
  nutritional_data: { id: string } | null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validate nutrition estimate is within plausible ranges
 */
function validateNutrition(estimate: NutritionEstimate): NutritionEstimate | null {
  for (const [key, value] of Object.entries(estimate)) {
    const range = VALID_RANGES[key as keyof typeof VALID_RANGES]
    if (!range) continue
    if (typeof value !== 'number' || isNaN(value)) return null
    if (value < range.min || value > range.max) return null
  }

  // Additional validation: sugar <= carbs, fiber <= carbs
  if (estimate.sugar > estimate.carbs) return null
  if (estimate.fiber > estimate.carbs) return null

  // Caloric math sanity check (allow 30% variance)
  const estimatedCals = estimate.protein * 4 + estimate.carbs * 4 + estimate.fat * 9
  const ratio = Math.abs(estimate.calories - estimatedCals) / estimate.calories
  if (ratio > 0.3) {
    // Adjust calories to match macros
    estimate.calories = Math.round(estimatedCals)
  }

  return estimate
}

/**
 * Build prompt for AI to estimate nutrition
 */
function buildPrompt(items: MenuItem[]): string {
  const itemList = items.map((item, i) => {
    const fried = item.is_fried ? ' (fried)' : ''
    return `[${i + 1}] Name: ${item.name}${fried}
Category: ${item.category}
Description: ${item.description || 'No description'}`
  }).join('\n\n')

  return `You are a nutritionist estimating nutrition facts for theme park food items. These are typically larger portions than home-cooked meals (1.5-2x standard restaurant portions).

For each item below, estimate nutrition per serving. Consider:
- Theme park portions are generous (burgers are 1/3-1/2 lb, fries are large, drinks are 20oz+)
- Fried items have significantly more fat and calories
- Desserts are often oversized (cupcakes ~500-800 cal, sundaes ~600-1000 cal)
- Alcoholic drinks have ~100-150 cal per standard drink from alcohol alone

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "items": [
    {
      "index": 1,
      "calories": 650,
      "carbs": 45,
      "fat": 35,
      "protein": 28,
      "sugar": 8,
      "fiber": 3,
      "sodium": 1200
    }
  ]
}

All values must be integers. Be realistic but err slightly high for theme park portions.

Items to estimate:
${itemList}`
}

/**
 * Call Groq API to estimate nutrition for a batch of items with retry logic
 */
async function estimateBatch(items: MenuItem[], retryCount = 0): Promise<Map<string, NutritionEstimate>> {
  const MAX_RETRIES = 3
  const prompt = buildPrompt(items)

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert. Always respond with valid JSON only, no markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3, // Lower temperature for more consistent estimates
      max_tokens: 2048,
    })

    const text = completion.choices[0]?.message?.content || ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in Groq response:', text.slice(0, 200))
      return new Map()
    }

    const parsed = JSON.parse(jsonMatch[0])
    const estimates = new Map<string, NutritionEstimate>()

    for (const entry of parsed.items) {
      const item = items[entry.index - 1]
      if (!item) continue

      const estimate: NutritionEstimate = {
        calories: Math.round(entry.calories),
        carbs: Math.round(entry.carbs),
        fat: Math.round(entry.fat),
        protein: Math.round(entry.protein),
        sugar: Math.round(entry.sugar),
        fiber: Math.round(entry.fiber),
        sodium: Math.round(entry.sodium),
      }

      const validated = validateNutrition(estimate)
      if (validated) {
        estimates.set(item.id, validated)
      } else {
        console.log(`  Invalid estimate for ${item.name}, skipping`)
      }
    }

    return estimates
  } catch (err: any) {
    // Handle rate limiting with exponential backoff
    if (err?.status === 429 && retryCount < MAX_RETRIES) {
      const backoffMs = Math.pow(2, retryCount + 1) * 15000 // 30s, 60s, 120s - much longer waits
      console.log(`  Rate limited, waiting ${backoffMs / 1000}s before retry ${retryCount + 1}/${MAX_RETRIES}...`)
      await delay(backoffMs)
      return estimateBatch(items, retryCount + 1)
    }

    if (err?.status === 429) {
      console.error('  Rate limit exceeded after retries, skipping batch')
    } else {
      console.error('Failed to call Groq:', err?.message || err)
    }
    return new Map()
  }
}

async function fetchItemsNeedingNutrition(): Promise<MenuItem[]> {
  console.log('Fetching items with descriptions but missing nutrition...')

  // Fetch all menu items with descriptions but missing or zero nutrition
  let allRows: any[] = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('menu_items')
      .select(`
        id,
        name,
        description,
        category,
        is_fried,
        nutritional_data (id, calories, carbs, fat, protein)
      `)
      .not('description', 'is', null)
      .neq('description', '')
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('Failed to fetch menu items:', error)
      process.exit(1)
    }
    if (!batch?.length) break
    allRows = allRows.concat(batch)
    if (batch.length < batchSize) break
    from += batchSize
  }

  // Filter to items missing nutrition (no record OR all zeros)
  const needsNutrition = allRows.filter(row => {
    const nutData = Array.isArray(row.nutritional_data)
      ? row.nutritional_data[0]
      : row.nutritional_data

    if (!nutData) return true // No nutrition record
    if ((nutData.calories ?? 0) === 0 && (nutData.carbs ?? 0) === 0) return true // All zeros
    return false
  })

  console.log(`Found ${needsNutrition.length} items needing nutrition estimates`)
  return needsNutrition
}

async function estimateNutritionAI() {
  let items = await fetchItemsNeedingNutrition()

  if (items.length === 0) {
    console.log('No items need nutrition estimates.')
    return
  }

  // Support --limit N flag for testing
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
  if (limitArg) {
    const limit = parseInt(limitArg.split('=')[1], 10)
    if (limit > 0 && limit < items.length) {
      console.log(`Limiting to ${limit} items (test mode)`)
      items = items.slice(0, limit)
    }
  }

  // Groq free tier: 30 req/min, 12K tokens/min
  // Conservative settings to avoid hitting rate limits
  const BATCH_SIZE = 5 // Smaller batches = fewer tokens per request
  const RATE_LIMIT_DELAY = 6000 // 6 seconds between batches (~10 req/min, well under 30 RPM)

  let totalEstimated = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalFailed = 0

  // Process in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} (${batch.length} items)...`)

    try {
      const estimates = await estimateBatch(batch)
      totalEstimated += estimates.size

      // Insert or update nutrition data
      for (const item of batch) {
        const estimate = estimates.get(item.id)
        if (!estimate) {
          totalFailed++
          continue
        }

        const nutData = Array.isArray(item.nutritional_data)
          ? item.nutritional_data[0]
          : item.nutritional_data

        if (nutData?.id) {
          // Update existing record
          const { error } = await supabase
            .from('nutritional_data')
            .update({
              calories: estimate.calories,
              carbs: estimate.carbs,
              fat: estimate.fat,
              protein: estimate.protein,
              sugar: estimate.sugar,
              fiber: estimate.fiber,
              sodium: estimate.sodium,
              source: 'crowdsourced',
              confidence_score: 35,
            })
            .eq('id', nutData.id)

          if (error) {
            console.error(`  Failed to update ${item.name}:`, error)
            totalFailed++
          } else {
            totalUpdated++
          }
        } else {
          // Insert new record
          const { error } = await supabase
            .from('nutritional_data')
            .insert({
              menu_item_id: item.id,
              calories: estimate.calories,
              carbs: estimate.carbs,
              fat: estimate.fat,
              protein: estimate.protein,
              sugar: estimate.sugar,
              fiber: estimate.fiber,
              sodium: estimate.sodium,
              source: 'crowdsourced',
              confidence_score: 35,
            })

          if (error) {
            console.error(`  Failed to insert ${item.name}:`, error)
            totalFailed++
          } else {
            totalInserted++
          }
        }
      }

      console.log(`  Batch complete: ${estimates.size} estimated, ${totalInserted + totalUpdated} saved`)
    } catch (err) {
      console.error(`  Batch failed:`, err)
      totalFailed += batch.length
    }

    // Rate limit
    if (i + BATCH_SIZE < items.length) {
      await delay(RATE_LIMIT_DELAY)
    }
  }

  console.log('')
  console.log('=== AI Nutrition Estimation Complete ===')
  console.log(`Items processed: ${items.length}`)
  console.log(`Successfully estimated: ${totalEstimated}`)
  console.log(`New records inserted: ${totalInserted}`)
  console.log(`Existing records updated: ${totalUpdated}`)
  console.log(`Failed/skipped: ${totalFailed}`)
}

estimateNutritionAI().catch(console.error)
