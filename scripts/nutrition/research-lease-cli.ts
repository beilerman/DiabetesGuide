import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { acquireResearchLease, releaseResearchLease } from './research-lease.js'

function option(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

export function runResearchLeaseCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  writeStdout: (value: string) => void = value => process.stdout.write(value),
): unknown {
  const command = args[0]
  const home = option(args, '--home') ?? env.HERMES_HOME
  if (!home) throw new Error('Provide --home or set HERMES_HOME')
  let result: unknown
  if (command === 'acquire') {
    result = acquireResearchLease({
      home,
      forceExpired: args.includes('--force-expired'),
    })
  } else if (command === 'release') {
    const token = option(args, '--token')
    if (!token) throw new Error('release requires --token')
    result = releaseResearchLease({ home, token })
  } else {
    throw new Error('Usage: research-lease <acquire|release> [--home=<path>]')
  }
  writeStdout(`${JSON.stringify(result)}\n`)
  return result
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    runResearchLeaseCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
