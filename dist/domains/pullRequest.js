export const createPullRequest = (owner, repo, pullNumber, headSha) => ({
    owner,
    repo,
    pullNumber,
    headSha
});
export const getPullRequestIdentifier = (pr) => {
    return `${pr.owner}/${pr.repo}#${pr.pullNumber}`;
};
