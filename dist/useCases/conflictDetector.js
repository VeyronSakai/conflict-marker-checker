import { isConflictMarker, detectMarkerType, createConflictMarker } from '../domains/conflictMarker.js';
import { createLineNumber } from '../domains/lineNumber.js';
import { addConflictToFile } from '../domains/pullRequestFile.js';
/**
 * Detect conflict markers from file content and update file
 */
export const detectConflictsInFile = (file, content) => {
    const lines = content.split('\n');
    let updatedFile = file;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isConflictMarker(line)) {
            const markerType = detectMarkerType(line);
            if (markerType) {
                const conflict = createConflictMarker(createLineNumber(i + 1), line.trim(), markerType);
                updatedFile = addConflictToFile(updatedFile, conflict);
            }
        }
    }
    return updatedFile;
};
/**
 * Detect conflict markers directly from content
 */
export const detectConflictsInContent = (content) => {
    const lines = content.split('\n');
    const conflicts = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isConflictMarker(line)) {
            const markerType = detectMarkerType(line);
            if (markerType) {
                conflicts.push(createConflictMarker(createLineNumber(i + 1), line.trim(), markerType));
            }
        }
    }
    return conflicts;
};
