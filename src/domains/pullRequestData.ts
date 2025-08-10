/**
 * Pull request data type definition
 */
export type PullRequestData = {
  readonly owner: string
  readonly repo: string
  readonly pullNumber: number
  readonly headSha: string
  readonly getIdentifier: () => string
}

/**
 * Create a PullRequestData instance
 */
export const createPullRequestData = (
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string
): PullRequestData => ({
  owner,
  repo,
  pullNumber,
  headSha,
  getIdentifier: () => `${owner}/${repo}#${pullNumber}`
})
