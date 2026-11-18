import { findGroup, findNode } from "@/engine/graph_queries.js";
import { sandcastlePipelineTemplate } from "@/server/flows/templates/sandcastle_pipeline.js";
import { CODEGRAPH_PRESET_ID } from "@/server/tool_profiles/tool_profile_presets.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { ExecutorTestBed, TEST_GITHUB_REPO } from "@/test/executor_test_bed.js";
import { buildGithubIssue } from "@/test/factories/work_item_factory.js";
import { FakeGitHubProvider } from "@/test/fakes/fake_github_provider.js";
import { agentPromptOf, publishErrorsOf } from "@/test/flow_template_inspection.js";

const SANDCASTLE_LABEL = "Sandcastle";
const AGENT_DURATION_MS = 60_000;
const FAILED_CHECKS_SUMMARY = "npm run test falhou em 2 testes";
const IMPLEMENTER_PROMPT_START = "Implement issue #";

describe("Pipeline Sandcastle template", () => {
    let graph: FlowGraph;

    beforeEach(() => {
        graph = sandcastlePipelineTemplate.build();
    });

    it("publishes without errors", () => {
        expect(publishErrorsOf(graph)).toEqual([]);
    });

    it("takes up to 10 unblocked issues labeled Sandcastle from GitHub", () => {
        expect(findNode(graph, "source")).toMatchObject({
            config: { provider: "github", label: "Sandcastle", skipBlocked: true, limit: 10 },
        });
    });

    it("implements and reviews one item at a time", () => {
        expect(findGroup(graph, "implement_and_review")).toMatchObject({
            kind: "map",
            label: "Implementar e revisar",
            config: { concurrency: 1 },
        });
    });

    it("runs the steps of the Sandcastle pipeline in order for each item", () => {
        expect(graph.edges.map((edge) => edge.id)).toEqual([
            "trigger.items->source.trigger",
            "source.items->implementer.item",
            "implementer.result->has_commits.value",
            "has_commits.true->reviewer.implementation",
            "has_commits.false->needs_human_without_commits.implementation",
            "reviewer.summary->rebase.review",
            "rebase.result->evidence.rebase",
            "evidence.result->checks_passed.value",
            "checks_passed.true->open_pr.evidence",
            "checks_passed.false->needs_human_failed_checks.evidence",
            "open_pr.result->output.pullRequest",
        ]);
    });

    it("lets the implementer iterate on the item branch with the codegraph tools", () => {
        expect(findNode(graph, "implementer")).toMatchObject({
            label: "Implementer",
            config: {
                workspace: "item",
                maxIterations: 100,
                idleTimeoutMinutes: 15,
                completionSignal: "<promise>COMPLETE</promise>",
                toolProfileId: CODEGRAPH_PRESET_ID,
            },
        });
    });

    it("gives the implementer the issue, its branch and the base branch", () => {
        const prompt = agentPromptOf(graph, "implementer");

        expect(prompt).toContain("Implement issue #{{item.number}}: {{item.title}}");
        expect(prompt).toContain(
            "`{{item.branch}}`, which will be merged into `{{project.baseBranch}}`",
        );
        expect(prompt).toContain("!`cat .plans/issue-{{item.number}}.md");
    });

    it("sends an item without commits to a human before the review", () => {
        expect(findNode(graph, "has_commits")).toMatchObject({
            label: "Fez commits?",
            config: { mode: "if", condition: { op: "gt", path: "inputs.value.commits", value: 0 } },
        });
        expect(findNode(graph, "needs_human_without_commits")).toMatchObject({
            config: { moveItemTo: "needs_human", commentOnIssue: true },
        });
    });

    it("reviews the branch in a single iteration and rebases it afterwards", () => {
        expect(findNode(graph, "reviewer")).toMatchObject({
            label: "Reviewer",
            config: { maxIterations: 1, workspace: "item" },
        });
        expect(agentPromptOf(graph, "reviewer")).toContain("git diff {{project.baseBranch}}...");
        expect(findNode(graph, "rebase")).toMatchObject({
            type: "git",
            config: { action: "rebase" },
        });
    });

    it("asks the evidence agent for the checks result and the pull request body", () => {
        expect(findNode(graph, "evidence")).toMatchObject({
            label: "Evidence",
            config: {
                outputSchema: {
                    properties: {
                        checksPassed: { type: "boolean" },
                        failureSummary: { type: "string" },
                        body: { type: "string" },
                    },
                    required: ["checksPassed", "body"],
                },
            },
        });
        expect(agentPromptOf(graph, "evidence")).toContain(".pr-evidence/screenshots/");
    });

    it("opens the pull request with the evidence body only when the checks passed", () => {
        expect(findNode(graph, "checks_passed")).toMatchObject({
            label: "Checks passaram?",
            config: {
                mode: "if",
                condition: { op: "eq", path: "inputs.value.checksPassed", value: true },
            },
        });
        expect(findNode(graph, "open_pr")).toMatchObject({
            config: { action: "open_pr", bodyFrom: "inputs.evidence.body" },
        });
        expect(findNode(graph, "output")).toMatchObject({ config: { moveItemTo: "done" } });
        expect(findNode(graph, "needs_human_failed_checks")).toMatchObject({
            config: { moveItemTo: "needs_human", commentOnIssue: true },
        });
    });
});

