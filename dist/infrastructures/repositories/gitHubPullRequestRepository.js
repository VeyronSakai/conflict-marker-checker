import * as github from '@actions/github';
import { createPullRequest } from '../../domains/pullRequest.js';
import { createPullRequestFile } from '../../domains/pullRequestFile.js';
import { createFileName } from '../../domains/fileName.js';
import { fileStatusFromString } from '../../domains/fileStatus.js';
/**
 * Pull request repository implementation using GitHub API
 */
export const createGitHubPullRequestRepository = (octokit, logger) => {
    const handleRateLimit = async (error, retries, maxRetries) => {
        if (error &&
            typeof error === 'object' &&
            'status' in error &&
            (error.status === 403 || error.status === 429)) {
            if (retries >= maxRetries) {
                throw new Error(`GitHub API rate limit exceeded after ${maxRetries} retries`);
            }
            const errorWithResponse = error;
            const retryAfter = errorWithResponse.response?.headers?.['retry-after'];
            const resetTime = errorWithResponse.response?.headers?.['x-ratelimit-reset'];
            let waitTime = 60000; // Default 1 minute
            if (retryAfter) {
                waitTime = parseInt(retryAfter) * 1000;
            }
            else if (resetTime) {
                waitTime = Math.max(parseInt(resetTime) * 1000 - Date.now(), 1000);
            }
            else {
                waitTime = Math.min(60000 * Math.pow(2, retries), 300000);
            }
            logger.warning(`Rate limited. Waiting ${waitTime / 1000} seconds before retry ${retries + 1}/${maxRetries}...`);
            return waitTime;
        }
        throw error;
    };
    return {
        getCurrentPullRequest: () => {
            const context = github.context;
            if (!context.payload.pull_request) {
                throw new Error('This action can only be run on pull requests');
            }
            const { owner, repo } = context.repo;
            const pullNumber = context.payload.pull_request.number;
            const headSha = context.payload.pull_request.head.sha;
            return createPullRequest(owner, repo, pullNumber, headSha);
        },
        fetchFiles: async (pullRequest) => {
            const allFiles = [];
            let page = 1;
            const perPage = 100;
            let retries = 0;
            const maxRetries = 3;
            while (true) {
                try {
                    const response = await octokit.rest.pulls.listFiles({
                        owner: pullRequest.owner,
                        repo: pullRequest.repo,
                        pull_number: pullRequest.pullNumber,
                        per_page: perPage,
                        page
                    });
                    // Rate limit check
                    const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
                    const reset = parseInt(response.headers['x-ratelimit-reset'] || '0');
                    if (remaining < 100) {
                        logger.warning(`Low API rate limit: ${remaining} requests remaining. Reset at ${new Date(reset * 1000).toISOString()}`);
                    }
                    // Convert to domain entities
                    for (const fileData of response.data) {
                        const fileName = createFileName(fileData.filename);
                        const status = fileStatusFromString(fileData.status);
                        const file = createPullRequestFile(fileName, status);
                        allFiles.push(file);
                    }
                    if (response.data.length < perPage) {
                        break;
                    }
                    page++;
                    logger.info(`Fetched ${allFiles.length} files so far...`);
                    // Add delay to avoid rate limits
                    if (page % 10 === 1 && page > 1) {
                        logger.debug('Adding delay to avoid rate limits...');
                        await new Promise((resolve) => setTimeout(resolve, 200));
                    }
                    retries = 0;
                }
                catch (error) {
                    const waitTime = await handleRateLimit(error, retries, maxRetries);
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                    retries++;
                }
            }
            return allFiles;
        }
    };
};
