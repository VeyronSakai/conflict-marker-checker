import type { PullRequestData } from './pullRequestData.js'
import type { File } from './file.js'

/**
 * Pull request repository port type
 */
export type PullRequestRepositoryPort = {
  /**
   * Get pull request information from current context
   */
  getCurrentPullRequest(): PullRequestData

  /**
   * Fetch list of files in the pull request
   */
  getFiles(pullRequest: PullRequestData): Promise<File[]>
}
