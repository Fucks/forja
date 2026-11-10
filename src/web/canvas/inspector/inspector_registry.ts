import type { JSX } from "react";

import type { FlowGraph, FlowNode, NodeType } from "@/shared/flow_graph.js";
import { AgentInspector } from "@/web/canvas/inspector/agent_inspector.js";
import { ConditionInspector } from "@/web/canvas/inspector/condition_inspector.js";
import { GateInspector } from "@/web/canvas/inspector/gate_inspector.js";
import { GitInspector } from "@/web/canvas/inspector/git_inspector.js";
import { OutputInspector } from "@/web/canvas/inspector/output_inspector.js";
import { ScriptInspector } from "@/web/canvas/inspector/script_inspector.js";
import { SourceInspector } from "@/web/canvas/inspector/source_inspector.js";
import { TriggerInspector } from "@/web/canvas/inspector/trigger_inspector.js";

export interface InspectorProps {
    node: FlowNode;
    graph: FlowGraph;
    onChange: (update: (node: FlowNode) => FlowNode) => void;
}

export type InspectorComponent = (props: InspectorProps) => JSX.Element;

export const inspectorRegistry: Record<NodeType, InspectorComponent> = {
    trigger: TriggerInspector,
    source: SourceInspector,
    agent: AgentInspector,
    script: ScriptInspector,
    condition: ConditionInspector,
    gate: GateInspector,
    git: GitInspector,
    output: OutputInspector,
};
