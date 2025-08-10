import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PullRequestData } from '../domains/pullRequestData.js'
import type { File } from '../domains/file.js'

/**
 * File content repository implementation using GitHub API
 */
export type FileContentRepository = {
  getFileContent(
    pullRequest: PullRequestData,
    file: File
  ): Promise<string | null>
}

export const createFileContentRepository = (
  octokit: ReturnType<typeof github.getOctokit>
): FileContentRepository => ({
  getFileContent: async (
    pullRequest: PullRequestData,
    file: File
  ): Promise<string | null> => {
    try {
      const { data: fileContent } = await octokit.rest.repos.getContent({
        owner: pullRequest.owner,
        repo: pullRequest.repo,
        path: file.fileName,
        ref: pullRequest.headSha
      })

      if ('content' in fileContent && typeof fileContent.content === 'string') {
        return Buffer.from(fileContent.content, 'base64').toString()
      }

      return null
    } catch (error) {
      core.warning(`Could not check file ${file.fileName}: ${error}`)
      return null
    }
  }
})
