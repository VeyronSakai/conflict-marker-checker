import * as core from '@actions/core';
const OUTPUT_CONFLICTS = 'conflicts';
const OUTPUT_CONFLICTED_FILES = 'conflicted-files';
/**
 * GitHub Actions output adapter
 */
export const createActionOutputAdapter = () => ({
    setConflictsFound: (found) => {
        core.setOutput(OUTPUT_CONFLICTS, found.toString());
    },
    setConflictedFiles: (files) => {
        core.setOutput(OUTPUT_CONFLICTED_FILES, files.join(','));
    },
    reportFailure: (message) => {
        core.setFailed(message);
    }
});
