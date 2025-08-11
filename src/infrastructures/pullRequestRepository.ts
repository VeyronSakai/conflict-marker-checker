import * as core from '@actions/core'
import * as github from '@actions/github'
import type { PullRequestRepositoryPort } from '../domains/pullRequestRepositoryPort.js'
import {
  type PullRequestData,
  createPullRequestData
} from '../domains/pullRequestData.js'
import { type File, createFile } from '../domains/file.js'
import { fileStatusFromString } from '../domains/fileStatus.js'
import {
  CONFLICT_MARKERS,
  type MarkerType,
  createConflictMarker,
  type ConflictMarker
} from '../domains/conflictMarker.js'
import { wait } from '../wait.js'

/**
 * Pull request repository implementation using GitHub API
 */
export const createPullRequestRepository = (
  octokit: ReturnType<typeof github.getOctokit>,
  getFileContent?: (
    pullRequest: PullRequestData,
    file: File
  ) => Promise<string | null>
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

          // Convert to domain entities and detect conflicts
          for (const fileData of response.data) {
            const fileName = fileData.filename
            const status = fileStatusFromString(fileData.status)
            const patch = fileData.patch

            let conflicts: ConflictMarker[] = []

            // Check conflicts - use patch if available, otherwise fetch full content
            if (patch) {
              // Use patch for small/medium files (patch is available)
              conflicts = detectConflictsInPatch(patch)
            } else if (getFileContent) {
              // For large files where patch is empty, fetch full content
              core.info(
                `Patch not available for ${fileName}, fetching full content...`
              )
              const tempFile = createFile(fileName, status, patch)
              const content = await getFileContent(pullRequest, tempFile)

              if (content) {
                conflicts = detectConflictsInContent(content)
              } else {
                core.warning(`Could not fetch content for ${fileName}`)
              }
            }

            const file = createFile(fileName, status, patch, conflicts)
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
          if (retries >= maxRetries) {
            throw new Error(
              `GitHub API request failed after ${maxRetries} retries: ${error}`
            )
          }

          const waitTime = await handleRateLimit(error)
          await wait(waitTime)
          retries++
        }
      }

      return allFiles
    }
  }
}

/**
 * Check if a line contains a conflict marker
 */
const isConflictMarker = (line: string): boolean => {
  const trimmedLine = line.trimStart()
  return CONFLICT_MARKERS.some((marker) => trimmedLine.startsWith(marker))
}

/**
 * Detect the type of conflict marker in a line
 */
const detectMarkerType = (line: string): MarkerType | null => {
  const trimmedLine = line.trimStart()
  for (const marker of CONFLICT_MARKERS) {
    if (trimmedLine.startsWith(marker)) {
      return marker
    }
  }
  return null
}

/**
 * Detect conflict markers from patch content (only added lines)
 */
const detectConflictsInPatch = (patch: string): ConflictMarker[] => {
  const lines = patch.split('\n')
  const conflicts: ConflictMarker[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Only check added lines (starting with '+')
    // Skip lines that are just '+' or '+++' (file header)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      // Remove the '+' prefix and check for conflict markers
      const lineContent = line.substring(1)
      if (isConflictMarker(lineContent)) {
        const markerType = detectMarkerType(lineContent)
        if (markerType) {
          // Note: line number is not meaningful in patch context
          const conflict = createConflictMarker(
            0,
            lineContent.trim(),
            markerType
          )
          conflicts.push(conflict)
        }
      }
    }
  }

  return conflicts
}

/**
 * Detect conflict markers from file content
 */
const detectConflictsInContent = (content: string): ConflictMarker[] => {
  const lines = content.split('\n')
  const conflicts: ConflictMarker[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isConflictMarker(line)) {
      const markerType = detectMarkerType(line)
      if (markerType) {
        const conflict = createConflictMarker(i + 1, line.trim(), markerType)
        conflicts.push(conflict)
      }
    }
  }

  return conflicts
}

const handleRateLimit = async (error: unknown): Promise<number> => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error.status === 403 || error.status === 429)
  ) {
    const errorWithResponse = error as {
      response?: { headers?: { [key: string]: string } }
    }
    const retryAfter = errorWithResponse.response?.headers?.['retry-after']
    const resetTime = errorWithResponse.response?.headers?.['x-ratelimit-reset']

    let waitTime: number

    if (retryAfter) {
      waitTime = parseInt(retryAfter) * 1000
    } else if (resetTime) {
      waitTime = Math.max(parseInt(resetTime) * 1000 - Date.now(), 1000)
    } else {
      // Default wait time
      waitTime = 60000
    }

    core.warning(
      `Rate limited. Waiting ${waitTime / 1000} seconds before retry...`
    )

    return waitTime
  }

  throw error
}
