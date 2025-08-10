import * as core from '@actions/core';
/**
 * Logger implementation using GitHub Actions Core
 */
export const createActionCoreLogger = () => ({
    info: (message) => {
        core.info(message);
    },
    warning: (message) => {
        core.warning(message);
    },
    error: (message) => {
        core.error(message);
    },
    debug: (message) => {
        core.debug(message);
    }
});
