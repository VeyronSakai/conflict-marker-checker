import * as core from '@actions/core'
import type { PullRequestRepositoryPort } from '../domains/pullRequestRepositoryPort.js'
import type { FileContentRepository } from '../infrastructures/fileContentRepository.js'
import type { OutputPort } from '../domains/outputPort.js'
import type { File } from '../domains/file.js'
import {
  detectConflictsInPatch,
  detectConflictsInFile
} from './fileConflictChecker.js'
import { isFileRemoved } from '../domains/fileStatus.js'

/**
 * Check pull request for conflicts function
 */
export const checkPullRequestForConflicts = async (dependencies: {
  pullRequestRepository: PullRequestRepositoryPort
  fileContentRepository: FileContentRepository
  output: OutputPort
  excludePatterns: string[]
}): Promise<void> => {
  const {
    pullRequestRepository,
    fileContentRepository,
    output,
    excludePatterns
  } = dependencies

  try {
    // Get pull request information
    const pullRequest = pullRequestRepository.getCurrentPullRequest()
    core.info(
      `Checking PR ${pullRequest.getIdentifier()} for conflict markers...`
    )

    // Fetch file list
    const files = await pullRequestRepository.fetchFiles(pullRequest)
    core.info(`Total files to check: ${files.length}`)

    // Check each file for conflicts
    const conflictedFiles: string[] = []

    for (const file of files) {
      if (!shouldCheckFile(file, excludePatterns)) {
        core.info(`Skipping ${file.fileName} (matches exclude pattern)`)
        continue
      }

      // Check conflicts - use patch if available, otherwise fetch full content
      let checkedFile: File = file

      if (file.patch) {
        // Use patch for small/medium files (patch is available)
        checkedFile = detectConflictsInPatch(file)
      } else {
        // For large files where patch is empty, fetch full content
        core.info(
          `Patch not available for ${file.fileName}, fetching full content...`
        )
        const content = await fileContentRepository.getFileContent(
          pullRequest,
          file
        )

        if (content) {
          checkedFile = detectConflictsInFile(file, content)
        } else {
          core.warning(`Could not fetch content for ${file.fileName}`)
          continue
        }
      }

      if (checkedFile.hasConflicts()) {
        const fileName = file.fileName
        conflictedFiles.push(fileName)

        // Log conflict details
        for (const conflict of checkedFile.conflicts) {
          core.error(
            `Conflict marker found in ${fileName}: ${conflict.content}`
          )
        }
      }
    }

    // Output results
    if (conflictedFiles.length > 0) {
      output.reportFailure(
        `Found conflict markers in ${conflictedFiles.length} file(s)`
      )
      output.setConflictsFound(true)
      output.setConflictedFiles(conflictedFiles)
    } else {
      core.info('No conflict markers found!')
      output.setConflictsFound(false)
      output.setConflictedFiles([])
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unknown error occurred'
    output.reportFailure(message)
  }
}

/**
 * Check if a file should be checked for conflicts
 */
const shouldCheckFile = (file: File, excludePatterns: string[]): boolean => {
  if (isFileRemoved(file.status)) {
    return false
  }

  return !excludePatterns.some((pattern) => file.fileName.includes(pattern))
}
