import { GitHubError } from "@/integrations/github/github_provider.js";
import type { GithubIssue } from "@/integrations/github/github_provider.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";

const REPO = "acme/forja";

function buildIssue(overrides: Partial<GithubIssue> = {}): GithubIssue {
    return {
        number: 1,
        title: "Issue",
        body: "",
        url: "https://github.com/acme/forja/issues/1",
        labels: [],
        state: "open",
        blockedByNumbers: [],
        ...overrides,
    };
}

describe("FakeGitHubProvider", () => {
    it("lists the issues of a repository filtered by label and state", async () => {
        const github = new FakeGitHubProvider();
        github.addIssue(REPO, buildIssue({ number: 1, labels: ["Sandcastle"] }));
        github.addIssue(REPO, buildIssue({ number: 2, labels: ["Sandcastle"], state: "closed" }));
        github.addIssue(REPO, buildIssue({ number: 3 }));
        github.addIssue("acme/other", buildIssue({ number: 4, labels: ["Sandcastle"] }));

        const issues = await github.listIssues(REPO, {
            label: "Sandcastle",
            state: "open",
            limit: 10,
        });

        expect(issues.map((issue) => issue.number)).toEqual([1]);
    });

    it("records comments and closes issues", async () => {
        const github = new FakeGitHubProvider();
        github.addIssue(REPO, buildIssue({ number: 7 }));

        await github.comment(REPO, 7, "Pronto");
        await github.closeIssue(REPO, 7);

        expect(github.comments).toEqual([{ repo: REPO, issueNumber: 7, body: "Pronto" }]);
        expect((await github.getIssue(REPO, 7)).state).toBe("closed");
    });

    it("records comments on pull requests, which GitHub numbers like issues", async () => {
        const github = new FakeGitHubProvider();
        const input = { head: "feature", base: "main", title: "T", body: "B", draft: false };
        const pullRequest = await github.createPullRequest(REPO, input);

        await github.comment(REPO, pullRequest.number, "Atualizado");

        expect(github.comments).toEqual([
            { repo: REPO, issueNumber: pullRequest.number, body: "Atualizado" },
        ]);
    });

    it("rejects reading an unknown issue with a GitHubError", async () => {
        const github = new FakeGitHubProvider();

        await expect(github.getIssue(REPO, 99)).rejects.toBeInstanceOf(GitHubError);
    });

    it("finds a created pull request by its head branch", async () => {
        const github = new FakeGitHubProvider();
        const input = { head: "feature", base: "main", title: "T", body: "B", draft: false };

        const created = await github.createPullRequest(REPO, input);

        expect(await github.findPullRequestByHead(REPO, "feature")).toEqual(created);
        expect(await github.findPullRequestByHead(REPO, "other")).toBeUndefined();
    });
});
