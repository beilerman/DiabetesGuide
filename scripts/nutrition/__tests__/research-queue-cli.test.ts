import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runResearchQueueCli } from '../research-queue-cli.js'
import type { ResearchCatalogItem } from '../research-queue.js'

function catalogItem(id: string): ResearchCatalogItem {
  return {
    menuItemId: id,
    itemName: `Item ${id}`,
    description: null,
    category: 'entree',
    restaurantName: 'Restaurant',
    parkName: 'Magic Kingdom',
    parkLocation: 'Walt Disney World Resort',
    servingQuantity: null,
    servingUnit: null,
    servingDescription: null,
    nutritionDataId: null,
    currentCarbs: null,
    confidence: null,
    activeCertificationId: null,
  }
}

describe('runResearchQueueCli', () => {
  it('writes a deterministic queue under HERMES_HOME and honors pending/evidenced IDs', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-research-'))
    const runDir = join(home, 'nutrition-research', 'runs', 'test')
    mkdirSync(runDir, { recursive: true })
    const pendingFile = join(runDir, 'pending.json')
    const outputFile = join(runDir, 'queue.json')
    writeFileSync(pendingFile, JSON.stringify(['pending']))
    const output: string[] = []

    const result = await runResearchQueueCli([
      '--scope=wdw',
      '--limit=5',
      `--pending-file=${pendingFile}`,
      `--out=${outputFile}`,
    ], {
      env: { HERMES_HOME: home },
      now: () => '2026-07-12T12:00:00.000Z',
      loadCatalog: async () => [catalogItem('accepted'), catalogItem('pending'), catalogItem('evidenced')],
      loadEvidencedMenuItemIds: async () => new Set(['evidenced']),
      writeStdout: value => output.push(value),
    })

    expect(result).toMatchObject({ itemCount: 1, empty: false, out: resolve(outputFile) })
    const queue = JSON.parse(readFileSync(outputFile, 'utf8')) as { items: Array<{ menuItemId: string }> }
    expect(queue.items.map(item => item.menuItemId)).toEqual(['accepted'])
    expect(readFileSync(outputFile, 'utf8').endsWith('\n')).toBe(true)
    expect(output).toHaveLength(1)
    expect(JSON.parse(output[0])).toMatchObject({ itemCount: 1, empty: false })
  })

  it('uses WDW, five items, and an empty pending set by default', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-research-'))
    const outputFile = join(home, 'queue.json')
    const result = await runResearchQueueCli([`--out=${outputFile}`], {
      env: { HERMES_HOME: home },
      now: () => '2026-07-12T12:00:00.000Z',
      loadCatalog: async () => Array.from({ length: 7 }, (_, index) => catalogItem(`item-${index}`)),
      loadEvidencedMenuItemIds: async () => new Set(),
      writeStdout: () => undefined,
    })
    expect(result.itemCount).toBe(5)
    expect(JSON.parse(readFileSync(outputFile, 'utf8'))).toMatchObject({ scope: 'wdw' })
  })

  it('returns a successful empty queue', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-research-'))
    const outputFile = join(home, 'queue.json')
    const result = await runResearchQueueCli([`--out=${outputFile}`], {
      env: { HERMES_HOME: home },
      now: () => '2026-07-12T12:00:00.000Z',
      loadCatalog: async () => [],
      loadEvidencedMenuItemIds: async () => new Set(),
      writeStdout: () => undefined,
    })
    expect(result).toMatchObject({ itemCount: 0, empty: true })
  })

  it('rejects oversized batches and output outside HERMES_HOME', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-research-'))
    const dependencies = {
      env: { HERMES_HOME: home },
      now: () => '2026-07-12T12:00:00.000Z',
      loadCatalog: async () => [],
      loadEvidencedMenuItemIds: async () => new Set<string>(),
      writeStdout: () => undefined,
    }
    await expect(runResearchQueueCli([
      '--limit=6',
      `--out=${join(home, 'queue.json')}`,
    ], dependencies)).rejects.toThrow(/limit/i)
    await expect(runResearchQueueCli([
      `--out=${join(tmpdir(), 'outside-queue.json')}`,
    ], dependencies)).rejects.toThrow(/HERMES_HOME/i)
  })
})
