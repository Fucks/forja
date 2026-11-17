import {
    DATA_LABEL_SEPARATOR,
    describePropertyFields,
    describeShapeFields,
} from "@/engine/available_data_fields.js";
import type { FieldPlace } from "@/engine/available_data_fields.js";
import {
    enclosingMapGroup,
    findNode,
    incomingEdges,
    listUpstreamNodes,
    nodesInsideGroup,
} from "@/engine/graph_queries.js";
import { CONDITION_PATH_SEPARATOR } from "@/shared/conditions.js";
import { buildNodeOutputPath } from "@/shared/data_context.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type {
    FlowEdge,
    FlowGraph,
    FlowNode,
    NodeType,
    Port,
    PortType,
} from "@/shared/flow_graph.js";
import type { JsonSchema } from "@/shared/json_schema.js";
import {
    findNodeOutputShape,
    WORK_ITEM_LIST_SHAPE,
    WORK_ITEM_SHAPE,
} from "@/shared/node_output_shapes.js";
import { nodeSlug } from "@/shared/node_slug.js";

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
const ITEM_GROUP: FieldPlace = { path: "item", label: "Item atual" };
const INPUTS_GROUP: FieldPlace = { path: "inputs", label: "Entradas deste nó" };
const PROJECT_GROUP: FieldPlace = { path: "project", label: "Projeto" };
const RUN_GROUP: FieldPlace = { path: "run", label: "Execução" };
const TOP_LEVEL_DEPTH = 0;

const PROJECT_SHAPE: JsonSchema = {
    type: "object",
    properties: {
        baseBranch: { type: "string", description: "Branch de onde o trabalho parte." },
        name: { type: "string", description: "Nome do projeto." },
    },
};
const RUN_SHAPE: JsonSchema = {
    type: "object",
    properties: {
        iteration: { type: "integer", description: "Volta atual do loop, começando em 1." },
        attempt: { type: "integer", description: "Tentativa atual do nó, começando em 1." },
    },
};
const PORT_TYPE_SHAPES: Record<PortType, JsonSchema> = {
    text: { type: "string" },
    json: { type: "object" },
    workItem: WORK_ITEM_SHAPE,
    workItemList: WORK_ITEM_LIST_SHAPE,
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
    if (options.scope === "loopUntil") {
        return describeLoopUntilData(graph, options);
    }

    return describeNodeData(graph, nodeId, options.portLabels);
}

function describeLoopUntilData(graph: FlowGraph, options: AvailableDataOptions): DataField[] {
    if (options.groupId === undefined) {
        return [];
    }

    return nodesInsideGroup(graph, options.groupId).flatMap((node) =>
        describeNodeOutputs(node, options.portLabels),
    );
}

function describeNodeData(graph: FlowGraph, nodeId: string, portLabels: PortLabeler): DataField[] {
    const node = findNode(graph, nodeId);
    if (!node) {
        return [];
    }

    return [
        ...describeItemData(graph, node),
        ...describeInputs(graph, node, portLabels),
        ...listUpstreamNodes(graph, node.id).flatMap((upstreamNode) =>
            describeNodeOutputs(upstreamNode, portLabels),
        ),
        ...describePropertyFields(PROJECT_GROUP, PROJECT_SHAPE, TOP_LEVEL_DEPTH),
        ...describePropertyFields(RUN_GROUP, RUN_SHAPE, TOP_LEVEL_DEPTH),
    ];
}

// Only the nodes inside a Map run once per item, so only they have a current item.
function describeItemData(graph: FlowGraph, node: FlowNode): DataField[] {
    if (!enclosingMapGroup(graph, node.id)) {
        return [];
    }

    return describePropertyFields(ITEM_GROUP, WORK_ITEM_SHAPE, TOP_LEVEL_DEPTH);
}

function describeInputs(graph: FlowGraph, node: FlowNode, portLabels: PortLabeler): DataField[] {
    const edges = incomingEdges(graph, node.id);

    return node.inputs.flatMap((port) => {
        const connectedOutput = findConnectedOutput(graph, edges, port);
        const place: FieldPlace = {
            path: [INPUTS_GROUP.path, port.name].join(CONDITION_PATH_SEPARATOR),
            label: [INPUTS_GROUP.label, portLabels(node.type, port)].join(DATA_LABEL_SEPARATOR),
            sourceNodeId: connectedOutput?.node.id,
        };
        const shape = connectedOutput
            ? outputPortShape(connectedOutput.node, connectedOutput.port)
            : ownPortShape(port);

        return describeShapeFields(place, shape);
    });
}

function findConnectedOutput(
    graph: FlowGraph,
    edges: FlowEdge[],
    inputPort: Port,
): { node: FlowNode; port: Port } | undefined {
    const edge = edges.find((candidate) => candidate.to.port === inputPort.name);
    if (!edge) {
        return undefined;
    }

    const node = findNode(graph, edge.from.nodeId);
    const port = node?.outputs.find((output) => output.name === edge.from.port);
    if (!node || !port) {
        return undefined;
    }

    return { node, port };
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
    if (
        isNodeOfType(node, "agent") &&
        port.name === AGENT_RESULT_PORT &&
        node.config.outputSchema
    ) {
        return node.config.outputSchema;
    }

    return findNodeOutputShape(node.type, port.name) ?? ownPortShape(port);
}

function ownPortShape(port: Port): JsonSchema {
    return port.schema ?? PORT_TYPE_SHAPES[port.type];
}
