import {
    createGitExecutor,
    GitNodeWithoutItemError,
    ProjectWithoutGithubRepoError,
} from "@/server/runtime/executors/git_executor.js";
import { REBASER_MAX_ITERATIONS } from "@/server/runtime/executors/rebaser_node.js";
import type { NodeExecutionContext, NodeExecutionResult } from "@/server/runtime/node_executors.js";
import { gitConfigSchema, type GitConfig } from "@/shared/node_configs/git_config.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildNodeExecutionContext } from "@/test/factories/node_execution_context_factory.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { FakeAgentRuntime } from "@/test/fakes/fake_agent_runtime.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { FakeGitProvider } from "@/test/fakes/fake_git_provider.js";

const REPO = "Fucks/forja";
const REPO_PATH = "/repos/forja";
const BRANCH = "forja/issue-7";
const REBASE_COMMAND = "git fetch origin 'main' && git rebase 'origin/main'";
const CONFLICTED_FILES_COMMAND = "git diff --name-only --diff-filter=U";
const REBASE_FINISHED_COMMAND =
    'test ! -d "$(git rev-parse --git-path rebase-merge)" && ' +
    'test ! -d "$(git rev-parse --git-path rebase-apply)"';
const FAILED_EXEC = { exitCode: 1, stdoutTail: "CONFLICT (content): Merge conflict in src/a.ts" };
const GITHUB_TOKEN = "ghp_project_token";
const TOKEN_ENV = { GH_TOKEN: GITHUB_TOKEN };
const TIME_STEP_MS = 1_000;
const MAX_TIME_STEPS = 100;

const ISSUE: WorkItemSnapshot = {
    id: "wi_7",
    title: "Login com Google",
    body: "",
    number: 7,
    url: `https://github.com/${REPO}/issues/7`,
    labels: [],
    branch: BRANCH,
};

