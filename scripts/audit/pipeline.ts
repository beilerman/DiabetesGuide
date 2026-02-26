import { createSupabaseClient, fetchAllItems, rootPath } from './utils.js'
import { checkAccuracy } from './accuracy.js'
import { checkCompleteness } from './completeness.js'
import { buildFixBatch } from './auto-fix.js'
import { writeFileSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_EMAIL = process.argv.includes('--skip-email')
const SKIP_GITHUB = process.argv.includes('--skip-github')
const SKIP_REPORT = process.argv.includes('--skip-report')

async function main() {
  const t0 = Date.now()

  // Ensure output directory exists
  mkdirSync(rootPath('audit', 'daily'), { recursive: true })

  // -----------------------------------------------------------------------
  // [1/5] Fetch data
  // -----------------------------------------------------------------------
  console.log('[1/5] Fetching data...')
  const supabase = createSupabaseClient()
  const items = await fetchAllItems(supabase)
  console.log(`  ${items.length} items loaded`)

  // -----------------------------------------------------------------------
  // [2/5] Accuracy checks
  // -----------------------------------------------------------------------
  console.log('\n[2/5] Accuracy checks...')
  const accuracy = checkAccuracy(items)

  const accHigh = accuracy.findings.filter(f => f.severity === 'HIGH').length
  const accMed = accuracy.findings.filter(f => f.severity === 'MEDIUM').length
  console.log(`  Findings: ${accuracy.findings.length} (HIGH: ${accHigh}, MEDIUM: ${accMed})`)
  console.log(`  Auto-fixable: ${accuracy.autoFixes.length}`)

  writeFileSync(
    rootPath('audit', 'accuracy-results.json'),
    JSON.stringify(accuracy, null, 2) + '\n',
    'utf-8',
  )

  // -----------------------------------------------------------------------
  // [3/5] Auto-fix
  // -----------------------------------------------------------------------
  console.log('\n[3/5] Auto-fix...')

  if (accuracy.autoFixes.length === 0) {
    console.log('  No auto-fixes needed')
    writeFileSync(
      rootPath('audit', 'autofix-results.json'),
      JSON.stringify({ applied: 0, failed: 0, fixes: [] }, null, 2) + '\n',
      'utf-8',
    )
  } else if (DRY_RUN) {
    const batch = buildFixBatch(accuracy.autoFixes)
    console.log(`  [dry-run] Would apply ${accuracy.autoFixes.length} fixes across ${batch.length} records`)
    for (const entry of batch) {
      console.log(`    ${entry.id}:`, entry.updates)
    }
    writeFileSync(
      rootPath('audit', 'autofix-results.json'),
      JSON.stringify({ applied: 0, failed: 0, fixes: [] }, null, 2) + '\n',
      'utf-8',
    )
  } else {
    const batch = buildFixBatch(accuracy.autoFixes)
    let applied = 0
    let failed = 0
    const appliedFixes = []

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

    console.log(`  Applied: ${applied}, Failed: ${failed}`)
    writeFileSync(
      rootPath('audit', 'autofix-results.json'),
      JSON.stringify({ applied, failed, fixes: appliedFixes }, null, 2) + '\n',
      'utf-8',
    )
  }

  // -----------------------------------------------------------------------
  // [4/5] Completeness checks
  // -----------------------------------------------------------------------
  console.log('\n[4/5] Completeness checks...')
  const completeness = checkCompleteness(items)

  const compHigh = completeness.findings.filter(f => f.severity === 'HIGH').length
  const compMed = completeness.findings.filter(f => f.severity === 'MEDIUM').length
  console.log(`  Findings: ${completeness.findings.length} (HIGH: ${compHigh}, MEDIUM: ${compMed})`)

  writeFileSync(
    rootPath('audit', 'completeness-results.json'),
    JSON.stringify(completeness, null, 2) + '\n',
    'utf-8',
  )

  // -----------------------------------------------------------------------
  // [5/5] Reporting (graduation + report as child processes)
  // -----------------------------------------------------------------------
  if (!SKIP_REPORT) {
    console.log('\n[5/5] Reporting...')

    // Graduation
    try {
      execSync('npx tsx scripts/audit/graduation.ts', {
        stdio: 'inherit',
        cwd: rootPath(),
      })
    } catch {
      console.error('  Graduation step failed (continuing)')
    }

    // Report — pass through flags
    const reportFlags: string[] = []
    if (SKIP_EMAIL) reportFlags.push('--skip-email')
    if (SKIP_GITHUB) reportFlags.push('--skip-github')

    try {
      execSync(`npx tsx scripts/audit/report.ts ${reportFlags.join(' ')}`, {
        stdio: 'inherit',
        cwd: rootPath(),
      })
    } catch {
      console.error('  Report step failed (continuing)')
    }
  } else {
    console.log('\n[5/5] Reporting... skipped (--skip-report)')
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  const totalHigh = accHigh + compHigh

  console.log(`\nPipeline complete in ${elapsed}s`)

  if (totalHigh > 0) {
    console.log(`EXIT 1 — ${totalHigh} HIGH finding(s) detected`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Pipeline failed:', err)
  process.exit(1)
})
