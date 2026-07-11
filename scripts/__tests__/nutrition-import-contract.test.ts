import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readScript(name: string): string {
  return readFileSync(resolve(process.cwd(), 'scripts', name), 'utf8')
}

describe('curated nutrition import write contracts', () => {
  it.each([
    ['import-ai-nutrition.ts', 'e.id'],
    ['import-researched-nutrition.ts', 'm.id'],
  ])('%s ignores a concurrent insert on the unique menu-item key', (file, itemId) => {
    const source = readScript(file)

    expect(source).toContain(".from('nutritional_data').upsert(")
    expect(source).toContain(`menu_item_id: ${itemId}`)
    expect(source).toContain("onConflict: 'menu_item_id'")
    expect(source).toContain('ignoreDuplicates: true')
  })

  it('prevents the AI importer from racing over a newer confidence score', () => {
    const source = readScript('import-ai-nutrition.ts')

    expect(source).toContain('confidence_score.is.null,confidence_score.lt.${e.confidence}')
    expect(source).toContain('if (!FORCE)')
  })

  it('prevents the researched importer from racing over a newer confidence score', () => {
    const source = readScript('import-researched-nutrition.ts')

    expect(source).toContain('confidence_score.is.null,confidence_score.lt.${entry.confidence}')
  })

  it.each([
    'import-ai-nutrition.ts',
    'import-researched-nutrition.ts',
  ])('%s routes provenance through review-first evidence intake', (file) => {
    const source = readScript(file)

    expect(source).toContain('buildEvidenceCandidate')
    expect(source).toContain('parseEvidenceMode')
    expect(source).toContain(".from('nutrition_sources').upsert(")
    expect(source).toContain("onConflict: 'evidence_key'")
    expect(source).toContain('ignoreDuplicates: true')
    expect(source).not.toContain(".from('nutrition_certifications').insert(")
  })
})
