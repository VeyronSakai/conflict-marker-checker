import type { File } from '../domains/file.js'
import {
  CONFLICT_MARKERS,
  type MarkerType,
  createConflictMarker
} from '../domains/conflictMarker.js'

/**
 * Detect conflict markers from file content and update file
 */
export const detectConflictsInFile = (file: File, content: string): File => {
  const lines = content.split('\n')
  let updatedFile = file

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isConflictMarker(line)) {
      const markerType = detectMarkerType(line)
      if (markerType) {
        const conflict = createConflictMarker(i + 1, line.trim(), markerType)
        updatedFile = updatedFile.addConflict(conflict)
      }
    }
  }

  return updatedFile
}

/**
 * Check if a line contains a conflict marker
 */
const isConflictMarker = (line: string): boolean => {
  const trimmedLine = line.trimStart()
  return CONFLICT_MARKERS.some((marker) => trimmedLine.startsWith(marker))
}

/**
 * Detect the type of conflict marker in a line
 */
const detectMarkerType = (line: string): MarkerType | null => {
  const trimmedLine = line.trimStart()
  for (const marker of CONFLICT_MARKERS) {
    if (trimmedLine.startsWith(marker)) {
      return marker
    }
  }
  return null
}
