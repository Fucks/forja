import { findGroup, findNode } from "@/engine/graph_queries.js";
import { validateFlowGraph } from "@/engine/graph_validation.js";
import type { ValidationContext } from "@/engine/graph_validation.js";
import { checkPromptVariables } from "@/engine/prompt_template.js";
import { basicFactoryTemplate } from "@/server/flows/templates/basic_factory.js";
import { TOOL_PROFILE_PRESETS } from "@/server/tool_profiles/tool_profile_presets.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";

const PUBLISH_CONTEXT: ValidationContext = {
    knownToolProfileIds: TOOL_PROFILE_PRESETS.map((profile) => profile.id),
    knownCredentialIds: [],
    checkPrompt: checkPromptVariables,
};

describe("Fábrica básica template", () => {
    it("builds a graph that publishes without errors", () => {
        const graph = basicFactoryTemplate.build();

        expect(publishErrorsOf(graph)).toEqual([]);
    });

    it("has the nodes, edges and groups of the canonical flow", () => {
        const graph = basicFactoryTemplate.build();

        expect(structureOf(graph)).toEqual(structureOf(buildCanonicalFlow()));
    });

    it("specifies one item at a time, develops three and reviews one", () => {
        const graph = basicFactoryTemplate.build();

        expect(mapConcurrencyOf(graph, "specify")).toBe(1);
        expect(mapConcurrencyOf(graph, "develop")).toBe(3);
        expect(mapConcurrencyOf(graph, "review_and_open_pr")).toBe(1);
    });

    it("gives the developer the specification written by the TL", () => {
        const graph = basicFactoryTemplate.build();

        expect(agentPromptOf(graph, "tl")).toContain("{{item.body}}");
        expect(agentPromptOf(graph, "dev")).toContain("{{inputs.spec}}");
    });
});

function publishErrorsOf(graph: FlowGraph): string[] {
    return validateFlowGraph(graph, PUBLISH_CONTEXT)
        .filter((issue) => issue.level === "error")
        .map((issue) => issue.message);
}

// Positions and prompts belong to the template; what the engine runs must match the canonical flow.
function structureOf(graph: FlowGraph): unknown {
    return {
        nodes: graph.nodes.map(withoutLayoutAndPrompt),
        edges: graph.edges,
        groups: graph.groups.map(({ id, kind, parentGroupId, config }) => ({
            id,
            kind,
            parentGroupId,
            config,
        })),
    };
}

function withoutLayoutAndPrompt(node: FlowNode): unknown {
    const structure = {
        id: node.id,
        type: node.type,
        label: node.label,
        parentGroupId: node.parentGroupId,
        inputs: node.inputs,
        outputs: node.outputs,
    };
    if (node.type !== "agent") {
        return { ...structure, config: node.config };
    }

    return { ...structure, config: { ...node.config, prompt: undefined } };
}

function mapConcurrencyOf(graph: FlowGraph, groupId: string): number | undefined {
    const group = findGroup(graph, groupId);
    if (group?.kind !== "map") {
        return undefined;
    }

    return group.config.concurrency;
}

function agentPromptOf(graph: FlowGraph, nodeId: string): string | undefined {
    const node = findNode(graph, nodeId);
    if (node?.type !== "agent") {
        return undefined;
    }

    return node.config.prompt;
}
