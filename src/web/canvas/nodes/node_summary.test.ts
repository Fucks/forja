import type { Effort } from "@/shared/agent_types.js";
import type { FlowGroup, FlowNode, NodeOfType, NodeType } from "@/shared/flow_graph.js";
import { createNodeOfType } from "@/test/factories/flow_graph_factory.js";
import { buildMapGroup } from "@/test/factories/flow_graph_variations.js";
import { describeGroupConfig, summarizeNode } from "@/web/canvas/nodes/node_summary.js";

const PROJECT_DEFAULTS: { model: string; effort: Effort } = {
    model: "claude-opus-5-5",
    effort: "high",
};

function buildNode<Type extends NodeType>(
    type: Type,
    config: Partial<NodeOfType<Type>["config"]>,
): FlowNode {
    const node = createNodeOfType(type, `${type}_1`, { x: 0, y: 0 });

    return { ...node, config: { ...node.config, ...config } };
}

describe("summarizeNode", () => {
    it("shows the agent's model, effort, workspace and iteration cap", () => {
        const agent = buildNode("agent", {
            model: "claude-opus-5-5",
            effort: "high",
            workspace: "item",
            maxIterations: 50,
        });

        const summary = summarizeNode(agent);

        expect(summary).toEqual({
            line1: "opus-5-5 · effort high",
            line2: "workspace do item · até 50 iterações",
        });
    });

    it("shows the project's model and effort as the default when the agent inherits them", () => {
        const agent = buildNode("agent", { model: undefined, effort: undefined });

        const summary = summarizeNode(agent, PROJECT_DEFAULTS);

        expect(summary.line1).toBe("opus-5-5 (padrão) · effort high (padrão)");
    });

    it("shows only 'padrão' for inherited values when the project defaults are unknown", () => {
        const agent = buildNode("agent", { model: undefined, effort: undefined });

        const summary = summarizeNode(agent);

        expect(summary.line1).toBe("padrão · effort padrão");
    });

    it("describes an agent without workspace running a single iteration", () => {
        const agent = buildNode("agent", { workspace: "none", maxIterations: 1 });

        const summary = summarizeNode(agent);

        expect(summary.line2).toBe("sem workspace · até 1 iteração");
    });

    it("shows a short script command whole", () => {
        const script = buildNode("script", { command: "npm test" });

        const summary = summarizeNode(script);

        expect(summary).toEqual({ line1: "npm test" });
    });

    it("truncates the script command at 40 characters", () => {
        const script = buildNode("script", {
            command: "npm run typecheck && npm run lint && npm run test",
        });

        const summary = summarizeNode(script);

        expect(summary.line1).toBe("npm run typecheck && npm run lint && np…");
        expect(summary.line1).toHaveLength(40);
    });

    it("writes the condition as text", () => {
        const condition = buildNode("condition", {
            condition: { op: "eq", path: "review.approved", value: true },
        });

        const summary = summarizeNode(condition);

        expect(summary.line1).toBe("review.approved = true");
    });

    it("writes combined conditions as text", () => {
        const condition = buildNode("condition", {
            condition: {
                op: "and",
                conditions: [
                    { op: "gt", path: "tests.passed", value: 0 },
                    { op: "not", condition: { op: "exists", path: "tests.failures" } },
                    {
                        op: "or",
                        conditions: [
                            { op: "neq", path: "review.state", value: "rejected" },
                            { op: "lt", path: "review.round", value: 3 },
                        ],
                    },
                ],
            },
        });

        const summary = summarizeNode(condition);

        expect(summary.line1).toBe(
            "tests.passed > 0 e não (tests.failures existe) e " +
                '(review.state ≠ "rejected" ou review.round < 3)',
        );
    });

    it("truncates the gate message", () => {
        const gate = buildNode("gate", {
            message: "Revise o diff e os artefatos antes de abrir o pull request",
        });

        const summary = summarizeNode(gate);

        expect(summary.line1).toBe("Revise o diff e os artefatos antes de a…");
    });

    it("shows the git action and its base branch", () => {
        const git = buildNode("git", { action: "open_pr", baseBranch: "development" });

        const summary = summarizeNode(git);

        expect(summary).toEqual({ line1: "abrir PR → development" });
    });

    it("shows the git action alone when it uses the project's base branch", () => {
        const git = buildNode("git", { action: "push", baseBranch: undefined });

        const summary = summarizeNode(git);

        expect(summary).toEqual({ line1: "push" });
    });

    it("shows the source provider, label and limit", () => {
        const source = buildNode("source", { provider: "github", label: "Sandcastle", limit: 20 });

        const summary = summarizeNode(source);

        expect(summary).toEqual({ line1: "GitHub · label Sandcastle · até 20" });
    });

    it("leaves the label out of a source without one", () => {
        const source = buildNode("source", { provider: "local", label: undefined, limit: 5 });

        const summary = summarizeNode(source);

        expect(summary).toEqual({ line1: "Local · até 5" });
    });

    it("shows how the trigger starts the run", () => {
        const trigger = buildNode("trigger", { kind: "manual" });

        const summary = summarizeNode(trigger);

        expect(summary).toEqual({ line1: "manual" });
    });

    it("shows where the output moves the item and whether it comments on the issue", () => {
        const output = buildNode("output", { moveItemTo: "done", commentOnIssue: true });

        const summary = summarizeNode(output);

        expect(summary).toEqual({ line1: "mover para Concluído", line2: "comenta na issue" });
    });

    it("says the output keeps the item in place when it moves nothing", () => {
        const output = buildNode("output", { moveItemTo: undefined, commentOnIssue: false });

        const summary = summarizeNode(output);

        expect(summary).toEqual({ line1: "item fica onde está" });
    });
});

describe("describeGroupConfig", () => {
    it("shows the concurrency of a map", () => {
        const group = buildMapGroupWith({ concurrency: 3, barrier: false });

        expect(describeGroupConfig(group)).toBe("map ×3");
    });

    it("marks a map that waits for every item", () => {
        const group = buildMapGroupWith({ concurrency: 1, barrier: true });

        expect(describeGroupConfig(group)).toBe("map ×1 · barreira");
    });

    it("shows the iteration cap of a loop", () => {
        const group: FlowGroup = {
            ...buildMapGroup("revisao"),
            kind: "loop",
            config: {
                maxIterations: 3,
                until: { op: "eq", path: "review.approved", value: true },
                carry: [],
            },
        };

        expect(describeGroupConfig(group)).toBe("loop ≤3");
    });
});

function buildMapGroupWith(config: { concurrency: number; barrier: boolean }): FlowGroup {
    return { ...buildMapGroup("itens"), kind: "map", config: { ...config, failFast: false } };
}
