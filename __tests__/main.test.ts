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

    // Mock PR files with patch containing conflict markers
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'test.js',
          status: 'modified',
          patch:
            '@@ -1,2 +1,7 @@\n line1\n+<<<<<<< HEAD\n+line2\n+=======\n+line3\n+>>>>>>> branch\n line4'
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
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

    // Mock PR files with patch without conflict markers
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'test.js',
          status: 'modified',
          patch: '@@ -1,2 +1,4 @@\n line1\n+line2\n+line3\n line4'
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
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
        {
          filename: 'test.js',
          status: 'modified',
          patch: '@@ -1,2 +1,4 @@\n line1\n+line2\n+line3\n line4'
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    await run()

    // Should skip removed.js and only check test.js
    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
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
        status: 'modified',
        patch: '@@ -1,2 +1,3 @@\n line1\n+line2\n line3'
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
        data: [
          {
            filename: 'test.js',
            status: 'modified',
            patch: '@@ -1,2 +1,3 @@\n line1\n+line2\n line3'
          }
        ],
        headers: {
          'x-ratelimit-remaining': '500',
          'x-ratelimit-reset': '9999999999'
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
      data: [
        {
          filename: 'test.js',
          status: 'modified',
          patch: '@@ -1,2 +1,3 @@\n line1\n+line2\n line3'
        }
      ],
      headers: {
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '9999999999'
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

    // Mock PR files with patch containing conflict markers in LFS pointer
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'large-file.bin',
          status: 'modified',
          patch: `@@ -1,4 +1,9 @@
+<<<<<<< HEAD
 version https://git-lfs.github.com/spec/v1
-oid sha256:oldsha
-size 999
+oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
+size 12345
+=======
+version https://git-lfs.github.com/spec/v1
+oid sha256:6cb562612d7a9f2e9d2c5b3f1b8f9e0ff69d22eadbb8f32b1258daaa5e2ca24
+size 67890
+>>>>>>> feature-branch`
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
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

  it('Ignores conflict-like patterns in comments', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files with patch containing only normal code changes (no conflicts)
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'test.js',
          status: 'modified',
          patch: `@@ -1,3 +1,5 @@
 function test() {
+  // This is a regular comment
+  console.log('hello');
   const x = 1;
   return x;
 }`
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    await run()

    // Should NOT detect these as conflict markers
    expect(core.error).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith('No conflict markers found!')
    expect(core.setOutput).toHaveBeenCalledWith('conflicts', 'false')
    expect(core.setOutput).toHaveBeenCalledWith('conflicted-files', '')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Detects real conflict markers at line start', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files with patch containing real conflict markers
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'test.js',
          status: 'modified',
          patch: `@@ -1,5 +1,9 @@
 function test() {
   // This comment has ======= but should be ignored
   const x = 1;
+<<<<<<< HEAD
+  const y = 2;
+=======
+  const y = 3;
+>>>>>>> feature-branch
   return x + y;
 }`
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    await run()

    // Should detect real conflict markers
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

  it('Falls back to getContent for large files without patch', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files where patch is undefined (large file)
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'large-file.js',
          status: 'modified'
          // Note: no patch field (happens for large files)
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    // Mock getContent to return file with conflict markers
    mockOctokit.rest.repos.getContent.mockResolvedValue({
      data: {
        content: Buffer.from(
          `function test() {
<<<<<<< HEAD
  const x = 1;
=======
  const x = 2;
>>>>>>> branch
  return x;
}`
        ).toString('base64')
      }
    })

    await run()

    // Should call getContent for the large file
    expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'large-file.js',
      ref: 'abc123'
    })

    expect(core.info).toHaveBeenCalledWith(
      'Patch not available for large-file.js, fetching full content...'
    )
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Conflict marker found in large-file.js')
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Found conflict markers in 1 file(s)')
    )
  })

  it('Handles conflict markers with leading whitespace', async () => {
    // Set context with pull_request
    github.context.payload = {
      pull_request: {
        number: 123,
        head: { sha: 'abc123' }
      }
    }

    // Mock PR files with patch containing indented conflict markers (common in YAML)
    mockOctokit.rest.pulls.listFiles.mockResolvedValue({
      data: [
        {
          filename: 'test.yaml',
          status: 'modified',
          patch: `@@ -1,3 +1,7 @@
 config:
   setting1: value1
+  <<<<<<< HEAD
+  setting2: value2-from-head
+  =======
+  setting2: value2-from-branch
+  >>>>>>> feature-branch
   setting3: value3`
        }
      ],
      headers: {
        'x-ratelimit-remaining': '900',
        'x-ratelimit-reset': '9999999999'
      }
    })

    await run()

    // Should detect conflict markers even with leading whitespace
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Conflict marker found in test.yaml')
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Found conflict markers in 1 file(s)')
    )
    expect(core.setOutput).toHaveBeenCalledWith('conflicts', 'true')
  })
})
