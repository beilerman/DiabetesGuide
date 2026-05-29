/**
 * Parse a 2-column chain-restaurant nutrition PDF using positional text extraction.
 *
 * The challenge: pdftotext flattens 2-column tables and often misaligns item names
 * with their nutrition rows. pdfjs-dist gives us per-text-item X/Y coordinates,
 * so we can group items by Y (row) and sort by X (column), reconstructing the
 * intended table.
 *
 * Output: JSON array of { name, calories, fat, sat_fat, sodium, carbs, fiber, sugar, protein }
 *
 * Usage:
 *   npx tsx scripts/parse-chain-pdf.ts <pdf-path> <out-json> [skip-rows] [name-col-x-max]
 */

import { readFileSync, writeFileSync } from 'fs'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

interface TextItem {
  str: string
  x: number
  y: number
  page: number
}

async function extractItems(pdfPath: string): Promise<TextItem[]> {
  const data = new Uint8Array(readFileSync(pdfPath))
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise
  const out: TextItem[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    for (const item of tc.items as { str: string; transform: number[] }[]) {
      if (!item.str.trim()) continue
      out.push({ str: item.str, x: item.transform[4], y: item.transform[5], page: p })
    }
  }
  return out
}

interface Row { y: number; items: TextItem[] }

function groupByRow(items: TextItem[], yTolerance = 2): Row[] {
  // Group items whose y values are within yTolerance into the same row
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const rows: Row[] = []
  let cur: Row | null = null
  for (const it of sorted) {
    if (!cur || Math.abs(cur.y - it.y) > yTolerance || cur.items[0].page !== it.page) {
      cur = { y: it.y, items: [] }
      rows.push(cur)
    }
    cur.items.push(it)
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x)
  return rows
}

function rowText(r: Row): string {
  return r.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()
}

interface ParsedRow {
  name: string
  calories: number | null
  fat: number | null
  carbs: number | null
  fiber: number | null
  sugar: number | null
  protein: number | null
  sodium: number | null
}

function parseNumberSequence(tokens: string[]): number[] {
  const out: number[] = []
  for (const t of tokens) {
    const m = t.match(/^[\d,]+(\.\d+)?$/)
    if (m) out.push(parseFloat(t.replace(/,/g, '')))
    else if (t === '--' || t === '-') out.push(NaN)
  }
  return out
}

/**
 * Detect rows with nutrition data: text contains a name + a sequence of numbers.
 * The name is typically the leading non-numeric tokens; numbers are values.
 */
function parseRow(r: Row): ParsedRow | null {
  const text = rowText(r)
  // Skip header/category lines
  if (/calories|kcal|fat \(g\)|carb|prot|fiber|sodium|nutrition|allergen|guide|version|laboratory|item name|serving|cholesterol/i.test(text)) {
    if (!/\d/.test(text.split(/\s+/).slice(-3).join(' '))) return null
  }
  // Tokenize
  const tokens = text.split(/\s+/)
  // Find the first numeric token — name is everything before
  let firstNumIdx = -1
  for (let i = 0; i < tokens.length; i++) {
    if (/^[\d,]+(\.\d+)?$/.test(tokens[i])) { firstNumIdx = i; break }
  }
  if (firstNumIdx < 1) return null
  const nameTokens = tokens.slice(0, firstNumIdx).filter(t => !/^(\d+|--|-)$/.test(t))
  const name = nameTokens.join(' ').trim()
  if (!name || name.length < 3) return null
  const numTokens = tokens.slice(firstNumIdx)
  const nums = parseNumberSequence(numTokens)
  if (nums.length < 4) return null
  return { name, calories: null, fat: null, carbs: null, fiber: null, sugar: null, protein: null, sodium: null, _raw: nums } as ParsedRow & { _raw: number[] }
}

interface ColumnSchema {
  /** Index into the parsed nums array. Adjust per PDF as needed. */
  servingWeight?: number
  servingSize?: number
  calories: number
  fatCals?: number
  fat: number
  satFat?: number
  transFat?: number
  cholesterol?: number
  sodium: number
  carbs: number
  fiber: number
  sugar: number
  protein: number
}

function applySchema(rows: (ParsedRow & { _raw: number[] })[], schema: ColumnSchema): ParsedRow[] {
  return rows.map(r => ({
    name: r.name,
    calories: r._raw[schema.calories] ?? null,
    fat: r._raw[schema.fat] ?? null,
    carbs: r._raw[schema.carbs] ?? null,
    fiber: r._raw[schema.fiber] ?? null,
    sugar: r._raw[schema.sugar] ?? null,
    protein: r._raw[schema.protein] ?? null,
    sodium: r._raw[schema.sodium] ?? null,
  }))
}

const SCHEMAS: Record<string, ColumnSchema> = {
  // EOS: name, Cals, FatCals, Fat, SatFat, TransFat, Chol, Sod, Carb, TotFib, Sugar, Prot
  earl: { calories: 0, fatCals: 1, fat: 2, satFat: 3, transFat: 4, cholesterol: 5, sodium: 6, carbs: 7, fiber: 8, sugar: 9, protein: 10 },
  // Wetzel's: name, ServingWeight, ServingSize "1 each" (parsed as just "1"), Cal, Fat, SatFat, TransFat, Chol, Sod, Carb, Fiber, Sugar, AddedSug, Protein
  wetzels: { servingWeight: 0, calories: 2, fat: 3, satFat: 4, transFat: 5, cholesterol: 6, sodium: 7, carbs: 8, fiber: 9, sugar: 10, protein: 12 },
}

async function main() {
  const [pdfPath, outPath, schemaName = 'earl'] = process.argv.slice(2)
  if (!pdfPath || !outPath) {
    console.error('Usage: tsx parse-chain-pdf.ts <pdf-path> <out-json> [schema=earl|wetzels]')
    process.exit(1)
  }
  const schema = SCHEMAS[schemaName]
  if (!schema) { console.error(`Unknown schema: ${schemaName}. Available: ${Object.keys(SCHEMAS).join(', ')}`); process.exit(1) }

  const items = await extractItems(pdfPath)
  console.log(`Extracted ${items.length} text fragments`)
  const rows = groupByRow(items)
  console.log(`Grouped into ${rows.length} rows`)

  const parsed: (ParsedRow & { _raw: number[] })[] = []
  for (const r of rows) {
    const p = parseRow(r)
    if (p) parsed.push(p as ParsedRow & { _raw: number[] })
  }
  console.log(`Parsed ${parsed.length} candidate rows`)

  const final = applySchema(parsed, schema)
  // Filter rows that have at least calories+carbs+fat+protein
  const valid = final.filter(r => r.calories != null && r.carbs != null && r.fat != null && r.protein != null && r.calories >= 0 && r.calories < 5000)
  console.log(`Valid rows (with cal+carbs+fat+protein): ${valid.length}`)

  writeFileSync(outPath, JSON.stringify(valid, null, 2))
  console.log(`Saved to ${outPath}`)

  // Print first 10 for verification
  console.log('\nFirst 10:')
  for (const r of valid.slice(0, 10)) {
    console.log(`  ${r.name.padEnd(50)} cal=${r.calories} carbs=${r.carbs} fat=${r.fat} prot=${r.protein} sodium=${r.sodium}`)
  }
}

main().catch(err => {
  console.error('parse-chain-pdf failed:', err)
  process.exit(1)
})
