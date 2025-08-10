import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PullRequestRepositoryPort } from '../domains/pullRequestRepositoryPort.js'
import {
  type PullRequestData,
  createPullRequestData
} from '../domains/pullRequestData.js'
import { type File, createFile } from '../domains/file.js'
import { fileStatusFromString } from '../domains/fileStatus.js'
import { wait } from '../wait.js'

/**
 * Pull request repository implementation using GitHub API
 */
export const createPullRequestRepository = (
  octokit: ReturnType<typeof github.getOctokit>
): PullRequestRepositoryPort => {
  return {
    getCurrentPullRequest: (): PullRequestData => {
      const context = github.context

      if (!context.payload.pull_request) {
        throw new Error('This action can only be run on pull requests')
      }

      const { owner, repo } = context.repo
      const pullNumber = context.payload.pull_request.number
      const headSha = context.payload.pull_request.head.sha

      return createPullRequestData(owner, repo, pullNumber, headSha)
    },

    fetchFiles: async (pullRequest: PullRequestData): Promise<File[]> => {
      const allFiles: File[] = []
      let page = 1
      const perPage = 100
      let retries = 0
      const maxRetries = 3

      while (true) {
        try {
          const response = await octokit.rest.pulls.listFiles({
            owner: pullRequest.owner,
            repo: pullRequest.repo,
            pull_number: pullRequest.pullNumber,
            per_page: perPage,
            page
          })

          // Rate limit check
          const remaining = parseInt(
            response.headers['x-ratelimit-remaining'] || '0'
          )
          const reset = parseInt(response.headers['x-ratelimit-reset'] || '0')

          if (remaining < 100) {
            core.warning(
              `Low API rate limit: ${remaining} requests remaining. Reset at ${new Date(reset * 1000).toISOString()}`
            )
          }

          // Convert to domain entities
          for (const fileData of response.data) {
            const fileName = fileData.filename
            const status = fileStatusFromString(fileData.status)
            const file = createFile(fileName, status)
            allFiles.push(file)
          }

          if (response.data.length < perPage) {
            break
          }

          page++
          core.info(`Fetched ${allFiles.length} files so far...`)

          // Add delay to avoid rate limits
          if (page % 10 === 1 && page > 1) {
            core.debug('Adding delay to avoid rate limits...')
            await wait(200)
          }

          retries = 0
        } catch (error: unknown) {
          const waitTime = await handleRateLimit(error, retries, maxRetries)
          await wait(waitTime)
          retries++
        }
      }

      return allFiles
    }
  }
}

const handleRateLimit = async (
  error: unknown,
  retries: number,
  maxRetries: number
): Promise<number> => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error.status === 403 || error.status === 429)
  ) {
    if (retries >= maxRetries) {
      throw new Error(
        `GitHub API rate limit exceeded after ${maxRetries} retries`
      )
    }

    const errorWithResponse = error as {
      response?: { headers?: { [key: string]: string } }
    }
    const retryAfter = errorWithResponse.response?.headers?.['retry-after']
    const resetTime = errorWithResponse.response?.headers?.['x-ratelimit-reset']

    let waitTime = 60000 // Default 1 minute

    if (retryAfter) {
      waitTime = parseInt(retryAfter) * 1000
    } else if (resetTime) {
      waitTime = Math.max(parseInt(resetTime) * 1000 - Date.now(), 1000)
    } else {
      waitTime = Math.min(60000 * Math.pow(2, retries), 300000)
    }

    core.warning(
      `Rate limited. Waiting ${waitTime / 1000} seconds before retry ${retries + 1}/${maxRetries}...`
    )

    return waitTime
  }

  throw error
}
