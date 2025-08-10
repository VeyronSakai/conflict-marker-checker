import * as core from '@actions/core'
import * as github from '@actions/github'

const OUTPUT_CONFLICTS = 'conflicts'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
interface PullRequestContext {
  owner: string
  repo: string
  pull_number: number
  head_sha: string
}

function validatePullRequestContext(): PullRequestContext {
  const context = github.context

  if (!context.payload.pull_request) {
    throw new Error('This action can only be run on pull requests')
  }

  const { owner, repo } = context.repo
  const pull_number = context.payload.pull_request.number
  const head_sha = context.payload.pull_request.head.sha

  return { owner, repo, pull_number, head_sha }
}

async function handleRateLimit(
  error: unknown,
  retries: number,
  maxRetries: number
): Promise<number> {
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
      // Exponential backoff for secondary rate limits
      waitTime = Math.min(60000 * Math.pow(2, retries), 300000)
    }

    core.warning(
      `Rate limited. Waiting ${waitTime / 1000} seconds before retry ${retries + 1}/${maxRetries}...`
    )

    return waitTime
  }

  throw error
}

async function fetchPullRequestFiles(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pull_number: number
): Promise<Array<{ filename: string; status: string }>> {
  const allFiles = []
  let page = 1
  const perPage = 100
  let retries = 0
  const maxRetries = 3

  while (true) {
    try {
      const response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number,
        per_page: perPage,
        page
      })

      // Check rate limit headers
      const remaining = parseInt(
        response.headers['x-ratelimit-remaining'] || '0'
      )
      const reset = parseInt(response.headers['x-ratelimit-reset'] || '0')

      if (remaining < 100) {
        core.warning(
          `Low API rate limit: ${remaining} requests remaining. Reset at ${new Date(reset * 1000).toISOString()}`
        )
      }

      allFiles.push(...response.data)

      if (response.data.length < perPage) {
        break
      }

      page++
      core.info(`Fetched ${allFiles.length} files so far...`)

      // Add small delay every 10 pages to avoid secondary rate limits
      if (page % 10 === 1 && page > 1) {
        core.debug('Adding delay to avoid rate limits...')
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      // Reset retry counter on success
      retries = 0
    } catch (error: unknown) {
      const waitTime = await handleRateLimit(error, retries, maxRetries)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      retries++
    }
  }

  return allFiles
}

function shouldCheckFile(
  file: { filename: string; status: string },
  excludePatterns: string
): boolean {
  if (file.status === 'removed') {
    return false
  }

  const excludeList = excludePatterns
    ? excludePatterns.split(',').map((p) => p.trim())
    : []

  if (excludeList.some((pattern) => file.filename.includes(pattern))) {
    core.info(`Skipping ${file.filename} (matches exclude pattern)`)
    return false
  }

  return true
}

interface ConflictResult {
  filename: string
  conflicts: Array<{ line: number; content: string }>
}

async function checkFileForConflicts(
  octokit: ReturnType<typeof github.getOctokit>,
  file: { filename: string },
  owner: string,
  repo: string,
  ref: string
): Promise<ConflictResult | null> {
  const conflictMarkers = ['<<<<<<<', '>>>>>>>', '=======']

  try {
    const { data: fileContent } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: file.filename,
      ref
    })

    if ('content' in fileContent && typeof fileContent.content === 'string') {
      const content = Buffer.from(fileContent.content, 'base64').toString()
      const lines = content.split('\n')
      const conflicts: Array<{ line: number; content: string }> = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const marker of conflictMarkers) {
          // Check if the marker appears at the beginning of the line (with optional whitespace)
          // This is how Git actually places conflict markers
          if (line.trimStart().startsWith(marker)) {
            conflicts.push({ line: i + 1, content: line.trim() })
            core.error(
              `Conflict marker found in ${file.filename} at line ${i + 1}: ${line.trim()}`
            )
            break
          }
        }
      }

      if (conflicts.length > 0) {
        return { filename: file.filename, conflicts }
      }
    }
  } catch (error) {
    core.warning(`Could not check file ${file.filename}: ${error}`)
  }

  return null
}

function setActionOutputs(filesWithConflicts: string[]): void {
  if (filesWithConflicts.length > 0) {
    core.setFailed(
      `Found conflict markers in ${filesWithConflicts.length} file(s)`
    )
    core.setOutput(OUTPUT_CONFLICTS, 'true')
    core.setOutput('conflicted-files', filesWithConflicts.join(','))
  } else {
    core.info('No conflict markers found!')
    core.setOutput(OUTPUT_CONFLICTS, 'false')
    core.setOutput('conflicted-files', '')
  }
}

export async function run(): Promise<void> {
  try {
    // Get inputs
    const token = core.getInput('github-token', { required: true })
    const excludePatterns = core.getInput('exclude-patterns') || ''
    const octokit = github.getOctokit(token)

    // Validate PR context
    const { owner, repo, pull_number, head_sha } = validatePullRequestContext()

    core.info(`Checking PR #${pull_number} for conflict markers...`)

    // Fetch all PR files with pagination and rate limit handling
    const allFiles = await fetchPullRequestFiles(
      octokit,
      owner,
      repo,
      pull_number
    )
    core.info(`Total files to check: ${allFiles.length}`)

    // Check each file for conflicts
    const filesWithConflicts: string[] = []

    for (const file of allFiles) {
      if (!shouldCheckFile(file, excludePatterns)) {
        continue
      }

      const conflictResult = await checkFileForConflicts(
        octokit,
        file,
        owner,
        repo,
        head_sha
      )

      if (conflictResult) {
        filesWithConflicts.push(conflictResult.filename)
      }
    }

    // Set outputs based on results
    setActionOutputs(filesWithConflicts)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}
