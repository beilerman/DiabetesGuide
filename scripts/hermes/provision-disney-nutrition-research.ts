import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

interface JobTemplate {
  schemaVersion: 1
  name: string
  intervalMinutes: number
  maxItems: number
  maxConcurrentRuns: number
  scope: 'wdw'
  skill: string
}

export interface CommandResult {
  status: number
  stdout: string
  stderr: string
}

export type HermesCommandRunner = (command: string, args: string[]) => CommandResult

export interface ProvisionOptions {
  repository: string
  slackTarget: string
  hermesCommand?: string
  runner?: HermesCommandRunner
  dryRun?: boolean
}

export interface ProvisionResult {
  action: 'created' | 'updated' | 'would-create' | 'would-update'
  name: string
  jobId: string | null
  schedule: string
  delivery: string
  skill: string
  repository: string
}

const JOB_PROMPT = 'Use the disney-nutrition-research skill to run one scheduled DiabetesGuide nutrition batch. Follow the skill completely and return only its Slack-ready final summary.'

function templatePath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'ops',
    'hermes',
    'disney-nutrition-research-job.json',
  )
}

function loadTemplate(): JobTemplate {
  const value = JSON.parse(readFileSync(templatePath(), 'utf8')) as JobTemplate
  if (
    value.schemaVersion !== 1
    || value.name !== 'disney-nutrition-research'
    || value.intervalMinutes !== 360
    || value.maxItems !== 5
    || value.maxConcurrentRuns !== 1
    || value.scope !== 'wdw'
    || value.skill !== 'disney-nutrition-research'
  ) throw new Error('Disney nutrition research job template is invalid')
  return value
}

function defaultRunner(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    env: process.env,
  })
  if (result.error) throw result.error
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function runChecked(runner: HermesCommandRunner, command: string, args: string[]): CommandResult {
  const result = runner(command, args)
  if (result.status !== 0) {
    throw new Error(`Hermes command failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`}`)
  }
  return result
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '')
}

function findNamedJobIds(output: string, name: string): string[] {
  const lines = stripAnsi(output).split(/\r?\n/)
  const matches: string[] = []
  let currentId: string | null = null
  for (const line of lines) {
    const header = line.match(/^\s*([a-z0-9-]+)\s+\[[^\]]+\]\s*$/i)
    if (header) {
      currentId = header[1]
      continue
    }
    const jobName = line.match(/^\s*Name:\s*(.+?)\s*$/)
    if (jobName?.[1] === name && currentId) matches.push(currentId)
  }
  return matches
}

function requireSupportedCreateSyntax(help: string): void {
  for (const flag of ['--name', '--deliver', '--skill', '--workdir']) {
    if (!help.includes(flag)) throw new Error(`Installed Hermes cron create does not support ${flag}`)
  }
}

export function provisionDisneyNutritionResearch(options: ProvisionOptions): ProvisionResult {
  if (!isAbsolute(options.repository)) throw new Error('Repository path must be absolute')
  if (!/^slack:[A-Za-z0-9]+$/.test(options.slackTarget)) {
    throw new Error('Provide an explicit configured Slack delivery target such as slack:<channel-id>')
  }
  const template = loadTemplate()
  const runner = options.runner ?? defaultRunner
  const command = options.hermesCommand ?? 'hermes'
  const help = runChecked(runner, command, ['cron', 'create', '--help'])
  requireSupportedCreateSyntax(`${help.stdout}\n${help.stderr}`)
  const list = runChecked(runner, command, ['cron', 'list', '--all'])
  const matches = findNamedJobIds(list.stdout, template.name)
  if (matches.length > 1) throw new Error(`Multiple Hermes jobs are named ${template.name}; remove duplicates before provisioning`)

  const schedule = `every ${template.intervalMinutes}m`
  const common = [
    '--name', template.name,
    '--deliver', options.slackTarget,
    '--skill', template.skill,
    '--workdir', options.repository,
  ]
  const existingId = matches[0] ?? null
  const args = existingId
    ? ['cron', 'edit', existingId, '--schedule', schedule, '--prompt', JOB_PROMPT, ...common]
    : ['cron', 'create', schedule, JOB_PROMPT, ...common]
  const action = existingId
    ? options.dryRun ? 'would-update' : 'updated'
    : options.dryRun ? 'would-create' : 'created'
  if (!options.dryRun) runChecked(runner, command, args)
  return {
    action,
    name: template.name,
    jobId: existingId,
    schedule,
    delivery: options.slackTarget,
    skill: template.skill,
    repository: options.repository,
  }
}

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function runProvisioner(
  args: string[],
  writeStdout: (value: string) => void = value => process.stdout.write(value),
): ProvisionResult {
  const repository = option(args, '--repo')
  const slackTarget = option(args, '--slack-target')
  if (!repository) throw new Error('Missing required option --repo')
  if (!slackTarget) throw new Error('Missing required option --slack-target')
  const result = provisionDisneyNutritionResearch({
    repository,
    slackTarget,
    hermesCommand: option(args, '--hermes-command'),
    dryRun: args.includes('--dry-run'),
  })
  writeStdout(`${JSON.stringify(result)}\n`)
  return result
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    runProvisioner(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
