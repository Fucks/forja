import type { NodeType, Port } from "@/shared/flow_graph.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";
import type { PortDoc } from "@/web/docs/node_docs/node_doc.js";

export interface PortDescription {
    label: string;
    description?: string;
}

export function describePort(nodeType: NodeType, port: Port): PortDescription {
    const portDoc = findPortDoc(nodeType, port.name);
    if (portDoc) {
        return { label: portDoc.label, description: portDoc.description };
    }

    return describeUserPort(port);
}

function findPortDoc(nodeType: NodeType, portName: string): PortDoc | undefined {
    const { inputs, outputs } = getNodeDoc(nodeType).ports;

    return [...inputs, ...outputs].find((portDoc) => portDoc.name === portName);
}

function describeUserPort({ name, description }: Port): PortDescription {
    if (description === undefined) {
        return { label: name };
    }

    return { label: name, description };
}
