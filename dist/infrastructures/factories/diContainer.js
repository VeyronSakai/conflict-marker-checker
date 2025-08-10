import * as core from '@actions/core';
import * as github from '@actions/github';
import { checkPullRequestForConflicts } from '../../useCases/checkPullRequestForConflicts.js';
import { createGitHubPullRequestRepository } from '../repositories/gitHubPullRequestRepository.js';
import { createGitHubFileContentRepository } from '../repositories/gitHubFileContentRepository.js';
import { createActionCoreLogger } from './actionCoreLogger.js';
import { createActionOutputAdapter } from './actionOutputAdapter.js';
/**
 * Create function to execute use case with dependencies
 */
export const createCheckPullRequestUseCase = () => {
    // Get input values
    const token = core.getInput('github-token', { required: true });
    const excludePatterns = core.getInput('exclude-patterns') || '';
    // Create GitHub API client
    const octokit = github.getOctokit(token);
    // Create adapters and repositories
    const logger = createActionCoreLogger();
    const output = createActionOutputAdapter();
    const pullRequestRepository = createGitHubPullRequestRepository(octokit, logger);
    const fileContentRepository = createGitHubFileContentRepository(octokit, logger);
    // Parse exclude patterns
    const excludePatternsArray = excludePatterns
        ? excludePatterns.split(',').map((p) => p.trim())
        : [];
    // Return function to execute use case
    return () => checkPullRequestForConflicts({
        pullRequestRepository,
        fileContentRepository,
        logger,
        output,
        excludePatterns: excludePatternsArray
    });
};
