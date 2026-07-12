import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stableResearchJson, type ResearchScope } from './research-contract.js'
import { buildResearchQueue, MAX_RESEARCH_BATCH_SIZE, type ResearchCatalogItem } from './research-queue.js'
import {
  createResearchSupabaseClient,
  fetchEvidencedMenuItemIds,
  fetchResearchCatalog,
} from './research-supabase.js'

export interface ResearchQueueCliDependencies {
  env?: NodeJS.ProcessEnv
  now?: () => string
  loadCatalog?: () => Promise<ResearchCatalogItem[]>
  loadEvidencedMenuItemIds?: () => Promise<Set<string>>
  writeStdout?: (value: string) => void
}

export interface ResearchQueueCliResult {
  batchId: string
  itemCount: number
  empty: boolean
  out: string
}

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

function parseScope(value: string | undefined): ResearchScope {
  if (value == null) return 'wdw'
  if (value === 'wdw' || value === 'all-disney') return value
  throw new Error('--scope must be wdw or all-disney')
}

function parseLimit(value: string | undefined): number {
  if (value == null) return MAX_RESEARCH_BATCH_SIZE
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_RESEARCH_BATCH_SIZE) {
    throw new Error(`--limit must be an integer from 0 to ${MAX_RESEARCH_BATCH_SIZE}`)
  }
  return limit
}

function pathIsWithin(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function readPendingIds(path: string | undefined): Set<string> {
  if (path == null) return new Set()
  if (!existsSync(path)) throw new Error(`Pending item file does not exist: ${path}`)
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string' || item.trim() === '')) {
    throw new Error('Pending item file must be a JSON array of non-empty menu item IDs')
  }
  return new Set(parsed)
}

function atomicWrite(path: string, contents: string): void {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, path)
}

export async function runResearchQueueCli(
  args: string[],
  dependencies: ResearchQueueCliDependencies = {},
): Promise<ResearchQueueCliResult> {
  const env = dependencies.env ?? process.env
  const scope = parseScope(option(args, '--scope'))
  const limit = parseLimit(option(args, '--limit'))
  const outputOption = option(args, '--out')
  if (!outputOption || !isAbsolute(outputOption)) throw new Error('--out must be an absolute path')
  const out = resolve(outputOption)
  const hermesHome = env.HERMES_HOME ? resolve(env.HERMES_HOME) : null
  const allowTestOutput = args.includes('--allow-test-output')
  if (!allowTestOutput && (!hermesHome || !pathIsWithin(hermesHome, out))) {
    throw new Error('--out must be inside HERMES_HOME')
  }

  let client: ReturnType<typeof createResearchSupabaseClient> | undefined
  const getClient = () => {
    client ??= createResearchSupabaseClient()
    return client
  }
  const loadCatalog = dependencies.loadCatalog ?? (() => fetchResearchCatalog(getClient()))
  const loadEvidence = dependencies.loadEvidencedMenuItemIds
    ?? (() => fetchEvidencedMenuItemIds(getClient()))
  const [catalog, evidencedMenuItemIds] = await Promise.all([loadCatalog(), loadEvidence()])
  const queue = buildResearchQueue(catalog, {
    scope,
    limit,
    pendingMenuItemIds: readPendingIds(option(args, '--pending-file')),
    evidencedMenuItemIds,
    now: (dependencies.now ?? (() => new Date().toISOString()))(),
  })
  atomicWrite(out, stableResearchJson(queue))
  const result: ResearchQueueCliResult = {
    batchId: queue.batchId,
    itemCount: queue.items.length,
    empty: queue.items.length === 0,
    out,
  }
  ;(dependencies.writeStdout ?? (value => process.stdout.write(value)))(`${JSON.stringify(result)}\n`)
  return result
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runResearchQueueCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
