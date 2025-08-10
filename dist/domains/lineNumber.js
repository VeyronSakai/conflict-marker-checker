export const createLineNumber = (value) => {
    if (value < 1) {
        throw new Error('LineNumber must be positive');
    }
    return value;
};
export const lineNumberEquals = (a, b) => {
    return a === b;
};
export const lineNumberToString = (lineNumber) => {
    return String(lineNumber);
};
export const lineNumberValue = (lineNumber) => {
    return lineNumber;
};
