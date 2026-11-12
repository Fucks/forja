import { findGroup, findNode } from "@/engine/graph_queries.js";
import { sandcastlePipelineTemplate } from "@/server/flows/templates/sandcastle_pipeline.js";
import { CODEGRAPH_PRESET_ID } from "@/server/tool_profiles/tool_profile_presets.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import { agentPromptOf, publishErrorsOf } from "@/test/flow_template_inspection.js";

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
            config: { condition: { op: "gt", path: "commits", value: 0 } },
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
            config: { condition: { op: "eq", path: "checksPassed", value: true } },
        });
        expect(findNode(graph, "open_pr")).toMatchObject({
            config: { action: "open_pr", bodyFrom: "evidence.body" },
        });
        expect(findNode(graph, "output")).toMatchObject({ config: { moveItemTo: "done" } });
        expect(findNode(graph, "needs_human_failed_checks")).toMatchObject({
            config: { moveItemTo: "needs_human", commentOnIssue: true },
        });
    });
});
