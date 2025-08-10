/**
 * File status type definition and related functions
 */
export type FileStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged'

export const fileStatusFromString = (value: string): FileStatus => {
  switch (value.toLowerCase()) {
    case 'added':
      return 'added'
    case 'modified':
      return 'modified'
    case 'removed':
      return 'removed'
    case 'renamed':
      return 'renamed'
    case 'copied':
      return 'copied'
    case 'changed':
      return 'changed'
    case 'unchanged':
      return 'unchanged'
    default:
      return 'unchanged'
  }
}

export const isFileRemoved = (status: FileStatus): boolean => {
  return status === 'removed'
}
