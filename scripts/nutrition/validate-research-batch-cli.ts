import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  runValidateResearchBatchCli,
  type ResearchBatchValidationDependencies,
} from './validate-research-batch.js'

export function runValidateResearchBatchCliMain(
  args: string[],
  dependencies: ResearchBatchValidationDependencies & { writeStdout?: (value: string) => void } = {},
) {
  return runValidateResearchBatchCli(args, dependencies)
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runValidateResearchBatchCliMain(process.argv.slice(2)).then(
    result => { process.exitCode = result.exitCode },
    error => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
