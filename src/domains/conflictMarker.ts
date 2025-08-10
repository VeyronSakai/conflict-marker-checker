/**
 * Conflict marker type definition
 */
export const CONFLICT_MARKERS = ['<<<<<<<', '>>>>>>>', '======='] as const
export type MarkerType = (typeof CONFLICT_MARKERS)[number]

export type ConflictMarker = {
  readonly lineNumber: number
  readonly content: string
  readonly markerType: MarkerType
}

/**
 * Create a ConflictMarker instance
 */
export const createConflictMarker = (
  lineNumber: number,
  content: string,
  markerType: MarkerType
): ConflictMarker => ({
  lineNumber,
  content,
  markerType
})
