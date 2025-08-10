import { fileNameToString } from '../../domains/fileName.js';
/**
 * File content repository implementation using GitHub API
 */
export const createGitHubFileContentRepository = (octokit, logger) => ({
    getFileContent: async (pullRequest, file) => {
        try {
            const { data: fileContent } = await octokit.rest.repos.getContent({
                owner: pullRequest.owner,
                repo: pullRequest.repo,
                path: fileNameToString(file.fileName),
                ref: pullRequest.headSha
            });
            if ('content' in fileContent && typeof fileContent.content === 'string') {
                return Buffer.from(fileContent.content, 'base64').toString();
            }
            return null;
        }
        catch (error) {
            logger.warning(`Could not check file ${fileNameToString(file.fileName)}: ${error}`);
            return null;
        }
    }
});
