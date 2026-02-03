import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { MergeResult, MergedItem } from './merge.js'
import { normalizeName } from '../scrapers/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const supabase = createClient(url, key)

export interface NutritionEstimate {
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar?: number
  fiber?: number
  sodium?: number
  confidence: number // 0-100
  matchedItems: { name: string; similarity: number }[]
}

export interface EstimatedItem extends MergedItem {
  nutrition?: NutritionEstimate
  needsManualNutrition: boolean
}

// Keywords for food type matching
const FOOD_KEYWORDS: Record<string, string[]> = {
  burger: ['burger', 'hamburger', 'cheeseburger', 'patty'],
  sandwich: ['sandwich', 'sub', 'hoagie', 'wrap', 'panini'],
  pizza: ['pizza', 'flatbread'],
  chicken: ['chicken', 'wing', 'tender', 'nugget', 'fried chicken'],
  beef: ['beef', 'steak', 'ribeye', 'sirloin', 'brisket'],
  pork: ['pork', 'bacon', 'ham', 'ribs', 'pulled pork'],
  seafood: ['fish', 'shrimp', 'lobster', 'salmon', 'tuna', 'crab'],
  salad: ['salad', 'greens', 'caesar'],
  soup: ['soup', 'chili', 'stew', 'chowder'],
  pasta: ['pasta', 'spaghetti', 'fettuccine', 'mac and cheese', 'macaroni'],
  taco: ['taco', 'burrito', 'quesadilla', 'nachos', 'enchilada'],
  dessert: ['cake', 'cookie', 'brownie', 'ice cream', 'sundae', 'pie', 'churro'],
  beverage: ['soda', 'lemonade', 'tea', 'coffee', 'smoothie', 'shake', 'juice'],
  fries: ['fries', 'tots', 'potato', 'chips'],
  pretzel: ['pretzel'],
}

function extractKeywords(name: string): string[] {
  const normalized = normalizeName(name)
  const words = normalized.split(' ')
  const keywords: string[] = []

  for (const [category, terms] of Object.entries(FOOD_KEYWORDS)) {
    for (const term of terms) {
      if (normalized.includes(term)) {
        keywords.push(category)
        break
      }
    }
  }

  for (const word of words) {
    if (word.length > 3 && !['with', 'and', 'the'].includes(word)) {
      keywords.push(word)
    }
  }

  return [...new Set(keywords)]
}

function calculateSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) return 0

  const set1 = new Set(keywords1)
  const set2 = new Set(keywords2)
  const intersection = [...set1].filter(k => set2.has(k))
  const union = new Set([...set1, ...set2])

  return Math.floor((intersection.length / union.size) * 100)
}

async function getExistingItemsWithNutrition(): Promise<{
  id: string
  name: string
  category: string
  calories: number
  carbs: number
  fat: number
  protein: number
  sugar: number | null
  fiber: number | null
  sodium: number | null
  keywords: string[]
}[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(`
      id,
      name,
      category,
      nutritional_data (
        calories,
        carbs,
        fat,
        protein,
        sugar,
        fiber,
        sodium
      )
    `)

  if (error) throw error

  return (data || [])
    .filter(item => item.nutritional_data && (item.nutritional_data as any).calories)
    .map(item => {
      const nutrition = item.nutritional_data as any
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        calories: nutrition.calories,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        protein: nutrition.protein,
        sugar: nutrition.sugar,
        fiber: nutrition.fiber,
        sodium: nutrition.sodium,
        keywords: extractKeywords(item.name),
      }
    })
}

