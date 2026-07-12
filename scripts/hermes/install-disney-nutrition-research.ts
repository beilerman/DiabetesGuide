import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface SkillInstallOptions {
  hermesHome: string
  check?: boolean
  now?: () => string
}

export interface SkillInstallResult {
  status: 'installed' | 'updated' | 'unchanged' | 'current'
  target: string
  backup?: string
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..', '..')

export function sourceSkillPath(): string {
  return resolve(repositoryRoot, 'ops', 'hermes-skills', 'disney-nutrition-research', 'SKILL.md')
}

export function installedSkillPath(hermesHome: string): string {
  return resolve(hermesHome, 'skills', 'research', 'disney-nutrition-research', 'SKILL.md')
}

function compactTimestamp(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Installer clock returned an invalid date')
  return date.toISOString().replace(/[-:]/g, '').replace('.000', '')
}

function installAtomically(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  copyFileSync(source, temporary)
  renameSync(temporary, target)
}

export function installDisneyNutritionResearchSkill(options: SkillInstallOptions): SkillInstallResult {
  if (!options.hermesHome.trim()) throw new Error('Hermes home is required')
  const source = sourceSkillPath()
  const target = installedSkillPath(options.hermesHome)
  const expected = readFileSync(source, 'utf8')
  if (!existsSync(target)) {
    if (options.check) throw new Error(`Installed skill is missing: ${target}`)
    installAtomically(source, target)
    return { status: 'installed', target }
  }
  const installed = readFileSync(target, 'utf8')
  if (installed === expected) return { status: options.check ? 'current' : 'unchanged', target }
  if (options.check) throw new Error(`Installed skill has drifted from the repository source: ${target}`)

  const backup = `${target}.backup-${compactTimestamp((options.now ?? (() => new Date().toISOString()))())}`
  copyFileSync(target, backup)
  installAtomically(source, target)
  return { status: 'updated', target, backup }
}

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function runSkillInstaller(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  writeStdout: (value: string) => void = value => process.stdout.write(value),
): SkillInstallResult {
  const hermesHome = option(args, '--hermes-home') ?? env.HERMES_HOME
  if (!hermesHome) throw new Error('Provide --hermes-home or set HERMES_HOME')
  const result = installDisneyNutritionResearchSkill({
    hermesHome,
    check: args.includes('--check'),
  })
  writeStdout(`${JSON.stringify(result)}\n`)
  return result
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    runSkillInstaller(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
