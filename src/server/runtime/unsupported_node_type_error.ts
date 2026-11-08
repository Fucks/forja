import type { NodeType } from "@/shared/flow_graph.js";

export class UnsupportedNodeTypeError extends Error {
    constructor(readonly nodeType: NodeType) {
        super(`Nós do tipo ${nodeType} ainda não podem ser executados`);
        this.name = "UnsupportedNodeTypeError";
    }
}
