import { memo } from "react";
import type { ComponentType } from "react";
import type { NodeProps, NodeTypes } from "@xyflow/react";

import type { NodeType } from "@/shared/flow_graph.js";
import { GROUP_NODE_TYPE } from "@/web/canvas/graph_mapping.js";
import type { FlowRFNode } from "@/web/canvas/graph_mapping.js";
import { AgentNode } from "@/web/canvas/nodes/agent_node.js";
import { GroupNode } from "@/web/canvas/nodes/group_node.js";
import { SimpleNode } from "@/web/canvas/nodes/simple_nodes.js";

// React Flow re-renders every node whenever the canvas re-renders; memoized nodes render again only
// when their own props or live state change.
const MemoizedSimpleNode = memo(SimpleNode);
const MemoizedAgentNode = memo(AgentNode);
const MemoizedGroupNode = memo(GroupNode);

const FLOW_NODE_COMPONENTS: Record<NodeType, ComponentType<NodeProps<FlowRFNode>>> = {
    trigger: MemoizedSimpleNode,
    source: MemoizedSimpleNode,
    agent: MemoizedAgentNode,
    script: MemoizedSimpleNode,
    condition: MemoizedSimpleNode,
    gate: MemoizedSimpleNode,
    git: MemoizedSimpleNode,
    output: MemoizedSimpleNode,
};

export const nodeTypes: NodeTypes = {
    ...FLOW_NODE_COMPONENTS,
    [GROUP_NODE_TYPE]: MemoizedGroupNode,
};
