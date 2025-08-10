/**
 * Output port type definition
 */
export type OutputPort = {
  setConflictsFound(found: boolean): void
  setConflictedFiles(files: string[]): void
  reportFailure(message: string): void
}
