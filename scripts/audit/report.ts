import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import { google } from 'googleapis'
import type { AuditPassResult, AutoFix, GraduationState } from './types.js'
import { loadEnv, rootPath } from './utils.js'

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------

interface AutoFixResults {
  applied: number
  failed?: number
  fixes: AutoFix[]
}

interface ReportData {
  accuracy: AuditPassResult | null
  completeness: AuditPassResult | null
  autofix: AutoFixResults | null
  graduation: GraduationState | null
}

function loadJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    console.warn(`Warning: Could not parse ${path}`)
    return null
  }
}

function loadReportData(): ReportData {
  return {
    accuracy: loadJsonFile<AuditPassResult>(rootPath('audit', 'accuracy-results.json')),
    completeness: loadJsonFile<AuditPassResult>(rootPath('audit', 'completeness-results.json')),
    autofix: loadJsonFile<AutoFixResults>(rootPath('audit', 'autofix-results.json')),
    graduation: loadJsonFile<GraduationState>(rootPath('audit', 'graduation-state.json')),
  }
}

// ---------------------------------------------------------------------------
// Markdown Report Builder
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function buildMarkdownReport(data: ReportData): string {
  const date = today()
  const lines: string[] = []

  // Aggregate findings across passes
  const allFindings = [
    ...(data.accuracy?.findings ?? []),
    ...(data.completeness?.findings ?? []),
  ]

  const high = allFindings.filter(f => f.severity === 'HIGH').length
  const medium = allFindings.filter(f => f.severity === 'MEDIUM').length
  const low = allFindings.filter(f => f.severity === 'LOW').length

  // Status banner
  let statusEmoji: string
  let statusText: string
  if (high > 0) {
    statusEmoji = '\u{1F534}'  // red circle
    statusText = 'HIGH FINDINGS'
  } else if (medium > 0) {
    statusEmoji = '\u{1F7E1}'  // yellow circle
    statusText = 'NEEDS ATTENTION'
  } else {
    statusEmoji = '\u{1F7E2}'  // green circle
    statusText = 'CLEAN'
  }

  lines.push(`# Daily Audit Report \u2014 ${date}`)
  lines.push('')
  lines.push(`## Status: ${statusEmoji} ${statusText}`)
  lines.push('')

  // Summary table
  lines.push('| Severity | Count |')
  lines.push('|----------|-------|')
  lines.push(`| HIGH | ${high} |`)
  lines.push(`| MEDIUM | ${medium} |`)
  lines.push(`| LOW | ${low} |`)
  lines.push('')

  // Auto-fixes section
  const fixes = data.autofix?.fixes ?? []
  const fixCount = data.autofix?.applied ?? fixes.length
  lines.push(`### Auto-Fixes Applied (${fixCount})`)
  lines.push('')

  if (fixes.length === 0) {
    lines.push('_No auto-fixes needed._')
  } else {
    const displayLimit = 20
    const shown = fixes.slice(0, displayLimit)
    for (const fix of shown) {
      const before = fix.before === null ? 'null' : String(fix.before)
      lines.push(`- \u2705 **${fix.item}** @ ${fix.restaurant}: ${fix.field} ${before} \u2192 ${fix.after}`)
    }
    if (fixes.length > displayLimit) {
      lines.push(`- _... and ${fixes.length - displayLimit} more_`)
    }
  }
  lines.push('')

  // Findings requiring review (non-autoFixable HIGH + MEDIUM)
  const reviewFindings = allFindings.filter(
    f => !f.autoFixable && (f.severity === 'HIGH' || f.severity === 'MEDIUM'),
  )

  lines.push(`### Findings Requiring Review (${reviewFindings.length})`)
  lines.push('')

  if (reviewFindings.length === 0) {
    lines.push('_No findings require manual review._')
  } else {
    lines.push('| Severity | Item | Restaurant | Park | Issue |')
    lines.push('|----------|------|------------|------|-------|')
    const displayLimit = 50
    const shown = reviewFindings.slice(0, displayLimit)
    for (const f of shown) {
      const item = f.item || '\u2014'
      const restaurant = f.restaurant || '\u2014'
      lines.push(`| ${f.severity} | ${item} | ${restaurant} | ${f.park} | ${f.message} |`)
    }
    if (reviewFindings.length > displayLimit) {
      lines.push('')
      lines.push(`_... and ${reviewFindings.length - displayLimit} more findings_`)
    }
  }
  lines.push('')

  // Completeness section
  const compStats = data.completeness?.stats
  lines.push('### Completeness')
  lines.push('')
  if (compStats) {
    lines.push(`- Parks: ${compStats.parks ?? 0}, Restaurants: ${compStats.restaurants ?? 0}, Items: ${compStats.items ?? 0}`)

    // Sparse park / restaurant findings
    const sparseParks = (data.completeness?.findings ?? []).filter(f => f.checkName === 'sparse_park')
    const sparseRests = (data.completeness?.findings ?? []).filter(f => f.checkName === 'sparse_restaurant')
    const nullCalorie = (data.completeness?.findings ?? []).filter(f => f.checkName === 'null_calorie_coverage')

    if (sparseParks.length === 0 && sparseRests.length === 0 && nullCalorie.length === 0) {
      lines.push('- \u2705 All parks and restaurants meet minimum thresholds')
    } else {
      for (const f of sparseParks) {
        lines.push(`- \u26A0\uFE0F ${f.park}: ${f.message}`)
      }
      for (const f of nullCalorie) {
        lines.push(`- \u26A0\uFE0F ${f.park}: ${f.message}`)
      }
      if (sparseRests.length > 0) {
        lines.push(`- \u26A0\uFE0F ${sparseRests.length} restaurant(s) below minimum item count`)
      }
    }
  } else {
    lines.push('- _Completeness data not available_')
  }
  lines.push('')

  // Graduation progress
  lines.push('### Graduation Progress')
  lines.push('')
  const grad = data.graduation
  if (grad) {
    if (grad.mode === 'weekly') {
      lines.push('\u2705 Weekly mode \u2014 stable')
    } else {
      const threshold = grad.graduationThreshold ?? 14
      if (grad.consecutiveCleanDays >= threshold) {
        lines.push(`\u2705 Ready to graduate! ${grad.consecutiveCleanDays} consecutive clean days.`)
      } else if (grad.consecutiveCleanDays === 0 && high + medium + fixCount > 0) {
        lines.push(`\u26A0\uFE0F Counter reset today (auto-fixes or findings detected)`)
      } else {
        lines.push(`\u{1F4C5} Day ${grad.consecutiveCleanDays} of ${threshold} (need ${threshold} consecutive clean days)`)
      }
    }
  } else {
    lines.push('- _Graduation data not available_')
  }
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Markdown -> HTML (simple conversion for email)
// ---------------------------------------------------------------------------

export function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const htmlLines: string[] = []
  let inTable = false
  let inList = false

  for (const line of lines) {
    // Close open list if line doesn't start with -
    if (inList && !line.startsWith('- ') && !line.startsWith('_...')) {
      htmlLines.push('</ul>')
      inList = false
    }

    // Close table if we leave it
    if (inTable && !line.startsWith('|') && line.trim() !== '') {
      htmlLines.push('</tbody></table>')
      inTable = false
    }

    // Headers
    if (line.startsWith('### ')) {
      htmlLines.push(`<h3 style="margin:16px 0 8px;color:#334155;">${inlineFormat(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      htmlLines.push(`<h2 style="margin:20px 0 10px;color:#0f172a;">${inlineFormat(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      htmlLines.push(`<h1 style="margin:0 0 16px;color:#0f172a;">${inlineFormat(line.slice(2))}</h1>`)
      continue
    }

    // Table rows
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim())

      // Skip separator rows (|---|---|)
      if (cells.every(c => /^-+$/.test(c))) {
        continue
      }

      if (!inTable) {
        htmlLines.push('<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;">')
        htmlLines.push('<thead><tr>')
        for (const cell of cells) {
          htmlLines.push(`<th style="border:1px solid #e2e8f0;padding:6px 10px;background:#f8fafc;text-align:left;">${inlineFormat(cell)}</th>`)
        }
        htmlLines.push('</tr></thead><tbody>')
        inTable = true
        continue
      }

      htmlLines.push('<tr>')
      for (const cell of cells) {
        htmlLines.push(`<td style="border:1px solid #e2e8f0;padding:6px 10px;">${inlineFormat(cell)}</td>`)
      }
      htmlLines.push('</tr>')
      continue
    }

    // List items
    if (line.startsWith('- ')) {
      if (!inList) {
        htmlLines.push('<ul style="margin:4px 0;padding-left:20px;">')
        inList = true
      }
      htmlLines.push(`<li style="margin:2px 0;">${inlineFormat(line.slice(2))}</li>`)
      continue
    }

    // Italic continuation line (e.g., "... and N more")
    if (line.startsWith('_...') || line.startsWith('_No ')) {
      if (inList) {
        htmlLines.push(`<li style="margin:2px 0;font-style:italic;">${inlineFormat(line)}</li>`)
      } else {
        htmlLines.push(`<p style="margin:4px 0;font-style:italic;">${inlineFormat(line)}</p>`)
      }
      continue
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) {
        htmlLines.push('</ul>')
        inList = false
      }
      continue
    }

    // Plain text
    htmlLines.push(`<p style="margin:4px 0;">${inlineFormat(line)}</p>`)
  }

  // Close any open tags
  if (inList) htmlLines.push('</ul>')
  if (inTable) htmlLines.push('</tbody></table>')

  const body = htmlLines.join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#1e293b;line-height:1.5;">
${body}
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0;">
<p style="font-size:12px;color:#94a3b8;">Generated by DiabetesGuide audit pipeline</p>
</body>
</html>`
}

function inlineFormat(text: string): string {
  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic: _text_
  text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
  // Arrow
  text = text.replace(/\u2192/g, '&rarr;')
  return text
}

// ---------------------------------------------------------------------------
// GitHub Issue Posting
// ---------------------------------------------------------------------------

export function postToGitHub(markdown: string, opts: { repo: string }): void {
  const date = today()
  const title = `Daily Audit Report \u2014 ${date}`

  // Write markdown to temp file to avoid shell escaping issues
  const tmpFile = rootPath('audit', '.tmp-report-body.md')
  writeFileSync(tmpFile, markdown, 'utf-8')

  try {
    // Check for existing open audit issue
    const listResult = execSync(
      `gh issue list --repo ${opts.repo} --label audit --state open --json number --limit 1`,
      { encoding: 'utf-8', timeout: 30000 },
    ).trim()

    let issues: Array<{ number: number }> = []
    try {
      issues = JSON.parse(listResult)
    } catch {
      // empty or malformed — treat as no existing issue
    }

    if (issues.length > 0) {
      const issueNumber = issues[0].number
      execSync(
        `gh issue comment ${issueNumber} --repo ${opts.repo} --body-file "${tmpFile}"`,
        { encoding: 'utf-8', timeout: 30000 },
      )
      console.log(`GitHub: Added comment to issue #${issueNumber}`)
    } else {
      const createResult = execSync(
        `gh issue create --repo ${opts.repo} --title "${title}" --body-file "${tmpFile}" --label audit`,
        { encoding: 'utf-8', timeout: 30000 },
      ).trim()
      console.log(`GitHub: Created issue ${createResult}`)
    }
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tmpFile)
    } catch {
      // ignore cleanup failures
    }
  }
}

