/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock github module
const github = {
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: {}
  },
  getOctokit: jest.fn()
}

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOctokit: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock octokit
    mockOctokit = {
      rest: {
        pulls: {
          listFiles: jest.fn()
        },
        repos: {
          getContent: jest.fn()
        }
      }
    }
    github.getOctokit.mockReturnValue(mockOctokit)

    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name) => {
      if (name === 'github-token') return 'test-token'
      return ''
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Fails when not run on a pull request', async () => {
    // Set context without pull_request
    github.context.payload = {}

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'This action can only be run on pull requests'
    )
  })

  it('Detects conflict markers in files', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [{ filename: 'test.js', status: 'modified' }],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    // Mock file content with conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from(
          'line1\n<<<<<<< HEAD\nline2\n=======\nline3\n>>>>>>> branch\nline4'
        ).toString('base64')
      }
    })

    await run()

    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Conflict marker found in test.js')
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Found conflict markers in 1 file(s)')
    )
    expect(core.setOutput).toHaveBeenCalledWith('conflicts', 'true')
    expect(core.setOutput).toHaveBeenCalledWith(
      'conflicted-files',
      expect.stringContaining('test.js')
    )
  })

  it('Passes when no conflict markers found', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [{ filename: 'test.js', status: 'modified' }],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    // Mock file content without conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from('line1\nline2\nline3\nline4').toString('base64')
      }
    })

    await run()

    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
    expect(core.setOutput).toHaveBeenCalledWith('conflicts', 'false')
    expect(core.setOutput).toHaveBeenCalledWith('conflicted-files', '')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Ignores removed files', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files with removed file
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        { filename: 'removed.js', status: 'removed' },
        { filename: 'test.js', status: 'modified' }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    // Mock file content without conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from('line1\nline2\nline3\nline4').toString('base64')
      }
    })

    await run()

    // Should only check test.js, not removed.js
    expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledTimes(1)
    expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'test.js' })
    )
  })

  it('Handles pagination for large PRs', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files with pagination (150 files total)
    const createFiles = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        filename: `file${start + i}.js`,
        status: 'modified'
      }))

    mockOctokit.rest.pulls.listFiles
      .mockResolvedValueOnce({
        data: createFiles(0, 100),
        headers: {
          'x-ratelimit-remaining': '900',
          'x-ratelimit-reset': '9999999999'
        }
      }) // First page
      .mockResolvedValueOnce({
        data: createFiles(100, 50),
        headers: {
          'x-ratelimit-remaining': '899',
          'x-ratelimit-reset': '9999999999'
        }
      }) // Second page

    // Mock file content without conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from('line1\nline2\nline3\nline4').toString('base64')
      }
    })

    await run()

    // Verify pagination calls
    expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2)
    expect(mockOctokit.rest.pulls.listFiles).toHaveBeenNthCalledWith(1, {
      owner: 'test-owner',
      repo: 'test-repo',
      pull_number: 123,
      per_page: 100,
      page: 1
    })
    expect(mockOctokit.rest.pulls.listFiles).toHaveBeenNthCalledWith(2, {
      owner: 'test-owner',
      repo: 'test-repo',
      pull_number: 123,
      per_page: 100,
      page: 2
    })

    // Verify all 150 files were checked
    expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledTimes(150)
    expect(core.info).toHaveBeenCalledWith('Total files to check: 150')
    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
  })

  it('Handles rate limit errors with retry', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock rate limit error on first call, then success
    const rateLimitError = new Error('Rate limit exceeded')
    Object.assign(rateLimitError, {
      status: 429,
      response: {
        headers: {
          'retry-after': '2',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60)
        }
      }
    })

    mockOctokit.rest.pulls.listFiles
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        data: [{ filename: 'test.js', status: 'modified' }],
        headers: {
          'x-ratelimit-remaining': '500',
          'x-ratelimit-reset': '9999999999'
        }
      })

    // Mock file content without conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from('line1\nline2\nline3\nline4').toString('base64')
      }
    })

    await run()

    // Verify retry happened
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Rate limited. Waiting')
    )
    expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2)
    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
  })

  it('Warns on low rate limit', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files with low rate limit
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [{ filename: 'test.js', status: 'modified' }],
      headers: {
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '9999999999'
      }
    })

    // Mock file content without conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from('line1\nline2\nline3\nline4').toString('base64')
      }
    })

    await run()

    // Verify warning about low rate limit
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Low API rate limit: 50 requests remaining')
    )
    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
  })

  it('Detects conflict markers in Git LFS pointer files', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [{ filename: 'large-file.bin', status: 'modified' }],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    // Mock conflicted Git LFS pointer file content
    const conflictedLFSPointer = `<<<<<<< HEAD
version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
=======
version https://git-lfs.github.com/spec/v1
oid sha256:6cb562612d7a9f2e9d2c5b3f1b8f9e0ff69d22eadbb8f32b1258daaa5e2ca24
size 67890
>>>>>>> feature-branch`

    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from(conflictedLFSPointer).toString('base64')
      }
    })

    await run()

    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Conflict marker found in large-file.bin')
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Found conflict markers in 1 file(s)')
    )
    expect(core.setOutput).toHaveBeenCalledWith('conflicts', 'true')
    expect(core.setOutput).toHaveBeenCalledWith(
      'conflicted-files',
      expect.stringContaining('large-file.bin')
    )
  })
})
