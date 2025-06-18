# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action that automatically detects Git conflict markers (conflict start, separator, and end markers) in pull request files to prevent accidentally merging unresolved conflicts.

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the action (creates dist/index.js)
npm run package

# Format and build for distribution
npm run bundle

# Run linting
npm run lint

# Format code
npm run format:write

# Test locally with GitHub Local Action
npm run local-action
```

### Testing
```bash
# Run all tests
npm test

# Run tests with coverage
npm run coverage

# Run CI tests (same as npm test with specific Node options)
npm run ci-test
```

## Architecture

### Core Components
- **`src/main.ts`**: Main action logic containing the `run()` function
- **`src/index.ts`**: Entry point that imports and executes main logic
- **`action.yml`**: GitHub Action metadata defining inputs/outputs
- **`dist/index.js`**: Bundled distribution file (built via Rollup)

### Key Architecture Decisions
- **ES Modules**: Full ESM setup with Node.js 20 and modern module resolution
- **Single Bundle**: Rollup creates one self-contained distribution file
- **GitHub API Integration**: Uses `@actions/github` and `@actions/core` packages
- **Mock-based Testing**: Jest with `unstable_mockModule` for comprehensive unit tests

### Action Flow
1. Validates it's running on a pull request
2. Fetches changed files via GitHub API
3. Downloads and scans file contents for conflict markers
4. Supports file exclusion via patterns
5. Sets outputs (`conflicts`, `conflicted-files`) and fails if conflicts found

## Build System

### Bundling with Rollup
- **Config**: `rollup.config.ts` bundles TypeScript to ES modules
- **Output**: Single `dist/index.js` file with source maps
- **Target**: ES2022 with NodeNext modules
- **Critical**: Always run `npm run package` after code changes and commit `dist/` changes

### Testing Setup
- **Framework**: Jest with TypeScript and ESM support
- **Mocks**: Located in `__fixtures__/` directory
- **Configuration**: `jest.config.js` with ESM and TypeScript support
- **Coverage**: Generates badges in `badges/coverage.svg`

## Development Workflow

### Local Testing
Create `.env` file with:
```env
GITHUB_TOKEN=your_github_token
GITHUB_REPOSITORY=owner/repo
GITHUB_EVENT_NAME=pull_request
GITHUB_EVENT_PATH=path/to/event.json
```

Then run: `npm run local-action`

### Code Quality
- **ESLint**: Configured with TypeScript rules in `eslint.config.mjs`
- **Prettier**: Code formatting with `.prettierrc.yml`
- **TypeScript**: Multiple tsconfig files for different build contexts

### CI/CD Requirements
- **Dist Check**: Must commit updated `dist/` files after code changes
- **Format Check**: Code must pass Prettier formatting
- **Lint Check**: Code must pass ESLint rules
- **Test Coverage**: Tests must pass with coverage reporting

## Release Process

### Automated Release Workflow
- **Draft Creation**: Pull requests automatically create release drafts
- **Version Management**: Releases update package.json version
- **Tag Management**: Creates major/minor version tags (e.g., v1, v1.2)
- **File Updates**: Automatically updates version files on release

### Release Configuration
- **Release Drafter**: `.github/release-drafter.yml` categorizes changes
- **Auto-labeling**: Branch names automatically get labels (feature/, fix/, etc.)
- **Version Resolution**: Labels determine version increment (major/minor/patch)

## Constants and Configuration

### String Constants
Use constants for repeated string literals:
```typescript
const OUTPUT_CONFLICTS = 'conflicts'
core.setOutput(OUTPUT_CONFLICTS, 'true')
```

### File Exclusion
Supports comma-separated patterns in `exclude-patterns` input:
```typescript
const excludeList = excludePatterns
  ? excludePatterns.split(',').map((p) => p.trim())
  : []
```

## GitHub Actions Integration

### Inputs
- `github-token` (required): GitHub API access
- `exclude-patterns` (optional): File patterns to skip

### Outputs  
- `conflicts`: Boolean string indicating if conflicts found
- `conflicted-files`: Comma-separated list with file:line format

### Error Handling
- Individual file failures are logged as warnings but don't stop execution
- Only fails the action if conflict markers are actually found
- Comprehensive error reporting with file names and line numbers