import { z } from "zod";

import type {
    GithubIssue,
    GithubIssueState,
    GithubPullRequest,
    GithubPullRequestState,
} from "@/integrations/github/github_provider.js";

export const GH_ISSUE_FIELDS = "number,title,body,url,labels,state";
export const GH_PULL_REQUEST_FIELDS = "number,url,state,headRefName,baseRefName,mergedAt";

export const ghIssueSchema = z.object({
    number: z.number().int(),
    title: z.string(),
    body: z.string(),
    url: z.string(),
    labels: z.array(z.object({ name: z.string() })),
    state: z.enum(["OPEN", "CLOSED"]),
});

export const ghPullRequestSchema = z.object({
    number: z.number().int(),
    url: z.string(),
    state: z.enum(["OPEN", "CLOSED", "MERGED"]),
    headRefName: z.string(),
    baseRefName: z.string(),
    mergedAt: z.string().nullish(),
});

export type GhIssue = z.infer<typeof ghIssueSchema>;
type GhPullRequest = z.infer<typeof ghPullRequestSchema>;

const ISSUE_STATES: Record<GhIssue["state"], GithubIssueState> = {
    OPEN: "open",
    CLOSED: "closed",
};

const PULL_REQUEST_STATES: Record<GhPullRequest["state"], GithubPullRequestState> = {
    OPEN: "open",
    CLOSED: "closed",
    MERGED: "merged",
};

export function toGithubIssue(ghIssue: GhIssue, blockedByNumbers: number[]): GithubIssue {
    return {
        number: ghIssue.number,
        title: ghIssue.title,
        body: ghIssue.body,
        url: ghIssue.url,
        labels: ghIssue.labels.map((label) => label.name),
        state: ISSUE_STATES[ghIssue.state],
        blockedByNumbers,
    };
}

export function toGithubPullRequest(ghPullRequest: GhPullRequest): GithubPullRequest {
    return {
        number: ghPullRequest.number,
        url: ghPullRequest.url,
        state: pullRequestState(ghPullRequest),
        headBranch: ghPullRequest.headRefName,
        baseBranch: ghPullRequest.baseRefName,
    };
}

function pullRequestState(ghPullRequest: GhPullRequest): GithubPullRequestState {
    if (ghPullRequest.mergedAt) {
        return "merged";
    }

    return PULL_REQUEST_STATES[ghPullRequest.state];
}
