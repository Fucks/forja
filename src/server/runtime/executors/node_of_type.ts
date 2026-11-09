import { UnsupportedNodeTypeError } from "@/server/runtime/unsupported_node_type_error.js";
import type { FlowNode, NodeOfType, NodeType } from "@/shared/flow_graph.js";

// Each executor handles one node type; the registry never hands it another.
export function asNodeOfType<Type extends NodeType>(node: FlowNode, type: Type): NodeOfType<Type> {
    if (!isNodeOfType(node, type)) {
        throw new UnsupportedNodeTypeError(node.type);
    }

    return node;
}

function isNodeOfType<Type extends NodeType>(node: FlowNode, type: Type): node is NodeOfType<Type> {
    return node.type === type;
}
