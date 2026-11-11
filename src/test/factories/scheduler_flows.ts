import type { Condition } from "@/shared/conditions.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import type {
    FlowGraph,
    FlowGroup,
    FlowNode,
    MapConfig,
    NodeOfType,
    NodeType,
    Port,
} from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { buildCanonicalFlow, connect } from "@/test/factories/flow_graph_factory.js";
import {
    addEdges,
    addGroups,
    addNodes,
    buildMapGroup,
    moveNode,
    updateGroup,
    updateNode,
} from "@/test/factories/flow_graph_variations.js";

const ORIGIN = { x: 0, y: 0 };

const SIDE_LOOP: FlowGroup = {
    id: "side_loop",
    kind: "loop",
    label: "side_loop",
    position: ORIGIN,
    size: { width: 480, height: 480 },
    config: {
        maxIterations: 3,
        until: { op: "eq", path: "b.approved", value: true },
        carry: [],
    },
};

export function buildLinearAgentFlow(): FlowGraph {
    return buildFlow(
        [buildNode("trigger", "trigger"), buildNode("agent", "a"), buildNode("agent", "b")],
        [connect(["trigger", "items"], ["a", "item"]), connect(["a", "summary"], ["b", "context"])],
    );
}

export function buildSingleAgentFlow(): FlowGraph {
    return buildFlow(
        [buildNode("trigger", "trigger"), buildNode("agent", "a")],
        [connect(["trigger", "items"], ["a", "item"])],
    );
}

// trigger → source (runs once for the list) → agent (runs per item of the fetched list)
export function buildSourceFlow(): FlowGraph {
    return buildFlow(
        [buildNode("trigger", "trigger"), buildNode("source", "source"), buildNode("agent", "a")],
        [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["a", "item"]),
        ],
    );
}

// review → check(approved?) → true: publish → done; false: rework
export function buildConditionFlow(condition: Condition): FlowGraph {
    return buildFlow(
        [
            buildNode("trigger", "trigger"),
            buildNode("agent", "review"),
            buildConditionNode("check", condition),
            withInput(buildNode("agent", "publish"), requiredPort("approved")),
            withInput(buildNode("output", "done"), requiredPort("summary")),
            withInput(buildNode("agent", "rework"), requiredPort("rejected")),
        ],
        [
            connect(["trigger", "items"], ["review", "item"]),
            connect(["review", "result"], ["check", "value"]),
            connect(["check", "true"], ["publish", "approved"]),
            connect(["trigger", "items"], ["done", "item"]),
            connect(["publish", "summary"], ["done", "summary"]),
            connect(["check", "false"], ["rework", "rejected"]),
        ],
    );
}

// trigger → gate → approved: publish; rejected: rework (with the comment), beside an agent c
export function buildGateFlow(): FlowGraph {
    const gate = {
        ...buildNode("gate", "gate"),
        outputs: [...gateOutputs(), requiredPort("comment")],
    };

    return buildFlow(
        [
            buildNode("trigger", "trigger"),
            gate,
            buildNode("agent", "publish"),
            withInput(buildNode("agent", "rework"), requiredPort("feedback")),
            buildNode("agent", "c"),
        ],
        [
            connect(["trigger", "items"], ["gate", "item"]),
            connect(["gate", "approved"], ["publish", "item"]),
            connect(["gate", "rejected"], ["rework", "item"]),
            connect(["gate", "comment"], ["rework", "feedback"]),
            connect(["trigger", "items"], ["c", "item"]),
        ],
    );
}

// trigger → map(a) → b, where b runs per item outside the map
export function buildMappedLinearFlow(): FlowGraph {
    const graph = addGroups(buildLinearAgentFlow(), [buildMapGroup("map_a")]);

    return moveNode(graph, "a", "map_a");
}

// The canonical flow with a "report" node after the maps that receives the reviews as one list.
export function buildReportedCanonicalFlow(): FlowGraph {
    const report = withInput(buildNode("agent", "report"), {
        name: "reviews",
        type: "workItemList",
        required: true,
    });

    return addEdges(addNodes(buildCanonicalFlow(), [report]), [
        connect(["reviewer", "summary"], ["report", "reviews"]),
    ]);
}

// trigger → loop(a ↔ b, until b approves) per item, beside an agent c that runs per item too
export function buildLoopBesideAgentFlow(): FlowGraph {
    const graph = buildFlow(
        [
            buildNode("trigger", "trigger"),
            { ...buildNode("agent", "a"), parentGroupId: SIDE_LOOP.id },
            { ...buildNode("agent", "b"), parentGroupId: SIDE_LOOP.id },
            buildNode("agent", "c"),
        ],
        [
            connect(["trigger", "items"], ["a", "item"]),
            connect(["a", "summary"], ["b", "context"]),
            connect(["b", "summary"], ["a", "context"]),
            connect(["trigger", "items"], ["c", "item"]),
        ],
    );

    return addGroups(graph, [SIDE_LOOP]);
}

export function withMapConfig(
    graph: FlowGraph,
    mapGroupId: string,
    config: Partial<MapConfig>,
): FlowGraph {
    return updateGroup(graph, mapGroupId, (group) => {
        if (group.kind !== "map") {
            return group;
        }

        return { ...group, config: { ...group.config, ...config } };
    });
}

export function withAgentConfig(
    graph: FlowGraph,
    agentNodeId: string,
    config: Partial<AgentConfig>,
): FlowGraph {
    return updateNode(graph, agentNodeId, (node) => configureAgent(node, config));
}

// Agents retry once by default; tests about a definitive failure turn that off.
export function withoutRetries(graph: FlowGraph): FlowGraph {
    return { ...graph, nodes: graph.nodes.map((node) => configureAgent(node, { retries: 0 })) };
}

function configureAgent(node: FlowNode, config: Partial<AgentConfig>): FlowNode {
    if (node.type !== "agent") {
        return node;
    }

    return { ...node, config: { ...node.config, ...config } };
}

function buildFlow(nodes: FlowNode[], edges: FlowGraph["edges"]): FlowGraph {
    return { schemaVersion: 1, nodes, edges, groups: [] };
}

function buildNode(type: NodeType, id: string): FlowNode {
    return { ...createDefaultNode(type, id, ORIGIN), label: id };
}

function buildConditionNode(id: string, condition: Condition): NodeOfType<"condition"> {
    return {
        id,
        type: "condition",
        label: id,
        position: ORIGIN,
        inputs: [{ name: "value", type: "json", required: true }],
        outputs: [
            { name: "true", type: "any", required: true },
            { name: "false", type: "any", required: true },
        ],
        config: { condition },
    };
}

function gateOutputs(): Port[] {
    return createDefaultNode("gate", "gate", ORIGIN).outputs;
}

function requiredPort(name: string): Port {
    return { name, type: "any", required: true };
}

function withInput(node: FlowNode, port: Port): FlowNode {
    return { ...node, inputs: [...node.inputs, port] };
}
