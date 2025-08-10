import { getPullRequestIdentifier } from '../domains/pullRequest.js';
import { shouldCheckFile, hasConflicts } from '../domains/pullRequestFile.js';
import { fileNameToString } from '../domains/fileName.js';
import { lineNumberValue } from '../domains/lineNumber.js';
import { detectConflictsInFile } from './conflictDetector.js';
/**
 * Check pull request for conflicts function
 */
export const checkPullRequestForConflicts = async (dependencies) => {
    const { pullRequestRepository, fileContentRepository, logger, output, excludePatterns } = dependencies;
    try {
        // Get pull request information
        const pullRequest = pullRequestRepository.getCurrentPullRequest();
        logger.info(`Checking PR ${getPullRequestIdentifier(pullRequest)} for conflict markers...`);
        // Fetch file list
        const files = await pullRequestRepository.fetchFiles(pullRequest);
        logger.info(`Total files to check: ${files.length}`);
        // Check each file for conflicts
        const conflictedFiles = [];
        for (let file of files) {
            if (!shouldCheckFile(file, excludePatterns)) {
                logger.info(`Skipping ${fileNameToString(file.fileName)} (matches exclude pattern)`);
                continue;
            }
            const content = await fileContentRepository.getFileContent(pullRequest, file);
            if (content !== null) {
                file = detectConflictsInFile(file, content);
                if (hasConflicts(file)) {
                    const fileName = fileNameToString(file.fileName);
                    conflictedFiles.push(fileName);
                    // Log conflict details
                    for (const conflict of file.conflicts) {
                        logger.error(`Conflict marker found in ${fileName} at line ${lineNumberValue(conflict.lineNumber)}: ${conflict.content}`);
                    }
                }
            }
        }
        // Output results
        if (conflictedFiles.length > 0) {
            output.reportFailure(`Found conflict markers in ${conflictedFiles.length} file(s)`);
            output.setConflictsFound(true);
            output.setConflictedFiles(conflictedFiles);
        }
        else {
            logger.info('No conflict markers found!');
            output.setConflictsFound(false);
            output.setConflictedFiles([]);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        output.reportFailure(message);
    }
};
