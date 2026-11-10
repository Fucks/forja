import type { JSX } from "react";

import type { FlowGraph, FlowNode, NodeType } from "@/shared/flow_graph.js";
import { AgentInspector } from "@/web/canvas/inspector/agent_inspector.js";

export interface InspectorProps {
    node: FlowNode;
    graph: FlowGraph;
    onChange: (update: (node: FlowNode) => FlowNode) => void;
}

export type InspectorComponent = (props: InspectorProps) => JSX.Element;

export const inspectorRegistry: Partial<Record<NodeType, InspectorComponent>> = {
    agent: AgentInspector,
};
