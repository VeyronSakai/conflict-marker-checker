# Conflict Marker Checker

[![GitHub Super-Linter](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/check-dist.yml/badge.svg)](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/VeyronSakai/conflict-marker-checker/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

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

| Name               | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| `conflicts`        | Whether conflict markers were found (true/false)                               |
| `conflicted-files` | Comma-separated list of files with conflicts (e.g., `file1.js:10,file2.ts:25`) |

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

```bash
npx @github/local-action . src/main.ts .env
```

Create a `.env` file with the necessary environment variables:

```env
GITHUB_TOKEN=your_github_token
GITHUB_REPOSITORY=owner/repo
GITHUB_EVENT_NAME=pull_request
GITHUB_EVENT_PATH=path/to/event.json
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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
