import { findNode, listUpstreamNodes } from "@/engine/graph_queries.js";
import { DATA_LABEL_SEPARATOR, describeShapeFields } from "@/engine/available_data_fields.js";
import type { FieldPlace } from "@/engine/available_data_fields.js";
import { buildNodeOutputPath } from "@/shared/data_context.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode, NodeType, Port, PortType } from "@/shared/flow_graph.js";
import type { JsonSchema } from "@/shared/json_schema.js";
import { nodeSlug } from "@/shared/node_slug.js";
import { findNodeOutputShape } from "@/shared/node_output_shapes.js";

export type DataType = "boolean" | "number" | "string" | "list" | "object" | "any";

export interface DataField {
    path: string;
    label: string;
    type: DataType;
    enumValues?: (string | number)[];
    description?: string;
    sourceNodeId?: string;
    depth: number;
}

export interface AvailableDataOptions {
    scope: "node" | "loopUntil";
    groupId?: string;
    portLabels: (nodeType: NodeType, port: Port) => string;
}

type PortLabeler = AvailableDataOptions["portLabels"];

const AGENT_RESULT_PORT = "result";
const PORT_TYPE_SHAPES: Record<PortType, JsonSchema> = {
    text: { type: "string" },
    json: { type: "object" },
    workItem: { type: "object" },
    workItemList: { type: "array" },
    branch: { type: "string" },
    prUrl: { type: "string" },
    any: {},
};

/** What a node (or a loop's `until`) can read by path, grouped by where each value comes from. */
export function describeAvailableData(
    graph: FlowGraph,
    nodeId: string,
    options: AvailableDataOptions,
): DataField[] {
    const node = findNode(graph, nodeId);
    if (!node) {
        return [];
    }

    return listUpstreamNodes(graph, node.id).flatMap((upstreamNode) =>
        describeNodeOutputs(upstreamNode, options.portLabels),
    );
}

function describeNodeOutputs(node: FlowNode, portLabels: PortLabeler): DataField[] {
    const slug = nodeSlug(node.label);

    return node.outputs.flatMap((port) => {
        const place: FieldPlace = {
            path: buildNodeOutputPath(slug, port.name),
            label: [node.label, portLabels(node.type, port)].join(DATA_LABEL_SEPARATOR),
            sourceNodeId: node.id,
        };

        return describeShapeFields(place, outputPortShape(node, port));
    });
}

function outputPortShape(node: FlowNode, port: Port): JsonSchema {
    if (isNodeOfType(node, "agent") && port.name === AGENT_RESULT_PORT && node.config.outputSchema) {
        return node.config.outputSchema;
    }

    return findNodeOutputShape(node.type, port.name) ?? port.schema ?? PORT_TYPE_SHAPES[port.type];
}
