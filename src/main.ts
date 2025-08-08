import * as core from '@actions/core'
import * as github from '@actions/github'

const OUTPUT_CONFLICTS = 'conflicts'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true })
    const excludePatterns = core.getInput('exclude-patterns') || ''
    const octokit = github.getOctokit(token)
    const context = github.context

    if (!context.payload.pull_request) {
      core.setFailed('This action can only be run on pull requests')
      return
    }

    const { owner, repo } = context.repo
    const pull_number = context.payload.pull_request.number

    core.info(`Checking PR #${pull_number} for conflict markers...`)

    // Fetch all files with pagination
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
          const retryAfter =
            errorWithResponse.response?.headers?.['retry-after']
          const resetTime =
            errorWithResponse.response?.headers?.['x-ratelimit-reset']

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
          await new Promise((resolve) => setTimeout(resolve, waitTime))
          retries++
        } else {
          throw error
        }
      }
    }

    core.info(`Total files to check: ${allFiles.length}`)

    const conflictMarkers = ['<<<<<<<', '>>>>>>>', '=======']
    const filesWithConflicts: string[] = []

    const excludeList = excludePatterns
      ? excludePatterns.split(',').map((p) => p.trim())
      : []

    for (const file of allFiles) {
      if (file.status === 'removed') continue

      // Skip files matching exclude patterns
      if (excludeList.some((pattern) => file.filename.includes(pattern))) {
        core.info(`Skipping ${file.filename} (matches exclude pattern)`)
        continue
      }

      try {
        const { data: fileContent } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.filename,
          ref: context.payload.pull_request.head.sha
        })

        if (
          'content' in fileContent &&
          typeof fileContent.content === 'string'
        ) {
          const content = Buffer.from(fileContent.content, 'base64').toString()
          const lines = content.split('\n')

          let conflictFound = false
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            for (const marker of conflictMarkers) {
              // Check if the marker appears at the beginning of the line (with optional whitespace)
              // This is how Git actually places conflict markers
              if (line.trimStart().startsWith(marker)) {
                if (!conflictFound) {
                  filesWithConflicts.push(file.filename)
                  conflictFound = true
                }
                core.error(
                  `Conflict marker found in ${file.filename} at line ${i + 1}: ${line.trim()}`
                )
                break
              }
            }
          }
        }
      } catch (error) {
        core.warning(`Could not check file ${file.filename}: ${error}`)
      }
    }

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
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
