import * as core from '@actions/core'
import type { PullRequestRepositoryPort } from '../domains/pullRequestRepositoryPort.js'
import type { GitHubFileContentRepository } from '../infrastructures/gitHubFileContentRepository.js'
import type { OutputPort } from '../domains/outputPort.js'
import type { File } from '../domains/file.js'
import { detectConflictsInFile } from './fileConflictChecker.js'
import { isFileRemoved } from '../domains/fileStatus.js'

/**
 * Check pull request for conflicts function
 */
export const checkPullRequestForConflicts = async (dependencies: {
  pullRequestRepository: PullRequestRepositoryPort
  fileContentRepository: GitHubFileContentRepository
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

    for (let file of files) {
      if (!shouldCheckFile(file, excludePatterns)) {
        core.info(`Skipping ${file.fileName} (matches exclude pattern)`)
        continue
      }

      const content = await fileContentRepository.getFileContent(
        pullRequest,
        file
      )

      if (content !== null) {
        file = detectConflictsInFile(file, content)

        if (file.hasConflicts()) {
          const fileName = file.fileName
          conflictedFiles.push(fileName)

          // Log conflict details
          for (const conflict of file.conflicts) {
            core.error(
              `Conflict marker found in ${fileName} at line ${conflict.lineNumber}: ${conflict.content}`
            )
          }
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
