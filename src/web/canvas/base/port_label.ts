import { isNodeOfType, LOOP_EXHAUSTED_PORT } from "@/shared/flow_graph.js";
import type { FlowNode, NodeType, Port } from "@/shared/flow_graph.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";
import type { DocumentedType, PortDoc } from "@/web/docs/node_docs/node_doc.js";

export interface PortDescription {
    label: string;
    description?: string;
}

/** Like describePort, but the branches of a switch Decisão are named by their labels. */
export function describeNodePort(node: FlowNode, port: Port): PortDescription {
    const branchLabel = findBranchLabel(node, port.name);
    if (branchLabel !== undefined) {
        return { label: branchLabel };
    }

    return describePort(node.type, port);
}

export function describePort(nodeType: NodeType, port: Port): PortDescription {
    return describeDocumentedPort(nodeType, port.name) ?? describeUserPort(port);
}

export function describeLoopExhaustedPort(): PortDescription {
    return describeDocumentedPort("loop", LOOP_EXHAUSTED_PORT) ?? { label: LOOP_EXHAUSTED_PORT };
}

function describeDocumentedPort(
    type: DocumentedType,
    portName: string,
): PortDescription | undefined {
    const portDoc = findPortDoc(type, portName);
    if (!portDoc) {
        return undefined;
    }

    return { label: portDoc.label, description: portDoc.description };
}

function findPortDoc(type: DocumentedType, portName: string): PortDoc | undefined {
    const { inputs, outputs } = getNodeDoc(type).ports;

    return [...inputs, ...outputs].find((portDoc) => portDoc.name === portName);
}

function describeUserPort({ name, description }: Port): PortDescription {
    if (description === undefined) {
        return { label: name };
    }

    return { label: name, description };
}

function findBranchLabel(node: FlowNode, portName: string): string | undefined {
    if (!isNodeOfType(node, "condition") || node.config.mode !== "switch") {
        return undefined;
    }

    return node.config.branches.find((branch) => branch.port === portName)?.label;
}
