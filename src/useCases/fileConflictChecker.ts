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

/**
 * Detect conflict markers from patch content (only added lines)
 */
export const detectConflictsInPatch = (file: File): File => {
  if (!file.patch) {
    return file
  }

  const lines = file.patch.split('\n')
  let updatedFile = file

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Only check added lines (starting with '+')
    // Skip lines that are just '+' or '+++' (file header)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      // Remove the '+' prefix and check for conflict markers
      const lineContent = line.substring(1)
      if (isConflictMarker(lineContent)) {
        const markerType = detectMarkerType(lineContent)
        if (markerType) {
          // Note: line number is not meaningful in patch context
          const conflict = createConflictMarker(
            0,
            lineContent.trim(),
            markerType
          )
          updatedFile = updatedFile.addConflict(conflict)
        }
      }
    }
  }

  return updatedFile
}
