import type { FileStatus } from './fileStatus.js'
import type { ConflictMarker } from './conflictMarker.js'

/**
 * File type definition
 */
export type File = {
  readonly fileName: string
  readonly status: FileStatus
  readonly patch?: string
  readonly conflicts: ConflictMarker[]
  readonly hasConflicts: () => boolean
}

/**
 * Create a File instance
 */
export const createFile = (
  fileName: string,
  status: FileStatus,
  patch?: string,
  conflicts: ConflictMarker[] = []
): File => ({
  fileName,
  status,
  patch,
  conflicts,
  hasConflicts: () => conflicts.length > 0
})
