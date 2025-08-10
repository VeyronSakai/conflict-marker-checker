export const fileStatusFromString = (value) => {
    switch (value.toLowerCase()) {
        case 'added':
            return 'added';
        case 'modified':
            return 'modified';
        case 'removed':
            return 'removed';
        case 'renamed':
            return 'renamed';
        case 'copied':
            return 'copied';
        case 'changed':
            return 'changed';
        case 'unchanged':
            return 'unchanged';
        default:
            return 'unchanged';
    }
};
export const isFileRemoved = (status) => {
    return status === 'removed';
};
export const fileStatusToString = (status) => {
    return status;
};
