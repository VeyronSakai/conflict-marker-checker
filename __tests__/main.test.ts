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
      data: [{ filename: 'test.js', status: 'modified' }]
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
    expect(core.setOutput).toHaveBeenCalledWith('has-conflicts', 'true')
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
      data: [{ filename: 'test.js', status: 'modified' }]
    })

    // Mock file content without conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from('line1\nline2\nline3\nline4').toString('base64')
      }
    })

    await run()

    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
    expect(core.setOutput).toHaveBeenCalledWith('has-conflicts', 'false')
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
      ]
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
})
