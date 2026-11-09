import { createGhCliGitHubProvider } from "@/integrations/github/gh_cli_github_provider.js";
import { GitHubError } from "@/integrations/github/github_provider.js";
import { FakeCommandRunner } from "@/test/fakes/fake_command_runner.js";

const REPO = "acme/forja";
const ENV = { GH_TOKEN: "token-123" };
const PR_URL = "https://github.com/acme/forja/pull/42";
const NOT_FOUND_STDERR = "gh: Not Found (HTTP 404)";

const ISSUE_17_JSON = {
    number: 17,
    title: "Cadastrar projeto",
    body: "Bloqueada por: #3, #5",
    url: "https://github.com/acme/forja/issues/17",
    labels: [{ id: "LA_1", name: "Sandcastle", description: "", color: "ededed" }],
    state: "OPEN",
};

const ISSUE_18_JSON = {
    number: 18,
    title: "Listar issues",
    body: "Sem dependências",
    url: "https://github.com/acme/forja/issues/18",
    labels: [],
    state: "CLOSED",
};

const OPEN_PR_JSON = {
    number: 42,
    url: PR_URL,
    state: "OPEN",
    headRefName: "sandcastle/issue-17",
    baseRefName: "development",
    mergedAt: null,
};

function nativeDependenciesArgs(issueNumber: number): string[] {
    return [
        "api",
        `repos/${REPO}/issues/${issueNumber}/dependencies/blocked_by`,
        "--jq",
        ".[].number",
    ];
}

function setUp() {
    const commands = new FakeCommandRunner();
    const github = createGhCliGitHubProvider({ commands, env: ENV });
    const scriptGh = (args: string[], stdout: unknown) =>
        commands.when("gh", args).returns({ stdout: JSON.stringify(stdout) });
    const scriptNativeDependencies = (issueNumber: number, blockedBy: number[]) =>
        commands
            .when("gh", nativeDependenciesArgs(issueNumber))
            .returns({ stdout: blockedBy.join("\n") });
    const scriptNativeDependenciesNotFound = (issueNumber: number) =>
        commands
            .when("gh", nativeDependenciesArgs(issueNumber))
            .returns({ exitCode: 1, stderr: NOT_FOUND_STDERR });

    return {
        commands,
        github,
        scriptGh,
        scriptNativeDependencies,
        scriptNativeDependenciesNotFound,
    };
}

function isGhSubcommand(group: string, action: string) {
    return (args: string[]) => args[0] === group && args[1] === action;
}

