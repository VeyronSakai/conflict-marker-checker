import * as core from '@actions/core'
import * as github from '@actions/github'
import { checkPullRequestForConflicts } from './useCases/pullRequestConflictChecker.js'
import { createPullRequestRepository } from './infrastructures/pullRequestRepository.js'
import { createFileContentRepository } from './infrastructures/fileContentRepository.js'
import { createActionOutputAdapter } from './infrastructures/actionOutputAdapter.js'

/**
 * GitHub Action main entry point
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  // Get input values
  const token = core.getInput('github-token', { required: true })
  const excludePatterns = core.getInput('exclude-patterns') || ''

  // Create GitHub API client
  const octokit = github.getOctokit(token)

  // Create adapters and repositories
  const outputAdapter = createActionOutputAdapter()
  const pullRequestRepository = createPullRequestRepository(octokit)
  const fileContentRepository = createFileContentRepository(octokit)

  // Parse exclude patterns
  const excludePatternsArray = excludePatterns
    ? excludePatterns.split(',').map((p) => p.trim())
    : []

  // Execute use case
  await checkPullRequestForConflicts({
    pullRequestRepository,
    fileContentRepository,
    output: outputAdapter,
    excludePatterns: excludePatternsArray
  })
}