// ---------------------------------------------------------------------------
// Email Sending
// ---------------------------------------------------------------------------

export async function sendEmailDigest(
  html: string,
  opts: { to: string; clientId: string; clientSecret: string; refreshToken: string },
): Promise<void> {
  const date = today()
  const subject = `DiabetesGuide Audit \u2014 ${date}`

  const oauth2Client = new google.auth.OAuth2(opts.clientId, opts.clientSecret)
  oauth2Client.setCredentials({ refresh_token: opts.refreshToken })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const messageParts = [
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ]
  const raw = Buffer.from(messageParts.join('\r\n')).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  console.log(`Email: Sent digest to ${opts.to}`)
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const skipGitHub = args.includes('--skip-github')
  const skipEmail = args.includes('--skip-email')

  console.log('Building audit report...')

  // 1. Load result files
  const data = loadReportData()

  if (!data.accuracy && !data.completeness) {
    console.error('No audit result files found in audit/. Run accuracy and completeness checks first.')
    process.exit(1)
  }

  // 2. Build markdown report
  const markdown = buildMarkdownReport(data)

  // 3. Save to audit/daily/YYYY-MM-DD.md
  const dailyDir = rootPath('audit', 'daily')
  if (!existsSync(dailyDir)) {
    mkdirSync(dailyDir, { recursive: true })
  }
  const reportPath = rootPath('audit', 'daily', `${today()}.md`)
  writeFileSync(reportPath, markdown, 'utf-8')
  console.log(`Report saved to ${reportPath}`)

  // 4. Post to GitHub Issue
  if (!skipGitHub) {
    try {
      postToGitHub(markdown, { repo: 'beilerman/DiabetesGuide' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`GitHub posting failed (continuing): ${msg}`)
    }
  } else {
    console.log('GitHub: Skipped (--skip-github)')
  }

  // 5. Send email digest
  if (!skipEmail) {
    const env = loadEnv()
    const clientId = process.env.GMAIL_CLIENT_ID || env['GMAIL_CLIENT_ID']
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || env['GMAIL_CLIENT_SECRET']
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || env['GMAIL_REFRESH_TOKEN']

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn('Email: Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN — skipping email')
    } else {
      try {
        const html = markdownToHtml(markdown)
        await sendEmailDigest(html, {
          to: 'medpeds@gmail.com',
          clientId,
          clientSecret,
          refreshToken,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Email sending failed (continuing): ${msg}`)
      }
    }
  } else {
    console.log('Email: Skipped (--skip-email)')
  }

  console.log('Done.')
}

// Run when executed directly
const entryFile = process.argv[1]?.replace(/\\/g, '/').split('/').pop() ?? ''
if (entryFile === 'report.ts' || entryFile === 'report.js') {
  main().catch(err => {
    console.error('Report failed:', err)
    process.exit(1)
  })
}
