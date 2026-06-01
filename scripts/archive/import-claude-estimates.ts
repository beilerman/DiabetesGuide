/**
 * Import Claude's nutrition estimates into the database.
 * Reads from data/claude-nutrition-output.json
 *
 * Expected format:
 * [
 *   {
 *     "id": "nutrition_data_id",
 *     "calories": 650,
 *     "carbs": 45,
 *     "fat": 35,
 *     "protein": 28,
 *     "sugar": 8,
 *     "fiber": 3,
 *     "sodium": 1200
 *   },
 *   ...
 * ]
 *
 * Usage: npx tsx scripts/import-claude-estimates.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
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

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

interface NutritionEstimate {
  id: string  // nutritional_data id
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number
  fiber: number
  sodium: number
}

// Validation ranges (same as the Groq script)
const VALID_RANGES = {
  calories: { min: 20, max: 3000 },
  carbs: { min: 0, max: 400 },
  fat: { min: 0, max: 200 },
  protein: { min: 0, max: 150 },
  sugar: { min: 0, max: 200 },
  fiber: { min: 0, max: 50 },
  sodium: { min: 0, max: 5000 },
} as const

function validateEstimate(est: NutritionEstimate): string[] {
  const errors: string[] = []

  for (const [key, range] of Object.entries(VALID_RANGES)) {
    const value = est[key as keyof typeof VALID_RANGES]
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`${key} is not a valid number`)
    } else if (value < range.min || value > range.max) {
      errors.push(`${key}=${value} out of range [${range.min}-${range.max}]`)
    }
  }

  if (est.sugar > est.carbs) {
    errors.push(`sugar (${est.sugar}) > carbs (${est.carbs})`)
  }
  if (est.fiber > est.carbs) {
    errors.push(`fiber (${est.fiber}) > carbs (${est.carbs})`)
  }

  return errors
}

async function main() {
  const inputPath = resolve(__dirname, '..', 'data', 'claude-nutrition-output.json')

  if (!existsSync(inputPath)) {
    console.error('Input file not found: data/claude-nutrition-output.json')
    console.error('Create this file with Claude\'s nutrition estimates first.')
    process.exit(1)
  }

  const content = readFileSync(inputPath, 'utf-8')
  let estimates: NutritionEstimate[]

  try {
    estimates = JSON.parse(content)
    if (!Array.isArray(estimates)) {
      throw new Error('Expected an array')
    }
  } catch (err) {
    console.error('Invalid JSON in input file:', err)
    process.exit(1)
  }

  console.log(`Loaded ${estimates.length} estimates from data/claude-nutrition-output.json`)

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const est of estimates) {
    // Validate
    const validationErrors = validateEstimate(est)
    if (validationErrors.length > 0) {
      console.log(`Skipping ${est.id}: ${validationErrors.join(', ')}`)
      skipped++
      continue
    }

    // Round all values
    const rounded = {
      calories: Math.round(est.calories),
      carbs: Math.round(est.carbs),
      fat: Math.round(est.fat),
      protein: Math.round(est.protein),
      sugar: Math.round(est.sugar),
      fiber: Math.round(est.fiber),
      sodium: Math.round(est.sodium),
      source: 'crowdsourced' as const,
      confidence_score: 40, // Claude estimates get score of 40
    }

    // Update database
    const { error } = await supabase
      .from('nutritional_data')
      .update(rounded)
      .eq('id', est.id)

    if (error) {
      console.error(`Error updating ${est.id}:`, error.message)
      errors++
    } else {
      updated++
    }
  }

  console.log('')
  console.log('=== Import Complete ===')
  console.log(`Updated: ${updated}`)
  console.log(`Skipped (validation): ${skipped}`)
  console.log(`Errors: ${errors}`)
}

main().catch(console.error)
