import type { ComponentType } from "react";
import type { NodeProps, NodeTypes } from "@xyflow/react";

import type { NodeType } from "@/shared/flow_graph.js";
import { GROUP_NODE_TYPE } from "@/web/canvas/graph_mapping.js";
import type { FlowRFNode } from "@/web/canvas/graph_mapping.js";
import { AgentNode } from "@/web/canvas/nodes/agent_node.js";
import { GroupNode } from "@/web/canvas/nodes/group_node.js";
import { SimpleNode } from "@/web/canvas/nodes/simple_nodes.js";

const FLOW_NODE_COMPONENTS: Record<NodeType, ComponentType<NodeProps<FlowRFNode>>> = {
    trigger: SimpleNode,
    source: SimpleNode,
    agent: AgentNode,
    script: SimpleNode,
    condition: SimpleNode,
    gate: SimpleNode,
    git: SimpleNode,
    output: SimpleNode,
};

export const nodeTypes: NodeTypes = {
    ...FLOW_NODE_COMPONENTS,
    [GROUP_NODE_TYPE]: GroupNode,
};
