import * as core from '@actions/core'
import type { OutputPort } from '../domains/outputPort.js'

const OUTPUT_CONFLICTS = 'conflicts'
const OUTPUT_CONFLICTED_FILES = 'conflicted-files'

/**
 * GitHub Actions output adapter
 */
export const createActionOutputAdapter = (): OutputPort => ({
  setConflictsFound: (found: boolean): void => {
    core.setOutput(OUTPUT_CONFLICTS, found.toString())
  },
  setConflictedFiles: (files: string[]): void => {
    core.setOutput(OUTPUT_CONFLICTED_FILES, files.join(','))
  },
  reportFailure: (message: string): void => {
    core.setFailed(message)
  }
})
