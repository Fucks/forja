import type { Condition } from "@/shared/conditions.js";
import type { FlowGraph, FlowNode, NodeOfType, NodeType, Port } from "@/shared/flow_graph.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import { connect } from "@/test/factories/flow_graph_factory.js";

const ORIGIN = { x: 0, y: 0 };

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

function requiredPort(name: string): Port {
    return { name, type: "any", required: true };
}

function withInput(node: FlowNode, port: Port): FlowNode {
    return { ...node, inputs: [...node.inputs, port] };
}