describe("createGhCliGitHubProvider", () => {
    describe("listIssues", () => {
        it("interprets the gh JSON into issues with their body dependencies", async () => {
            const { github, commands, scriptNativeDependenciesNotFound } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "list"))
                .returns({ stdout: JSON.stringify([ISSUE_17_JSON, ISSUE_18_JSON]) });
            scriptNativeDependenciesNotFound(17);
            scriptNativeDependenciesNotFound(18);

            const issues = await github.listIssues(REPO, { state: "all", limit: 50 });

            expect(issues).toEqual([
                {
                    number: 17,
                    title: "Cadastrar projeto",
                    body: "Bloqueada por: #3, #5",
                    url: "https://github.com/acme/forja/issues/17",
                    labels: ["Sandcastle"],
                    state: "open",
                    blockedByNumbers: [3, 5],
                },
                {
                    number: 18,
                    title: "Listar issues",
                    body: "Sem dependências",
                    url: "https://github.com/acme/forja/issues/18",
                    labels: [],
                    state: "closed",
                    blockedByNumbers: [],
                },
            ]);
        });

        it("filters by label, state and limit", async () => {
            const { github, commands, scriptGh } = setUp();
            const listArgs = [
                "issue",
                "list",
                "--repo",
                REPO,
                "--state",
                "open",
                "--limit",
                "20",
                "--json",
                "number,title,body,url,labels,state",
                "--label",
                "Sandcastle",
            ];
            scriptGh(listArgs, []);

            await github.listIssues(REPO, { label: "Sandcastle", state: "open", limit: 20 });

            expect(commands.calls[0]?.args).toEqual(listArgs);
        });

        it("merges native dependencies with the body ones without duplicates", async () => {
            const { github, commands, scriptNativeDependencies } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "list"))
                .returns({ stdout: JSON.stringify([ISSUE_17_JSON]) });
            scriptNativeDependencies(17, [5, 9]);

            const [issue] = await github.listIssues(REPO, { state: "open", limit: 10 });

            expect(issue?.blockedByNumbers).toEqual([3, 5, 9]);
        });

        it("keeps listing with the body dependencies when native ones are not found", async () => {
            const { github, commands, scriptNativeDependenciesNotFound } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "list"))
                .returns({ stdout: JSON.stringify([ISSUE_17_JSON]) });
            scriptNativeDependenciesNotFound(17);

            const [issue] = await github.listIssues(REPO, { state: "open", limit: 10 });

            expect(issue?.blockedByNumbers).toEqual([3, 5]);
        });

        it("fails when reading native dependencies fails for another reason", async () => {
            const { github, commands } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "list"))
                .returns({ stdout: JSON.stringify([ISSUE_17_JSON]) });
            commands
                .when("gh", nativeDependenciesArgs(17))
                .returns({ exitCode: 1, stderr: "gh: Bad credentials (HTTP 401)" });

            const listing = github.listIssues(REPO, { state: "open", limit: 10 });

            await expect(listing).rejects.toBeInstanceOf(GitHubError);
        });

        it("passes the configured environment to every gh call", async () => {
            const { github, commands, scriptNativeDependenciesNotFound } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "list"))
                .returns({ stdout: JSON.stringify([ISSUE_17_JSON]) });
            scriptNativeDependenciesNotFound(17);

            await github.listIssues(REPO, { state: "open", limit: 10 });

            expect(commands.calls).toHaveLength(2);
            commands.calls.forEach((call) => expect(call.options.env).toEqual(ENV));
        });
    });

    describe("getIssue", () => {
        it("reads one issue with its dependencies", async () => {
            const { github, scriptGh, scriptNativeDependencies } = setUp();
            scriptGh(
                [
                    "issue",
                    "view",
                    "17",
                    "--repo",
                    REPO,
                    "--json",
                    "number,title,body,url,labels,state",
                ],
                ISSUE_17_JSON,
            );
            scriptNativeDependencies(17, [8]);

            const issue = await github.getIssue(REPO, 17);

            expect(issue.title).toBe("Cadastrar projeto");
            expect(issue.blockedByNumbers).toEqual([3, 5, 8]);
        });
    });

    describe("comment", () => {
        it("sends the comment body through stdin", async () => {
            const { github, commands } = setUp();
            const commentArgs = ["issue", "comment", "17", "--repo", REPO, "--body-file", "-"];
            commands.when("gh", commentArgs).returns({});
            const body = "Comentário com `crases`, $variáveis e\nvárias linhas";

            await github.comment(REPO, 17, body);

            expect(commands.calls[0]?.args).toEqual(commentArgs);
            expect(commands.calls[0]?.options.input).toBe(body);
        });
    });

    describe("closeIssue", () => {
        it("closes the issue", async () => {
            const { github, commands } = setUp();
            const closeArgs = ["issue", "close", "17", "--repo", REPO];
            commands.when("gh", closeArgs).returns({});

            await github.closeIssue(REPO, 17);

            expect(commands.calls[0]?.args).toEqual(closeArgs);
        });
    });

    describe("createPullRequest", () => {
        const input = {
            head: "sandcastle/issue-17",
            base: "development",
            title: "Cadastrar projeto",
            body: "Closes #17",
            draft: false,
        };
        const createArgs = [
            "pr",
            "create",
            "--repo",
            REPO,
            "--head",
            input.head,
            "--base",
            input.base,
            "--title",
            input.title,
            "--body-file",
            "-",
        ];

        it("sends the body through stdin and reads the created pull request by its URL", async () => {
            const { github, commands, scriptGh } = setUp();
            commands.when("gh", createArgs).returns({ stdout: `${PR_URL}\n` });
            scriptGh(
                [
                    "pr",
                    "view",
                    PR_URL,
                    "--json",
                    "number,url,state,headRefName,baseRefName,mergedAt",
                ],
                OPEN_PR_JSON,
            );

            const pullRequest = await github.createPullRequest(REPO, input);

            expect(commands.calls[0]?.options.input).toBe("Closes #17");
            expect(pullRequest).toEqual({
                number: 42,
                url: PR_URL,
                state: "open",
                headBranch: "sandcastle/issue-17",
                baseBranch: "development",
            });
        });

        it("opens a draft when asked", async () => {
            const { github, commands } = setUp();
            commands.when("gh", [...createArgs, "--draft"]).returns({ stdout: PR_URL });
            commands
                .when("gh", isGhSubcommand("pr", "view"))
                .returns({ stdout: JSON.stringify(OPEN_PR_JSON) });

            await github.createPullRequest(REPO, { ...input, draft: true });

            expect(commands.calls[0]?.args).toEqual([...createArgs, "--draft"]);
        });
    });

    describe("findPullRequestByHead", () => {
        const listArgs = [
            "pr",
            "list",
            "--repo",
            REPO,
            "--head",
            "sandcastle/issue-17",
            "--state",
            "all",
            "--json",
            "number,url,state,headRefName,baseRefName,mergedAt",
        ];

        it("reports merged when the pull request has mergedAt", async () => {
            const { github, scriptGh } = setUp();
            scriptGh(listArgs, [
                { ...OPEN_PR_JSON, state: "MERGED", mergedAt: "2026-11-08T12:00:00Z" },
            ]);

            const pullRequest = await github.findPullRequestByHead(REPO, "sandcastle/issue-17");

            expect(pullRequest?.state).toBe("merged");
        });

        it("reports closed when the pull request was closed without merging", async () => {
            const { github, scriptGh } = setUp();
            scriptGh(listArgs, [{ ...OPEN_PR_JSON, state: "CLOSED" }]);

            const pullRequest = await github.findPullRequestByHead(REPO, "sandcastle/issue-17");

            expect(pullRequest?.state).toBe("closed");
        });

        it("returns undefined when the branch has no pull request", async () => {
            const { github, scriptGh } = setUp();
            scriptGh(listArgs, []);

            const pullRequest = await github.findPullRequestByHead(REPO, "sandcastle/issue-17");

            expect(pullRequest).toBeUndefined();
        });
    });

    describe("failures", () => {
        it("turns a failed gh command into a GitHubError with its stderr", async () => {
            const { github, commands } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "close"))
                .returns({ exitCode: 1, stderr: "could not resolve to an issue" });

            const closing = github.closeIssue(REPO, 999);

            await expect(closing).rejects.toMatchObject({
                name: "GitHubError",
                stderr: "could not resolve to an issue",
            });
        });

        it("turns unexpected gh JSON into a GitHubError", async () => {
            const { github, commands } = setUp();
            commands
                .when("gh", isGhSubcommand("issue", "view"))
                .returns({ stdout: JSON.stringify({ number: "dezessete" }) });

            const reading = github.getIssue(REPO, 17);

            await expect(reading).rejects.toBeInstanceOf(GitHubError);
        });

        it("turns output that is not JSON into a GitHubError", async () => {
            const { github, commands } = setUp();
            commands.when("gh", isGhSubcommand("pr", "list")).returns({ stdout: "not json" });

            const finding = github.findPullRequestByHead(REPO, "sandcastle/issue-17");

            await expect(finding).rejects.toBeInstanceOf(GitHubError);
        });
    });
});
