import * as core from '@actions/core'
import * as github from '@actions/github'

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

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number,
      per_page: 100
    })

    const conflictMarkers = ['<<<<<<<', '>>>>>>>', '=======']
    const filesWithConflicts: string[] = []

    const excludeList = excludePatterns
      ? excludePatterns.split(',').map((p) => p.trim())
      : []

    for (const file of files) {
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
              if (line.includes(marker)) {
                if (!conflictFound) {
                  filesWithConflicts.push(`${file.filename}:${i + 1}`)
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
      core.setOutput('conflicts', 'true')
      core.setOutput('conflicted-files', filesWithConflicts.join(','))
    } else {
      core.info('No conflict markers found!')
      core.setOutput('conflicts', 'false')
      core.setOutput('conflicted-files', '')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
