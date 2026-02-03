import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { MergeResult } from './merge.js'
import type { EstimatedItem } from './estimate-nutrition.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Input type: MergeResult with newItems replaced by EstimatedItem[]
export type EstimatedMergeResult = Omit<MergeResult, 'newItems'> & { newItems: EstimatedItem[] }

export interface DiffReport {
  generatedAt: Date
  summary: {
    newItems: number
    updatedItems: number
    flaggedRemovals: number
    conflicts: number
    coverageChange: string
  }
  newItemsByPark: Record<string, EstimatedItem[]>
  needsReview: {
    priceConflicts: EstimatedItem[]
    lowConfidence: EstimatedItem[]
    potentiallyDiscontinued: MergeResult['potentiallyRemoved']
  }
  approveAllUrl: string
  reviewUrl: string
}

function groupByPark(items: EstimatedItem[]): Record<string, EstimatedItem[]> {
  const grouped: Record<string, EstimatedItem[]> = {}

  for (const item of items) {
    const park = item.parkName
    if (!grouped[park]) {
      grouped[park] = []
    }
    grouped[park].push(item)
  }

  return grouped
}

export function generateDiffReport(
  mergeResult: EstimatedMergeResult
): DiffReport {
  const newItemsByPark = groupByPark(mergeResult.newItems)

  const priceConflicts = mergeResult.newItems.filter(i => i.priceConflict)
  const lowConfidence = mergeResult.newItems.filter(i =>
    i.needsManualNutrition || (i.nutrition && i.nutrition.confidence < 50)
  )

  return {
    generatedAt: new Date(),
    summary: {
      newItems: mergeResult.newItems.length,
      updatedItems: mergeResult.updatedItems.length,
      flaggedRemovals: mergeResult.potentiallyRemoved.length,
      conflicts: mergeResult.conflicts.length,
      coverageChange: `+${mergeResult.newItems.length} items`,
    },
    newItemsByPark,
    needsReview: {
      priceConflicts,
      lowConfidence,
      potentiallyDiscontinued: mergeResult.potentiallyRemoved,
    },
    approveAllUrl: 'npx tsx scripts/approve.ts --all',
    reviewUrl: 'npx tsx scripts/approve.ts --interactive',
  }
}

export function formatReportAsMarkdown(report: DiffReport): string {
  const lines: string[] = []

  lines.push(`# DiabetesGuide Menu Sync — ${report.generatedAt.toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- **New items:** ${report.summary.newItems}`)
  lines.push(`- **Updated items:** ${report.summary.updatedItems}`)
  lines.push(`- **Flagged removals:** ${report.summary.flaggedRemovals}`)
  lines.push(`- **Conflicts:** ${report.summary.conflicts}`)
  lines.push('')

  lines.push('## New Items by Park')
  lines.push('')

  for (const [park, items] of Object.entries(report.newItemsByPark)) {
    lines.push(`### ${park} (${items.length} items)`)
    lines.push('')

    for (const item of items.slice(0, 10)) {
      const nutrition = item.nutrition
        ? `Est. ${item.nutrition.calories} cal, ${item.nutrition.carbs}g carbs (${item.nutrition.confidence}% confidence)`
        : 'Needs manual nutrition'

      lines.push(`- **${item.restaurantName}:** ${item.itemName}${item.price ? ` — $${item.price}` : ''}`)
      lines.push(`  - ${nutrition}`)
    }

    if (items.length > 10) {
      lines.push(`- ... and ${items.length - 10} more`)
    }
    lines.push('')
  }

  if (report.needsReview.priceConflicts.length > 0) {
    lines.push('## Needs Review: Price Conflicts')
    lines.push('')
    for (const item of report.needsReview.priceConflicts) {
      const prices = item.priceConflict!.map(p => `${p.source}: $${p.price}`).join(' vs ')
      lines.push(`- **${item.itemName}** (${item.restaurantName}): ${prices}`)
    }
    lines.push('')
  }

  if (report.needsReview.lowConfidence.length > 0) {
    lines.push('## Needs Review: Low Confidence Nutrition')
    lines.push('')
    for (const item of report.needsReview.lowConfidence.slice(0, 10)) {
      lines.push(`- **${item.itemName}** (${item.restaurantName}): ${item.nutrition ? `${item.nutrition.confidence}% confidence` : 'No matches found'}`)
    }
    if (report.needsReview.lowConfidence.length > 10) {
      lines.push(`- ... and ${report.needsReview.lowConfidence.length - 10} more`)
    }
    lines.push('')
  }

  lines.push('## Actions')
  lines.push('')
  lines.push('```bash')
  lines.push('# Approve all new items')
  lines.push(report.approveAllUrl)
  lines.push('')
  lines.push('# Review individually')
  lines.push(report.reviewUrl)
  lines.push('```')

  return lines.join('\n')
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pendingDir = resolve(__dirname, '../../data/pending')
  const files = existsSync(pendingDir)
    ? readdirSync(pendingDir).filter((f: string) => f.startsWith('estimated-'))
    : []

  if (files.length === 0) {
    console.error('No estimated data found. Run estimate-nutrition.ts first.')
    process.exit(1)
  }

  const latestFile = files.sort().pop()!
  const data = JSON.parse(readFileSync(resolve(pendingDir, latestFile), 'utf-8'))

  const report = generateDiffReport(data)
  const markdown = formatReportAsMarkdown(report)

  const outputPath = resolve(pendingDir, latestFile.replace('estimated-', 'report-').replace('.json', '.md'))
  writeFileSync(outputPath, markdown)

  const jsonPath = resolve(pendingDir, latestFile.replace('estimated-', 'report-'))
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  console.log(markdown)
  console.log('')
  console.log(`Report saved to: ${outputPath}`)
}
