# Conflict Marker Checker

> [!CAUTION]
> This Action had an issue where conflict markers could not be
> detected accurately when the PR contained a large number of file differences.
> This issue was unavoidable due to the concept of this Action, so it has been
> archived.

[![GitHub Super-Linter](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/check-dist.yml/badge.svg)](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)
[![Licensed](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/licensed.yml/badge.svg)](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/licensed.yml)

A GitHub Action that checks if pull request files contain Git conflict markers
(`<<<<<<<`, `=======`, `>>>>>>>`).

This action helps prevent accidentally merging pull requests that contain
unresolved merge conflicts.

## Usage

```yaml
name: Check for Conflict Markers

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  check-conflicts:
    runs-on: ubuntu-latest
    steps:
      - name: Check for conflict markers
        uses: VeyronSakai/conflict-marker-checker@v0.2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Name               | Description                                      | Required | Default               |
| ------------------ | ------------------------------------------------ | -------- | --------------------- |
| `github-token`     | GitHub token for API access                      | Yes      | `${{ github.token }}` |
| `exclude-patterns` | Comma-separated list of file patterns to exclude | No       | `''`                  |

### Outputs

| Name               | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `conflicts`        | Whether conflict markers were found (true/false)                         |
| `conflicted-files` | Comma-separated list of files with conflicts (e.g., `file1.js,file2.ts`) |

## Example Workflow with PR Comment

Create a workflow file in your repository (e.g.,
`.github/workflows/conflict-check.yml`):

```yaml
name: Check for Conflict Markers

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  check-conflicts:
    runs-on: ubuntu-latest
    steps:
      - name: Check for conflict markers
        uses: VeyronSakai/conflict-marker-checker@v0.2
        id: conflict-check
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Comment on PR if conflicts found
        if: ${{ steps.conflict-check.outputs.conflicts == 'true' }}
        shell: pwsh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CONFLICTED_FILES: ${{ steps.conflict-check.outputs.conflicted-files }}
        run: |
          $files = $env:CONFLICTED_FILES -split ','
          $fileList = $files | ForEach-Object { "- $_" }
          $body = @"
          ⚠️ **Conflict markers detected!**

          The following files contain conflict markers:
          $($fileList -join "`n")

          Please resolve all conflicts before merging.
          "@

          gh pr comment --body $body
```

## Development

### Prerequisites

- Node.js 20.x or later
- npm

### Setup

1. Clone the repository

   ```bash
   git clone https://github.com/VeyronSakai/conflict-marker-checker.git
   cd conflict-marker-checker
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Run tests

   ```bash
   npm test
   ```

4. Build the action
   ```bash
   npm run package
   ```

### Running Locally

You can test the action locally using the `@github/local-action` utility:

**Step 1: Create a `.env` file**

```env
GITHUB_TOKEN=your_github_token
GITHUB_REPOSITORY=owner/repo
GITHUB_EVENT_NAME=pull_request
GITHUB_EVENT_PATH=test-pr-event.json
INPUT_GITHUB-TOKEN=your_github_token
INPUT_EXCLUDE-PATTERNS=
```

**Step 2: Create a `test-pr-event.json` file**

```json
{
  "pull_request": {
    "number": 123,
    "head": {
      "sha": "abc123def456...",
      "ref": "feature-branch"
    },
    "base": {
      "sha": "789012efg345...",
      "ref": "main"
    }
  },
  "repository": {
    "name": "repo-name",
    "owner": {
      "login": "owner-name"
    }
  }
}
```

Replace the values with actual pull request data from your repository. You can
get this information from:

- GitHub API: `GET /repos/{owner}/{repo}/pulls/{pull_number}`
- An existing pull request in your repository

**Step 3: Run the local test**

```bash
npx @github/local-action . src/main.ts .env
```

## How It Works

This action:

1. Fetches the list of changed files in the pull request
2. Reads the content of each modified file
3. Searches for Git conflict markers:
   - `<<<<<<<` (conflict start)
   - `=======` (conflict separator)
   - `>>>>>>>` (conflict end)
4. Reports any files containing these markers
5. Fails the workflow if conflicts are detected

## Limitations

- **Git LFS Files**: Conflict markers in Git LFS-managed files cannot be
  detected by default. This is due to a known Git LFS issue
  ([git-lfs/git-lfs#6006](https://github.com/git-lfs/git-lfs/pull/6006)) where
  LFS pointer files are returned instead of actual file content when conflicts
  occur.

- **Custom Conflict Markers**: This action may not detect conflicts if you have
  customized Git's conflict marker style or size through `merge.conflictStyle`
  or `merge.conflictMarkerSize` settings. The action only detects the standard
  7-character conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
