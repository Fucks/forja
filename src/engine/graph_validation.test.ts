import { type AgentNode, validateFlowGraph } from "@/engine/graph_validation.js";
import type { Condition } from "@/shared/conditions.js";
import type { FlowGraph } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";
import {
    buildCanonicalFlow,
    buildLoopFlow,
    buildLoopFlowWithExits,
    connect,
} from "@/test/factories/flow_graph_factory.js";
import {
    addEdges,
    addNodes,
    moveGroup,
    moveNode,
    removeEdges,
    removeGroups,
    removeNodes,
    updateGroup,
    updateNode,
} from "@/test/factories/flow_graph_variations.js";

describe("validateFlowGraph", () => {
    it("finds no issues in the canonical flow", () => {
        expect(validateFlowGraph(buildCanonicalFlow())).toEqual([]);
    });

    it("finds no issues in the loop flow", () => {
        expect(validateFlowGraph(buildLoopFlow())).toEqual([]);
    });

    it("finds no issues in the loop flow with its exhausted exit", () => {
        expect(validateFlowGraph(buildLoopFlowWithExits())).toEqual([]);
    });

    it("lists errors before warnings", () => {
        const withoutBackEdge = removeEdges(buildLoopFlow(), ["review.summary->dev.notes"]);
        const graph = updateAgentConfig(withoutBackEdge, "dev", { prompt: "" });

        const levels = validateFlowGraph(graph).map((issue) => issue.level);

        expect(levels).toEqual(["error", "warning"]);
    });
});

describe("duplicate_id", () => {
    it("points to the element that repeats an id already in use", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            { ...connect(["dev", "summary"], ["reviewer", "context"]), id: "dev" },
        ]);

        expect(targetsOf(graph, "duplicate_id")).toEqual([{ kind: "edge", id: "dev" }]);
    });
});

describe("no_trigger and many_triggers", () => {
    it("reports a flow without a trigger", () => {
        const graph = removeNodes(buildCanonicalFlow(), ["trigger"]);

        expect(targetsOf(graph, "no_trigger")).toEqual([{ kind: "flow" }]);
    });

    it("points to every trigger when there is more than one", () => {
        const secondTrigger = createDefaultNode("trigger", "second_trigger", { x: 0, y: 0 });
        const graph = addNodes(buildCanonicalFlow(), [secondTrigger]);

        expect(targetsOf(graph, "many_triggers")).toEqual([
            { kind: "node", id: "trigger" },
            { kind: "node", id: "second_trigger" },
        ]);
    });
});

describe("dangling_edge", () => {
    it("points to an edge whose target node does not exist", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            connect(["dev", "summary"], ["ghost", "context"]),
        ]);

        expect(targetsOf(graph, "dangling_edge")).toEqual([
            { kind: "edge", id: "dev.summary->ghost.context" },
        ]);
    });

    it("points to an edge whose source port does not exist", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            connect(["dev", "missing"], ["reviewer", "context"]),
        ]);

        expect(targetsOf(graph, "dangling_edge")).toEqual([
            { kind: "edge", id: "dev.missing->reviewer.context" },
        ]);
    });

    it("points to an edge from a loop group port other than exhausted", () => {
        const graph = addEdges(buildLoopFlowWithExits(), [
            connect(["review_loop", "approved"], ["needs_human", "item"]),
        ]);

        expect(targetsOf(graph, "dangling_edge")).toEqual([
            { kind: "edge", id: "review_loop.approved->needs_human.item" },
        ]);
    });

    it("points to an edge from the exhausted port of a map group", () => {
        const graph = addEdges(buildLoopFlowWithExits(), [
            connect(["items", "exhausted"], ["needs_human", "item"]),
        ]);

        expect(targetsOf(graph, "dangling_edge")).toEqual([
            { kind: "edge", id: "items.exhausted->needs_human.item" },
        ]);
    });
});

describe("required_input_unconnected", () => {
    it("points to the node with a required input without an edge", () => {
        const graph = removeEdges(buildCanonicalFlow(), ["tl.summary->dev.spec"]);

        expect(targetsOf(graph, "required_input_unconnected")).toEqual([
            { kind: "node", id: "dev" },
        ]);
    });

    it("requires the item input of a node outside every map", () => {
        const graph = moveNode(buildCanonicalFlow(), "open_pr", undefined);

        expect(targetsOf(graph, "required_input_unconnected")).toEqual([
            { kind: "node", id: "open_pr" },
        ]);
    });
});

