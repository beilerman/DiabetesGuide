import type { AutoFix } from './types.js'

export interface FixBatchEntry {
  id: string
  updates: Record<string, number>
  fixes: AutoFix[]
}

/**
 * Group fixes by nutritionDataId, merging their field->value updates
 * into a single object per record.
 */
export function buildFixBatch(fixes: AutoFix[]): FixBatchEntry[] {
  const map = new Map<string, FixBatchEntry>()

  for (const fix of fixes) {
    let entry = map.get(fix.nutritionDataId)
    if (!entry) {
      entry = { id: fix.nutritionDataId, updates: {}, fixes: [] }
      map.set(fix.nutritionDataId, entry)
    }
    entry.updates[fix.field] = fix.after
    entry.fixes.push(fix)
  }

  return Array.from(map.values())
}

// ---- CLI entry point ----

if (process.argv[1]?.endsWith('auto-fix.ts') || process.argv[1]?.endsWith('auto-fix.js')) {
  import('./utils.js').then(async ({ createSupabaseClient, rootPath }) => {
    const { readFileSync, writeFileSync, existsSync } = await import('fs')
    const DRY_RUN = process.argv.includes('--dry-run')

    const resultsPath = rootPath('audit', 'accuracy-results.json')
    if (!existsSync(resultsPath)) {
      console.error('audit/accuracy-results.json not found — run accuracy check first')
      process.exit(1)
    }

    const raw = JSON.parse(readFileSync(resultsPath, 'utf-8'))
    const autoFixes: AutoFix[] = raw.autoFixes ?? []

    if (autoFixes.length === 0) {
      console.log('No auto-fixes to apply.')
      writeFileSync(
        rootPath('audit', 'autofix-results.json'),
        JSON.stringify({ applied: 0, fixes: [] }, null, 2) + '\n',
        'utf-8',
      )
      process.exit(0)
    }

    const batch = buildFixBatch(autoFixes)
    console.log(`Found ${autoFixes.length} fixes across ${batch.length} records`)

    if (DRY_RUN) {
      for (const entry of batch) {
        console.log(`  [dry-run] ${entry.id}:`, entry.updates)
      }
      console.log('Dry run complete — no changes applied.')
      process.exit(0)
    }

    const supabase = createSupabaseClient()
    let applied = 0
    let failed = 0
    const appliedFixes: AutoFix[] = []

    for (const entry of batch) {
      const { error } = await supabase
        .from('nutritional_data')
        .update(entry.updates)
        .eq('id', entry.id)

      if (error) {
        console.error(`  FAIL ${entry.id}: ${error.message}`)
        failed++
      } else {
        applied++
        appliedFixes.push(...entry.fixes)
      }
    }

    console.log(`Done: ${applied} applied, ${failed} failed`)

    writeFileSync(
      rootPath('audit', 'autofix-results.json'),
      JSON.stringify({ applied, failed, fixes: appliedFixes }, null, 2) + '\n',
      'utf-8',
    )
  })
}