describe("git executor", () => {
    describe("rebase", () => {
        it("does not call the agent when the branch rebases cleanly", async () => {
            const bed = createGitBed({ action: "rebase" });

            const result = await bed.execute();

            expect(bed.runtime.requests).toEqual([]);
            expect(result.outputs).toEqual({ result: { branch: BRANCH, pushed: false } });
        });

        it("runs the rebaser agent in the workspace when the rebase stops on conflicts", async () => {
            const bed = createGitBed({ action: "rebase" });
            bed.runtime.scriptExec(REBASE_COMMAND, FAILED_EXEC);

            await bed.execute();

            expect(bed.runtime.requests).toHaveLength(1);
            expect(bed.runtime.requests[0]).toMatchObject({
                maxIterations: REBASER_MAX_ITERATIONS,
                model: bed.context.settings.defaultModel,
                effort: bed.context.settings.defaultEffort,
            });
            expect(bed.runtime.requests[0]?.prompt).toContain(`O branch \`${BRANCH}\``);
        });

        it("rebases onto the base branch of the node when it has one", async () => {
            const bed = createGitBed({ action: "rebase", baseBranch: "development" });
            bed.runtime.scriptExec(
                "git fetch origin 'development' && git rebase 'origin/development'",
                FAILED_EXEC,
            );

            await bed.execute();

            expect(bed.runtime.requests[0]?.prompt).toContain("sobre `origin/development`");
        });

        it("fails with the files still in conflict after the agent", async () => {
            const bed = createGitBed({ action: "rebase" });
            bed.runtime.scriptExec(REBASE_COMMAND, FAILED_EXEC);
            bed.runtime.scriptExec(CONFLICTED_FILES_COMMAND, {
                exitCode: 0,
                stdoutTail: "src/a.ts\n",
            });

            const executing = bed.execute();

            await expect(executing).rejects.toThrow(/conflitos não resolvidos: src\/a\.ts/);
        });

        it("fails when the agent leaves the rebase unfinished", async () => {
            const bed = createGitBed({ action: "rebase" });
            bed.runtime.scriptExec(REBASE_COMMAND, FAILED_EXEC);
            bed.runtime.scriptExec(REBASE_FINISHED_COMMAND, { exitCode: 1, stdoutTail: "" });

            const executing = bed.execute();

            await expect(executing).rejects.toThrow(/conflitos não resolvidos/);
        });

        it("reports the tokens the rebaser agent spent", async () => {
            const bed = createGitBed({ action: "rebase" });
            bed.runtime.scriptExec(REBASE_COMMAND, FAILED_EXEC);

            const result = await bed.execute();

            expect(result.usage?.model).toBe(bed.context.settings.defaultModel);
        });
    });

    describe("push", () => {
        it("pushes the branch from the project repository with the GitHub token", async () => {
            const bed = createGitBed({ action: "push" });
            bed.git.setCommitsAhead(BRANCH, 2);
            bed.context.credentials = { ...bed.context.credentials, githubToken: GITHUB_TOKEN };

            const result = await bed.execute();

            expect(bed.git.pushes).toMatchObject([
                { root: REPO_PATH, branch: BRANCH, env: TOKEN_ENV },
            ]);
            expect(result.outputs).toEqual({ result: { branch: BRANCH, pushed: true } });
        });

        it("records the branch as an artifact", async () => {
            const bed = createGitBed({ action: "push" });
            bed.git.setCommitsAhead(BRANCH, 2);

            const result = await bed.execute();

            expect(result.artifacts).toEqual([{ name: "branch", kind: "branch", value: BRANCH }]);
        });

        it("does not push a branch without commits ahead of the base", async () => {
            const bed = createGitBed({ action: "push" });

            const result = await bed.execute();

            expect(bed.git.pushes).toEqual([]);
            expect(result.outputs).toEqual({ result: { branch: BRANCH, pushed: false } });
        });

        it("fails clearly without a work item", async () => {
            const bed = createGitBed({ action: "push" }, { item: null });

            const executing = bed.execute();

            await expect(executing).rejects.toThrow(GitNodeWithoutItemError);
        });
    });

    describe("open_pr", () => {
        it("pushes the branch and opens a pull request to the base branch", async () => {
            const bed = createGitBed({ action: "open_pr", draft: true });
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            expect(bed.git.pushes).toHaveLength(1);
            expect(bed.github.createdPullRequests).toEqual([
                expect.objectContaining({ head: BRANCH, base: "main", draft: true }),
            ]);
        });

        it("titles the pull request with the issue title and number", async () => {
            const bed = createGitBed({ action: "open_pr" });
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            expect(bed.github.createdPullRequests[0]?.title).toBe("Login com Google (#7)");
        });

        it("writes the body from the input port, closing the issue and signed by Forja", async () => {
            const summary = "Resumo do revisor";
            const bed = createGitBed(
                { action: "open_pr", bodyFrom: "inputs.body" },
                { inputs: { body: summary } },
            );
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            expect(bed.github.createdPullRequests[0]?.body).toBe(
                `${summary}\n\nCloses #7\n\n🤖 Gerado pela Forja`,
            );
        });

        it("writes the body from a field of an input port", async () => {
            const evidence = { checksPassed: true, body: "Evidências da entrega" };
            const bed = createGitBed(
                { action: "open_pr", bodyFrom: "inputs.evidence.body" },
                { inputs: { evidence } },
            );
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            expect(createdBody(bed)).toMatch(/^Evidências da entrega\n\nCloses #7/);
        });

        it("writes the body from the output of an upstream node read under nodes", async () => {
            const bed = createGitBed(
                { action: "open_pr", bodyFrom: "nodes.reviewer.summary" },
                { upstreamOutputs: { reviewer: { summary: "Resumo do Reviewer" } } },
            );
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            expect(createdBody(bed)).toMatch(/^Resumo do Reviewer\n\nCloses #7/);
        });

        it("writes a default summary when the input port has no body", async () => {
            const bed = createGitBed({ action: "open_pr", bodyFrom: "inputs.body" });
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            expect(bed.github.createdPullRequests[0]?.body).toMatch(
                /^Alterações feitas pela Forja para "Login com Google"\./,
            );
        });

        it("does not close anything for a local item, which has no number", async () => {
            const localItem = { ...ISSUE, number: undefined, url: undefined };
            const bed = createGitBed({ action: "open_pr" }, { item: localItem });
            bed.git.setCommitsAhead(BRANCH, 2);

            await bed.execute();

            const [pullRequest] = bed.github.createdPullRequests;
            expect(pullRequest?.title).toBe("Login com Google");
            expect(pullRequest?.body).not.toContain("Closes");
        });

        it("records the pull request URL as an artifact and in the result", async () => {
            const bed = createGitBed({ action: "open_pr" });
            bed.git.setCommitsAhead(BRANCH, 2);

            const result = await bed.execute();

            const prUrl = (await bed.github.findPullRequestByHead(REPO, BRANCH))?.url;
            expect(result.artifacts).toContainEqual({
                name: "pr_url",
                kind: "pr_url",
                value: prUrl,
            });
            expect(result.outputs).toEqual({ result: { branch: BRANCH, prUrl, pushed: true } });
        });

        it("reuses the open pull request of the branch and comments the new body on it", async () => {
            const bed = createGitBed({ action: "open_pr" });
            bed.git.setCommitsAhead(BRANCH, 2);
            const first = await bed.execute();

            const second = await bed.execute();

            const pullRequest = await bed.github.findPullRequestByHead(REPO, BRANCH);
            expect(bed.github.createdPullRequests).toHaveLength(1);
            expect(second.outputs).toEqual(first.outputs);
            expect(bed.github.comments).toEqual([
                { repo: REPO, issueNumber: pullRequest?.number, body: createdBody(bed) },
            ]);
        });

        it("opens a new pull request when the earlier one of the branch is closed", async () => {
            const bed = createGitBed({ action: "open_pr" });
            bed.git.setCommitsAhead(BRANCH, 2);
            bed.github.addPullRequest(REPO, {
                number: 1,
                url: `https://github.com/${REPO}/pull/1`,
                state: "closed",
                headBranch: BRANCH,
                baseBranch: "main",
            });

            await bed.execute();

            expect(bed.github.createdPullRequests).toHaveLength(1);
        });

        it("opens no pull request for a branch without commits ahead of the base", async () => {
            const bed = createGitBed({ action: "open_pr" });

            const result = await bed.execute();

            expect(bed.github.createdPullRequests).toEqual([]);
            expect(result.outputs).toEqual({ result: { branch: BRANCH, pushed: false } });
            expect(result.artifacts).toEqual([{ name: "branch", kind: "branch", value: BRANCH }]);
        });

        it("needs no GitHub repository for a branch without commits ahead of the base", async () => {
            const bed = createGitBed({ action: "open_pr" }, { githubRepo: undefined });

            const result = await bed.execute();

            expect(result.outputs).toEqual({ result: { branch: BRANCH, pushed: false } });
        });

        it("fails clearly when the project has no GitHub repository", async () => {
            const bed = createGitBed({ action: "open_pr" }, { githubRepo: undefined });
            bed.git.setCommitsAhead(BRANCH, 2);

            const executing = bed.execute();

            await expect(executing).rejects.toThrow(ProjectWithoutGithubRepoError);
            expect(bed.git.pushes).toEqual([]);
        });
    });
});

interface GitBed {
    runtime: FakeAgentRuntime;
    git: FakeGitProvider;
    github: FakeGitHubProvider;
    context: NodeExecutionContext;
    execute(): Promise<NodeExecutionResult>;
}

interface GitBedOptions {
    // null runs the node without a work item.
    item?: WorkItemSnapshot | null;
    inputs?: Record<string, unknown>;
    upstreamOutputs?: Record<string, Record<string, unknown>>;
    githubRepo?: string | undefined;
}

function createGitBed(config: Partial<GitConfig>, options: GitBedOptions = {}): GitBed {
    const clock = new FakeClock();
    const runtime = new FakeAgentRuntime({ clock });
    const git = new FakeGitProvider();
    const github = new FakeGitHubProvider();
    const node = { ...createNodeOfType("git", "git", { x: 0, y: 0 }), config: parseGit(config) };
    const githubRepo = "githubRepo" in options ? options.githubRepo : REPO;
    const context = buildNodeExecutionContext(node, {
        item: options.item === null ? undefined : (options.item ?? ISSUE),
        inputs: options.inputs ?? {},
        upstreamOutputs: options.upstreamOutputs ?? {},
        project: buildProject({ repoPath: REPO_PATH, baseBranch: "main", githubRepo }),
        runtime,
        clock,
    });
    const executor = createGitExecutor({ git, githubOf: () => Promise.resolve(github) });

    return {
        runtime,
        git,
        github,
        context,
        execute: () => advanceClockUntilSettled(clock, executor(context)),
    };
}

function createdBody(bed: GitBed): string | undefined {
    return bed.github.createdPullRequests[0]?.body;
}

function parseGit(config: Partial<GitConfig>): GitConfig {
    return gitConfigSchema.parse(config);
}

// The fake agent runs on the fake clock, so time has to pass for the rebaser to finish.
async function advanceClockUntilSettled<Result>(
    clock: FakeClock,
    pending: Promise<Result>,
): Promise<Result> {
    let isSettled = false;
    pending.then(
        () => (isSettled = true),
        () => (isSettled = true),
    );
    for (let step = 0; step < MAX_TIME_STEPS && !isSettled; step += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        clock.advance(TIME_STEP_MS);
    }

    return pending;
}