describe("incompatible_ports", () => {
    it("points to an edge between ports of different types", () => {
        const graph = addEdges(buildLoopFlow(), [connect(["tests", "result"], ["dev", "context"])]);

        expect(targetsOf(graph, "incompatible_ports")).toEqual([
            { kind: "edge", id: "tests.result->dev.context" },
        ]);
    });

    it("rejects a list into an item input when the edge does not enter a map", () => {
        const graph = moveNode(buildCanonicalFlow(), "tl", undefined);

        expect(targetsOf(graph, "incompatible_ports")).toEqual([
            { kind: "edge", id: "source.items->tl.item" },
        ]);
    });
});

describe("group_overlap", () => {
    it("points to a node inside a group that does not exist", () => {
        const graph = moveNode(buildCanonicalFlow(), "dev", "missing");

        expect(targetsOf(graph, "group_overlap")).toEqual([{ kind: "node", id: "dev" }]);
    });

    it("points to a group inside a group that does not exist", () => {
        const graph = moveGroup(buildLoopFlow(), "items", { parentGroupId: "missing" });

        expect(targetsOf(graph, "group_overlap")).toEqual([{ kind: "group", id: "items" }]);
    });

    it("points to a group that is its own parent", () => {
        const graph = moveGroup(buildCanonicalFlow(), "develop", { parentGroupId: "develop" });

        expect(targetsOf(graph, "group_overlap")).toEqual([{ kind: "group", id: "develop" }]);
    });

    it("points to every group in a cycle of parents", () => {
        const graph = moveGroup(buildLoopFlow(), "items", { parentGroupId: "review_loop" });

        expect(targetsOf(graph, "group_overlap")).toEqual([
            { kind: "group", id: "items" },
            { kind: "group", id: "review_loop" },
        ]);
    });
});

describe("cycle_outside_loop", () => {
    it("accepts a cycle inside a loop", () => {
        expect(targetsOf(buildLoopFlow(), "cycle_outside_loop")).toEqual([]);
    });

    it("rejects the same cycle when the loop is removed", () => {
        const loopFlow = buildLoopFlow();
        const nodesInItemsMap = ["dev", "tests", "review"].reduce(
            (graph, nodeId) => moveNode(graph, nodeId, "items"),
            loopFlow,
        );
        const graph = removeGroups(nodesInItemsMap, ["review_loop"]);

        expect(targetsOf(graph, "cycle_outside_loop")).toEqual([{ kind: "node", id: "dev" }]);
    });

    it("rejects a cycle that crosses group borders", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            connect(["reviewer", "summary"], ["tl", "context"]),
        ]);

        expect(targetsOf(graph, "cycle_outside_loop")).toEqual([{ kind: "node", id: "dev" }]);
    });
});

describe("loop_without_back_edge", () => {
    it("warns about a loop whose nodes have no edge back", () => {
        const graph = removeEdges(buildLoopFlow(), ["review.summary->dev.notes"]);

        expect(issuesWithCode(graph, "loop_without_back_edge")).toEqual([
            expect.objectContaining({
                level: "warning",
                target: { kind: "group", id: "review_loop" },
            }),
        ]);
    });
});

describe("map_without_list_input", () => {
    it("points to a map that receives neither a list nor items from another map", () => {
        const graph = removeEdges(buildCanonicalFlow(), ["source.items->tl.item"]);

        expect(targetsOf(graph, "map_without_list_input")).toEqual([
            { kind: "group", id: "specify" },
        ]);
    });
});

describe("map_many_list_inputs", () => {
    it("points to a map that receives two lists", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            connect(["trigger", "items"], ["tl", "item"]),
        ]);

        expect(targetsOf(graph, "map_many_list_inputs")).toEqual([
            { kind: "group", id: "specify" },
        ]);
    });

    it("points to a map that receives a list and items from another map", () => {
        const graph = addEdges(buildCanonicalFlow(), [
            connect(["source", "items"], ["dev", "item"]),
        ]);

        expect(targetsOf(graph, "map_many_list_inputs")).toEqual([
            { kind: "group", id: "develop" },
        ]);
    });
});

