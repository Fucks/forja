import { resolveWith } from "@/lib/resolve_with.js";
import { GitHubError } from "@/integrations/github/github_provider.js";
import type {
    CreatePullRequestInput,
    GithubIssue,
    GitHubProvider,
    GithubPullRequest,
    ListIssuesOptions,
} from "@/integrations/github/github_provider.js";

export interface FakeComment {
    repo: string;
    issueNumber: number;
    body: string;
}

interface StoredIssue {
    repo: string;
    issue: GithubIssue;
}

interface StoredPullRequest {
    repo: string;
    pullRequest: GithubPullRequest;
}

const FIRST_PULL_REQUEST_NUMBER = 1000;
const ISSUE_NOT_FOUND_STDERR = "GraphQL: Could not resolve to an issue";

export class FakeGitHubProvider implements GitHubProvider {
    readonly comments: FakeComment[] = [];
    readonly createdPullRequests: CreatePullRequestInput[] = [];
    private issues: StoredIssue[] = [];
    private pullRequests: StoredPullRequest[] = [];

    addIssue(repo: string, issue: GithubIssue): void {
        this.issues = [...this.issues, { repo, issue }];
    }

    addPullRequest(repo: string, pullRequest: GithubPullRequest): void {
        this.pullRequests = [...this.pullRequests, { repo, pullRequest }];
    }

    listIssues(repo: string, opts: ListIssuesOptions): Promise<GithubIssue[]> {
        const matchingIssues = this.issuesOf(repo)
            .filter((issue) => opts.state === "all" || issue.state === opts.state)
            .filter((issue) => opts.label === undefined || issue.labels.includes(opts.label))
            .slice(0, opts.limit);

        return Promise.resolve(matchingIssues);
    }

    getIssue(repo: string, number: number): Promise<GithubIssue> {
        return resolveWith(() => this.findIssue(repo, number));
    }

    comment(repo: string, number: number, body: string): Promise<void> {
        return resolveWith(() => {
            if (!this.hasPullRequest(repo, number)) {
                this.findIssue(repo, number);
            }
            this.comments.push({ repo, issueNumber: number, body });
        });
    }

    closeIssue(repo: string, number: number): Promise<void> {
        return resolveWith(() => this.markIssueClosed(repo, number));
    }

    createPullRequest(repo: string, input: CreatePullRequestInput): Promise<GithubPullRequest> {
        const number = FIRST_PULL_REQUEST_NUMBER + this.pullRequests.length;
        const pullRequest: GithubPullRequest = {
            number,
            url: `https://github.com/${repo}/pull/${number}`,
            state: "open",
            headBranch: input.head,
            baseBranch: input.base,
        };
        this.createdPullRequests.push(input);
        this.addPullRequest(repo, pullRequest);
        return Promise.resolve(pullRequest);
    }

    findPullRequestByHead(repo: string, head: string): Promise<GithubPullRequest | undefined> {
        const pullRequest = this.pullRequests.findLast(
            (stored) => stored.repo === repo && stored.pullRequest.headBranch === head,
        );
        return Promise.resolve(pullRequest?.pullRequest);
    }

    private markIssueClosed(repo: string, number: number): void {
        const closedIssue: GithubIssue = { ...this.findIssue(repo, number), state: "closed" };
        this.issues = this.issues.map((stored) =>
            isIssue(stored, repo, number) ? { repo, issue: closedIssue } : stored,
        );
    }

    private hasPullRequest(repo: string, number: number): boolean {
        return this.pullRequests.some(
            (stored) => stored.repo === repo && stored.pullRequest.number === number,
        );
    }

    private issuesOf(repo: string): GithubIssue[] {
        return this.issues.filter((stored) => stored.repo === repo).map((stored) => stored.issue);
    }

    private findIssue(repo: string, number: number): GithubIssue {
        const stored = this.issues.find((candidate) => isIssue(candidate, repo, number));
        if (!stored) {
            throw new GitHubError(`Issue #${number} não encontrada`, ISSUE_NOT_FOUND_STDERR);
        }

        return stored.issue;
    }
}

function isIssue(stored: StoredIssue, repo: string, number: number): boolean {
    return stored.repo === repo && stored.issue.number === number;
}