function estimateNutrition(
  item: MergedItem,
  existingItems: Awaited<ReturnType<typeof getExistingItemsWithNutrition>>
): NutritionEstimate | null {
  const itemKeywords = extractKeywords(item.itemName)

  if (itemKeywords.length === 0) return null

  const categoryMatches = existingItems.filter(e => e.category === item.category)
  const pool = categoryMatches.length >= 5 ? categoryMatches : existingItems

  const scored = pool.map(existing => ({
    ...existing,
    similarity: calculateSimilarity(itemKeywords, existing.keywords),
  }))

  scored.sort((a, b) => b.similarity - a.similarity)

  const topMatches = scored.filter(s => s.similarity >= 50).slice(0, 3)

  if (topMatches.length === 0) return null

  const totalWeight = topMatches.reduce((sum, m) => sum + m.similarity, 0)

  const estimate: NutritionEstimate = {
    calories: Math.round(topMatches.reduce((sum, m) => sum + (m.calories * m.similarity), 0) / totalWeight),
    carbs: Math.round(topMatches.reduce((sum, m) => sum + (m.carbs * m.similarity), 0) / totalWeight),
    fat: Math.round(topMatches.reduce((sum, m) => sum + (m.fat * m.similarity), 0) / totalWeight),
    protein: Math.round(topMatches.reduce((sum, m) => sum + (m.protein * m.similarity), 0) / totalWeight),
    confidence: Math.round(topMatches[0].similarity * 0.8),
    matchedItems: topMatches.map(m => ({ name: m.name, similarity: m.similarity })),
  }

  if (topMatches.every(m => m.sugar !== null)) {
    estimate.sugar = Math.round(topMatches.reduce((sum, m) => sum + ((m.sugar || 0) * m.similarity), 0) / totalWeight)
  }
  if (topMatches.every(m => m.fiber !== null)) {
    estimate.fiber = Math.round(topMatches.reduce((sum, m) => sum + ((m.fiber || 0) * m.similarity), 0) / totalWeight)
  }
  if (topMatches.every(m => m.sodium !== null)) {
    estimate.sodium = Math.round(topMatches.reduce((sum, m) => sum + ((m.sodium || 0) * m.similarity), 0) / totalWeight)
  }

  return estimate
}

export async function addNutritionEstimates(mergeResult: MergeResult): Promise<EstimatedItem[]> {
  const existingItems = await getExistingItemsWithNutrition()
  console.log(`Loaded ${existingItems.length} existing items with nutrition for matching`)

  const estimatedItems: EstimatedItem[] = []

  for (const item of mergeResult.newItems) {
    const estimate = estimateNutrition(item, existingItems)

    estimatedItems.push({
      ...item,
      nutrition: estimate || undefined,
      needsManualNutrition: !estimate || estimate.confidence < 50,
    })
  }

  return estimatedItems
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pendingDir = resolve(__dirname, '../../data/pending')
  const files = existsSync(pendingDir)
    ? readdirSync(pendingDir).filter((f: string) => f.startsWith('merged-'))
    : []

  if (files.length === 0) {
    console.error('No merged data found. Run merge.ts first.')
    process.exit(1)
  }

  const latestFile = files.sort().pop()!
  const mergeResult: MergeResult = JSON.parse(readFileSync(resolve(pendingDir, latestFile), 'utf-8'))

  console.log(`Estimating nutrition for ${mergeResult.newItems.length} new items...`)

  addNutritionEstimates(mergeResult)
    .then(estimated => {
      const withNutrition = estimated.filter(e => e.nutrition)
      const needsManual = estimated.filter(e => e.needsManualNutrition)

      const outputPath = resolve(pendingDir, latestFile.replace('merged-', 'estimated-'))
      writeFileSync(outputPath, JSON.stringify({
        ...mergeResult,
        newItems: estimated,
      }, null, 2))

      console.log('')
      console.log('=== Nutrition Estimation Complete ===')
      console.log(`With nutrition: ${withNutrition.length}`)
      console.log(`  High confidence (80%+): ${withNutrition.filter(e => e.nutrition!.confidence >= 80).length}`)
      console.log(`  Medium confidence (50-79%): ${withNutrition.filter(e => e.nutrition!.confidence >= 50 && e.nutrition!.confidence < 80).length}`)
      console.log(`  Low confidence (<50%): ${withNutrition.filter(e => e.nutrition!.confidence < 50).length}`)
      console.log(`Needs manual entry: ${needsManual.length}`)
      console.log(`Output: ${outputPath}`)
    })
    .catch(console.error)
}
