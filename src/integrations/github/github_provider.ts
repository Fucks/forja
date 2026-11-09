export type GithubIssueState = "open" | "closed";
export type GithubPullRequestState = "open" | "closed" | "merged";
export type GithubIssueStateFilter = GithubIssueState | "all";

export interface GithubIssue {
    number: number;
    title: string;
    body: string;
    url: string;
    labels: string[];
    state: GithubIssueState;
    blockedByNumbers: number[];
}

export interface GithubPullRequest {
    number: number;
    url: string;
    state: GithubPullRequestState;
    headBranch: string;
    baseBranch: string;
}

export interface ListIssuesOptions {
    label?: string;
    state: GithubIssueStateFilter;
    limit: number;
}

export interface CreatePullRequestInput {
    head: string;
    base: string;
    title: string;
    body: string;
    draft: boolean;
}

export interface GitHubProvider {
    listIssues(repo: string, opts: ListIssuesOptions): Promise<GithubIssue[]>;
    getIssue(repo: string, number: number): Promise<GithubIssue>;
    comment(repo: string, number: number, body: string): Promise<void>;
    closeIssue(repo: string, number: number): Promise<void>;
    createPullRequest(repo: string, input: CreatePullRequestInput): Promise<GithubPullRequest>;
    findPullRequestByHead(repo: string, head: string): Promise<GithubPullRequest | undefined>;
}

/** A `gh` command failed or answered with output Forja could not understand. */
export class GitHubError extends Error {
    constructor(
        message: string,
        readonly stderr: string,
    ) {
        super(message);
        this.name = "GitHubError";
    }
}
