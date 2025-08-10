import { isFileRemoved } from './fileStatus.js';
import { fileNameToString } from './fileName.js';
export const createPullRequestFile = (fileName, status, conflicts = []) => ({
    fileName,
    status,
    conflicts
});
export const shouldCheckFile = (file, excludePatterns) => {
    if (isFileRemoved(file.status)) {
        return false;
    }
    const fileNameValue = fileNameToString(file.fileName);
    return !excludePatterns.some((pattern) => fileNameValue.includes(pattern));
};
export const addConflictToFile = (file, conflict) => ({
    ...file,
    conflicts: [...file.conflicts, conflict]
});
export const hasConflicts = (file) => {
    return file.conflicts.length > 0;
};