describe("Pipeline Sandcastle run with the fake runtime", () => {
    let github: FakeGitHubProvider;
    let bed: ExecutorTestBed;

    beforeEach(() => {
        github = new FakeGitHubProvider();
        bed = new ExecutorTestBed([], { github });
    });

    afterEach(() => {
        bed.close();
    });

    async function runPipelineUntilFinished(): Promise<void> {
        const flowId = await bed.publishFlow(sandcastlePipelineTemplate.build());
        const started = await bed.startRun(flowId);

        await bed.runUntilFinished(started.id);
    }

    function addSandcastleIssue(number: number, blockedByNumbers: number[] = []): void {
        github.addIssue(
            TEST_GITHUB_REPO,
            buildGithubIssue({ number, labels: [SANDCASTLE_LABEL], blockedByNumbers }),
        );
    }

    function scriptImplementerWithCommit(issueNumber: number): void {
        bed.git.setCommitsAhead(`forja/issue-${issueNumber}`, 1);
        bed.runtime.script({
            match: { promptIncludes: `${IMPLEMENTER_PROMPT_START}${issueNumber}:` },
            durationMs: AGENT_DURATION_MS,
            result: { commits: [{ sha: `sha${issueNumber}` }] },
        });
    }

    function scriptEvidence(issueNumber: number, output: Record<string, unknown>): void {
        bed.runtime.script({
            match: { promptIncludes: `Issue #${issueNumber}: Issue ${issueNumber} is implemented` },
            durationMs: AGENT_DURATION_MS,
            result: { output },
        });
    }

    function implementerPrompts(): string[] {
        return bed.runtime.requests
            .map((request) => request.prompt)
            .filter((prompt) => prompt.includes(IMPLEMENTER_PROMPT_START));
    }

    function commentsOnIssue(issueNumber: number): string[] {
        return github.comments
            .filter((comment) => comment.issueNumber === issueNumber)
            .map((comment) => comment.body);
    }

    describe("with an unblocked item, an item blocked by it and an item whose checks fail", () => {
        beforeEach(async () => {
            addSandcastleIssue(1);
            addSandcastleIssue(2, [1]);
            addSandcastleIssue(3);
            scriptImplementerWithCommit(1);
            scriptImplementerWithCommit(3);
            scriptEvidence(1, { checksPassed: true, body: "Evidências da issue 1" });
            scriptEvidence(3, {
                checksPassed: false,
                failureSummary: FAILED_CHECKS_SUMMARY,
                body: "Evidências da issue 3",
            });

            await runPipelineUntilFinished();
        });

        it("opens the pull request of the unblocked item with the evidence body", () => {
            expect(github.createdPullRequests).toEqual([
                expect.objectContaining({
                    head: "forja/issue-1",
                    body: "Evidências da issue 1\n\nCloses #1\n\n🤖 Gerado pela Forja",
                }),
            ]);
        });

        it("does not start the item blocked by an open issue", () => {
            expect(implementerPrompts()).toEqual([
                expect.stringContaining("Implement issue #1:"),
                expect.stringContaining("Implement issue #3:"),
            ]);
        });

        it("sends the item whose checks failed to a human with the failure summary", () => {
            expect(commentsOnIssue(3)).toEqual([
                expect.stringContaining(
                    `item precisa de revisão humana (${FAILED_CHECKS_SUMMARY})`,
                ),
            ]);
        });
    });

    describe("with an implementer that made no commits", () => {
        beforeEach(async () => {
            addSandcastleIssue(4);

            await runPipelineUntilFinished();
        });

        it("sends the item to a human without reviewing it", () => {
            const prompts = bed.runtime.requests.map((request) => request.prompt);

            expect(prompts).toEqual([expect.stringContaining(`${IMPLEMENTER_PROMPT_START}4:`)]);
            expect(commentsOnIssue(4)).toEqual([
                expect.stringContaining("item precisa de revisão humana"),
            ]);
            expect(github.createdPullRequests).toEqual([]);
        });
    });
});
