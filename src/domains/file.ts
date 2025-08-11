import type { FileStatus } from './fileStatus.js'
import type { ConflictMarker } from './conflictMarker.js'

/**
 * File type definition
 */
export type File = {
  readonly fileName: string
  readonly status: FileStatus
  readonly patch?: string
  readonly conflictMarkers: ConflictMarker[]
  readonly hasConflictMarkers: () => boolean
}

/**
 * Create a File instance
 */
export const createFile = (
  fileName: string,
  status: FileStatus,
  patch?: string,
  conflictMarkers: ConflictMarker[] = []
): File => ({
  fileName,
  status,
  patch,
  conflictMarkers: conflictMarkers,
  hasConflictMarkers: () => conflictMarkers.length > 0
})
