import { readFileSync, existsSync } from 'fs'
import type { GraduationState, AuditPassResult } from './types.js'
import { THRESHOLDS } from './thresholds.js'
import { loadGraduationState, saveGraduationState, rootPath } from './utils.js'

/**
 * Pure function that computes the next graduation state.
 *
 * A day is "clean" if:
 *   - findings.high === 0
 *   - findings.medium === 0
 *   - autoFixCount === 0
 *
 * Clean day: increment consecutiveCleanDays; if >= threshold -> mode = 'weekly'
 * Dirty day: reset consecutiveCleanDays to 0; if weekly + HIGH or MEDIUM -> mode = 'daily'
 */
export function updateGraduation(
  state: GraduationState,
  findings: { high: number; medium: number; low: number },
  autoFixCount: number,
): GraduationState {
  const today = new Date().toISOString().slice(0, 10)
  const isClean = findings.high === 0 && findings.medium === 0 && autoFixCount === 0

  let { mode, consecutiveCleanDays } = state

  if (isClean) {
    consecutiveCleanDays += 1
    if (consecutiveCleanDays >= THRESHOLDS.GRADUATION_THRESHOLD) {
      mode = 'weekly'
    }
  } else {
    consecutiveCleanDays = 0
    if (mode === 'weekly' && (findings.high > 0 || findings.medium > 0)) {
      mode = 'daily'
    }
  }

  const historyEntry = {
    date: today,
    high: findings.high,
    medium: findings.medium,
    low: findings.low,
    autoFixes: autoFixCount,
  }

  const newHistory = [...state.history, historyEntry].slice(-30)

  return {
    mode,
    consecutiveCleanDays,
    lastAudit: today,
    autoFixesApplied: autoFixCount,
    graduationThreshold: state.graduationThreshold,
    history: newHistory,
  }
}

// ---- CLI entry point ----

if (process.argv[1]?.endsWith('graduation.ts') || process.argv[1]?.endsWith('graduation.js')) {
  const accuracyPath = rootPath('audit', 'accuracy-results.json')
  const completenessPath = rootPath('audit', 'completeness-results.json')
  const autofixPath = rootPath('audit', 'autofix-results.json')

  // Tally findings from accuracy + completeness results
  const findings = { high: 0, medium: 0, low: 0 }

  if (existsSync(accuracyPath)) {
    const acc: AuditPassResult = JSON.parse(readFileSync(accuracyPath, 'utf-8'))
    for (const f of acc.findings) {
      if (f.severity === 'HIGH') findings.high++
      else if (f.severity === 'MEDIUM') findings.medium++
      else findings.low++
    }
  }

  if (existsSync(completenessPath)) {
    const comp: AuditPassResult = JSON.parse(readFileSync(completenessPath, 'utf-8'))
    for (const f of comp.findings) {
      if (f.severity === 'HIGH') findings.high++
      else if (f.severity === 'MEDIUM') findings.medium++
      else findings.low++
    }
  }

  // Read auto-fix count
  let autoFixCount = 0
  if (existsSync(autofixPath)) {
    const af: { applied: number; failed: number } = JSON.parse(readFileSync(autofixPath, 'utf-8'))
    autoFixCount = af.applied
  }

  // Update state
  const current = loadGraduationState()
  const next = updateGraduation(current, findings, autoFixCount)
  saveGraduationState(next)

  // Report
  console.log('\n--- Graduation Status ---')
  console.log(`Mode:             ${next.mode}`)
  console.log(`Clean days:       ${next.consecutiveCleanDays} / ${next.graduationThreshold}`)
  console.log(`Findings today:   HIGH=${findings.high} MEDIUM=${findings.medium} LOW=${findings.low}`)
  console.log(`Auto-fixes today: ${autoFixCount}`)

  if (next.mode === 'weekly') {
    console.log('Status: GRADUATED -- running weekly')
  } else {
    const remaining = next.graduationThreshold - next.consecutiveCleanDays
    console.log(`Status: ${remaining} clean day(s) until graduation`)
  }
}
