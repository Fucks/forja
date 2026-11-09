import type { FlowGraph } from "@/shared/flow_graph.js";

export interface FlowTemplate {
    id: string;
    name: string;
    description: string;
    build(): FlowGraph;
}
