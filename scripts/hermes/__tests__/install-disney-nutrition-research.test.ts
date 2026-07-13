import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  installDisneyNutritionResearchSkill,
  installedSkillPath,
  sourceSkillPath,
} from '../install-disney-nutrition-research.js'

describe('Disney nutrition research Hermes skill contract', () => {
  it('uses valid, discoverable frontmatter and remains concise', () => {
    const source = readFileSync(sourceSkillPath(), 'utf8')
    expect(source).toMatch(/^---\r?\nname: disney-nutrition-research\r?\ndescription: Use when /)
    expect(source.split(/\r?\n/).length).toBeLessThan(500)
    expect(source).not.toMatch(/TODO|C:\\Users\\|SUPABASE_SERVICE_ROLE_KEY\s*=/)
  })

  it('closes the unsafe shortcuts a scheduled agent might otherwise take', () => {
    const source = readFileSync(sourceSkillPath(), 'utf8')
    expect(source).toContain('skipped:no_first_party_source')
    expect(source).toMatch(/never.*estimate|do not.*estimate/i)
    expect(source).toMatch(/never.*service.role|service.role.*unavailable/i)
    expect(source).toContain('nutrition-research-review')
    expect(source).toMatch(/no accepted or flagged evidence.*no pull request/is)
    expect(source).toMatch(/release.*lease/is)
    expect(source).toMatch(/commit only.*batch/is)
    expect(source).toMatch(/evidence.*not.*certification/is)
  })

  it('specifies one finding per queue item and bounded research outcomes', () => {
    const source = readFileSync(sourceSkillPath(), 'utf8')
    expect(source).toMatch(/exactly one finding per queue item/i)
    expect(source).toContain('official_research')
    expect(source).toContain('manufacturer_research')
    expect(source).toContain('source_unavailable')
    expect(source).toContain('no_first_party_source')
    expect(source).toMatch(/maximum.*five|at most five/i)
  })

  it('uses PowerShell-compatible environment syntax for the deployed Windows worker', () => {
    const source = readFileSync(sourceSkillPath(), 'utf8')
    expect(source).toContain('$env:HERMES_HOME')
    expect(source).not.toMatch(/(?<!env:)\$HERMES_HOME/)
  })
})

describe('installDisneyNutritionResearchSkill', () => {
  it('installs atomically to the Hermes research skill directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-skill-'))
    const result = installDisneyNutritionResearchSkill({ hermesHome: home })
    const target = installedSkillPath(home)
    expect(result).toMatchObject({ status: 'installed', target })
    expect(readFileSync(target, 'utf8')).toBe(readFileSync(sourceSkillPath(), 'utf8'))
    expect(existsSync(`${target}.tmp`)).toBe(false)
  })

  it('is repeatable and check mode detects no drift without writing', () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-skill-'))
    installDisneyNutritionResearchSkill({ hermesHome: home })
    expect(installDisneyNutritionResearchSkill({ hermesHome: home })).toMatchObject({ status: 'unchanged' })
    expect(installDisneyNutritionResearchSkill({ hermesHome: home, check: true })).toMatchObject({ status: 'current' })
  })

  it('backs up a modified installed skill before replacement', () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-skill-'))
    installDisneyNutritionResearchSkill({ hermesHome: home })
    const target = installedSkillPath(home)
    writeFileSync(target, 'local modification')
    const result = installDisneyNutritionResearchSkill({
      hermesHome: home,
      now: () => '2026-07-12T12:00:00.000Z',
    })
    expect(result.status).toBe('updated')
    expect(result.backup).toBe(`${target}.backup-20260712T120000Z`)
    expect(readFileSync(result.backup!, 'utf8')).toBe('local modification')
    expect(readFileSync(target, 'utf8')).toBe(readFileSync(sourceSkillPath(), 'utf8'))
  })

  it('check mode fails on missing or modified installation and never writes', () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-skill-'))
    expect(() => installDisneyNutritionResearchSkill({ hermesHome: home, check: true })).toThrow(/missing/i)
    installDisneyNutritionResearchSkill({ hermesHome: home })
    const target = installedSkillPath(home)
    writeFileSync(target, 'drift')
    expect(() => installDisneyNutritionResearchSkill({ hermesHome: home, check: true })).toThrow(/drift/i)
    expect(readFileSync(target, 'utf8')).toBe('drift')
  })

  it('derives paths without embedding a machine-specific home', () => {
    const home = resolve('temporary-hermes-home')
    expect(installedSkillPath(home)).toBe(resolve(home, 'skills', 'research', 'disney-nutrition-research', 'SKILL.md'))
  })
})
