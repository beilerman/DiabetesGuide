import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  provisionDisneyNutritionResearch,
  type CommandResult,
  type HermesCommandRunner,
} from '../provision-disney-nutrition-research.js'

interface RecordedCall {
  command: string
  args: string[]
}

function runner(listOutputs: string[]): { runner: HermesCommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  let listIndex = 0
  return {
    calls,
    runner: (command, args): CommandResult => {
      calls.push({ command, args: [...args] })
      if (args.join(' ') === 'cron create --help') {
        return {
          status: 0,
          stdout: 'cron create --name --deliver --skill --workdir schedule prompt',
          stderr: '',
        }
      }
      if (args.join(' ') === 'cron list --all') {
        return { status: 0, stdout: listOutputs[Math.min(listIndex++, listOutputs.length - 1)] ?? '', stderr: '' }
      }
      return { status: 0, stdout: 'ok', stderr: '' }
    },
  }
}

const repository = resolve('C:/work/DiabetesGuide')
const slackTarget = 'slack:D0123456789'

describe('Disney nutrition research job template', () => {
  it('pins the six-hour WDW five-item configuration', () => {
    const template = JSON.parse(readFileSync('ops/hermes/disney-nutrition-research-job.json', 'utf8'))
    expect(template).toEqual({
      schemaVersion: 1,
      name: 'disney-nutrition-research',
      intervalMinutes: 360,
      maxItems: 5,
      maxConcurrentRuns: 1,
      scope: 'wdw',
      skill: 'disney-nutrition-research',
    })
  })
})

describe('provisionDisneyNutritionResearch', () => {
  it('discovers supported syntax and creates one scheduled Slack-delivered job', () => {
    const fake = runner(['No scheduled jobs.'])
    const result = provisionDisneyNutritionResearch({
      repository,
      slackTarget,
      hermesCommand: 'hermes-test',
      runner: fake.runner,
    })
    expect(result).toMatchObject({ action: 'created', name: 'disney-nutrition-research' })
    expect(fake.calls.map(call => call.args.join(' '))).toEqual([
      'cron create --help',
      'cron list --all',
      expect.stringMatching(/^cron create every 360m /),
    ])
    const create = fake.calls[2]
    expect(create.args).toEqual(expect.arrayContaining([
      '--name', 'disney-nutrition-research',
      '--deliver', slackTarget,
      '--skill', 'disney-nutrition-research',
      '--workdir', repository,
    ]))
    expect(create.args.join(' ')).toMatch(/Use the disney-nutrition-research skill/)
  })

  it('updates the exact named job rather than creating a duplicate', () => {
    const fake = runner([`
  abc123 [active]
    Name:      disney-nutrition-research
    Schedule:  every 360m
    Deliver:   ${slackTarget}
`])
    const result = provisionDisneyNutritionResearch({
      repository,
      slackTarget,
      hermesCommand: 'hermes-test',
      runner: fake.runner,
    })
    expect(result).toMatchObject({ action: 'updated', jobId: 'abc123' })
    expect(fake.calls[2].args.slice(0, 3)).toEqual(['cron', 'edit', 'abc123'])
    expect(fake.calls.flatMap(call => call.args).filter(arg => arg === 'create')).toHaveLength(1)
  })

  it('prints a dry-run plan without create or edit mutation', () => {
    const fake = runner(['No scheduled jobs.'])
    const result = provisionDisneyNutritionResearch({
      repository,
      slackTarget,
      hermesCommand: 'hermes-test',
      runner: fake.runner,
      dryRun: true,
    })
    expect(result.action).toBe('would-create')
    expect(fake.calls).toHaveLength(2)
  })

  it('requires an explicit Slack delivery target and absolute repository', () => {
    const fake = runner([''])
    expect(() => provisionDisneyNutritionResearch({
      repository,
      slackTarget: '',
      runner: fake.runner,
    })).toThrow(/Slack/i)
    expect(() => provisionDisneyNutritionResearch({
      repository: 'relative/path',
      slackTarget,
      runner: fake.runner,
    })).toThrow(/absolute/i)
  })

  it('does not place database keys or Slack tokens in commands or output', () => {
    const fake = runner(['No scheduled jobs.'])
    const result = provisionDisneyNutritionResearch({
      repository,
      slackTarget,
      hermesCommand: 'hermes-test',
      runner: fake.runner,
    })
    const serialized = JSON.stringify({ result, calls: fake.calls })
    expect(serialized).not.toMatch(/SUPABASE_|SERVICE_ROLE|xox[baprs]-/i)
  })
})
