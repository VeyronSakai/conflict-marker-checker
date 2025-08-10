export const CONFLICT_MARKERS = ['<<<<<<<', '>>>>>>>', '======='];
export const createConflictMarker = (lineNumber, content, markerType) => ({
    lineNumber,
    content,
    markerType
});
export const isConflictMarker = (line) => {
    const trimmedLine = line.trimStart();
    return CONFLICT_MARKERS.some((marker) => trimmedLine.startsWith(marker));
};
export const detectMarkerType = (line) => {
    const trimmedLine = line.trimStart();
    for (const marker of CONFLICT_MARKERS) {
        if (trimmedLine.startsWith(marker)) {
            return marker;
        }
    }
    return null;
};
