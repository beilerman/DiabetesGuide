import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runApplyResearchBatchCli } from './apply-research-batch.js'

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runApplyResearchBatchCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
