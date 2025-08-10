export const createFileName = (value) => {
    if (!value || value.trim().length === 0) {
        throw new Error('FileName cannot be empty');
    }
    return value;
};
export const fileNameEquals = (a, b) => {
    return a === b;
};
export const fileNameToString = (fileName) => {
    return fileName;
};
