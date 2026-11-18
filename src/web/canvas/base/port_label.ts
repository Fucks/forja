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
    const portDoc = findPortDoc(nodeType, port.name);
    if (portDoc) {
        return { label: portDoc.label, description: portDoc.description };
    }

    return describeUserPort(port);
}

export function describeLoopExhaustedPort(): PortDescription {
    const portDoc = findPortDoc("loop", LOOP_EXHAUSTED_PORT);
    if (!portDoc) {
        return { label: LOOP_EXHAUSTED_PORT };
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