describe("loop_condition_unknown_port", () => {
    it("warns when the condition starts with a name that is not in the loop", () => {
        const graph = updateLoopCondition(buildLoopFlow(), "review_loop", {
            op: "and",
            conditions: [
                { op: "eq", path: "revisar.approved", value: true },
                { op: "exists", path: "tl.summary" },
            ],
        });

        expect(issuesWithCode(graph, "loop_condition_unknown_port")).toEqual([
            expect.objectContaining({
                level: "warning",
                target: { kind: "group", id: "review_loop" },
            }),
        ]);
    });

    it("accepts a condition that starts with the slug of a loop node label", () => {
        const graph = updateLoopCondition(buildLoopFlow(), "review_loop", {
            op: "eq",
            path: "desenvolver.summary",
            value: "ok",
        });

        expect(issuesWithCode(graph, "loop_condition_unknown_port")).toEqual([]);
    });

    it("warns when the condition starts with a node id instead of its slug", () => {
        const graph = updateLoopCondition(buildLoopFlow(), "review_loop", {
            op: "eq",
            path: "review.approved",
            value: true,
        });

        expect(issuesWithCode(graph, "loop_condition_unknown_port")).toHaveLength(1);
    });

    it("accepts a condition that starts with an output port of a loop node", () => {
        const graph = updateLoopCondition(buildLoopFlow(), "review_loop", {
            op: "exists",
            path: "summary.text",
        });

        expect(issuesWithCode(graph, "loop_condition_unknown_port")).toEqual([]);
    });
});

describe("empty_prompt", () => {
    it("points to an agent whose prompt is blank", () => {
        const graph = updateAgentConfig(buildCanonicalFlow(), "tl", { prompt: "  \n" });

        expect(targetsOf(graph, "empty_prompt")).toEqual([{ kind: "node", id: "tl" }]);
    });
});

describe("unknown_tool_profile and unknown_credential", () => {
    it("points to an agent whose tool profile is not in the context", () => {
        const context = { knownToolProfileIds: ["tlp_builtin_readonly"] };

        const issues = validateFlowGraph(buildCanonicalFlow(), context);

        expect(targetsWithCode(issues, "unknown_tool_profile")).toEqual([
            { kind: "node", id: "dev" },
        ]);
    });

    it("points to an agent whose credential is not in the context", () => {
        const graph = updateAgentConfig(buildCanonicalFlow(), "reviewer", {
            credentialId: "crd_1",
        });

        const issues = validateFlowGraph(graph, { knownCredentialIds: ["crd_2"] });

        expect(targetsWithCode(issues, "unknown_credential")).toEqual([
            { kind: "node", id: "reviewer" },
        ]);
    });
});

describe("checkPrompt", () => {
    it("adds the issues found by the injected prompt check for each agent", () => {
        const checkPrompt = (node: AgentNode): ValidationIssue[] => [
            {
                level: "error",
                code: "unknown_prompt_variable",
                message: "Variável desconhecida.",
                target: { kind: "node", id: node.id },
            },
        ];

        const issues = validateFlowGraph(buildCanonicalFlow(), { checkPrompt });

        expect(targetsWithCode(issues, "unknown_prompt_variable")).toEqual([
            { kind: "node", id: "tl" },
            { kind: "node", id: "dev" },
            { kind: "node", id: "reviewer" },
        ]);
    });
});

function issuesWithCode(graph: FlowGraph, code: string): ValidationIssue[] {
    return validateFlowGraph(graph).filter((issue) => issue.code === code);
}

function targetsOf(graph: FlowGraph, code: string): ValidationIssue["target"][] {
    return targetsWithCode(validateFlowGraph(graph), code);
}

function targetsWithCode(issues: ValidationIssue[], code: string): ValidationIssue["target"][] {
    return issues.filter((issue) => issue.code === code).map((issue) => issue.target);
}

function updateAgentConfig(
    graph: FlowGraph,
    nodeId: string,
    changes: Partial<AgentConfig>,
): FlowGraph {
    return updateNode(graph, nodeId, (node) =>
        node.type === "agent" ? { ...node, config: { ...node.config, ...changes } } : node,
    );
}

function updateLoopCondition(graph: FlowGraph, groupId: string, until: Condition): FlowGraph {
    return updateGroup(graph, groupId, (group) =>
        group.kind === "loop" ? { ...group, config: { ...group.config, until } } : group,
    );
}
