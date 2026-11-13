import type { FlowEdge, FlowGraph, FlowGroup, FlowNode } from "@/shared/flow_graph.js";
import { connect, createNodeOfType } from "@/test/factories/flow_graph_factory.js";

const GRID_STEP_PX = 240;
const NODE_HEIGHT_PX = 120;
const GROUP_PADDING_PX = 40;
const GROUP_GAP_PX = 80;
const TRIGGER_ID = "trigger";
const MAP_CONCURRENCY = 10;

export interface LargeFlowShape {
    nodes: number;
    groups: number;
}

interface GroupChain {
    group: FlowGroup;
    agents: FlowNode[];
}

// One trigger feeds every map group; inside a group the agents form a chain, one after another.
export function buildLargeFlow({ nodes, groups }: LargeFlowShape): FlowGraph {
    const agentCounts = splitEvenly(nodes - 1, groups);
    const chains = agentCounts.map((agentCount, groupIndex) =>
        buildGroupChain(groupIndex, agentCount),
    );

    return {
        schemaVersion: 1,
        nodes: [
            createNodeOfType("trigger", TRIGGER_ID, { x: 0, y: 0 }),
            ...chains.flatMap((chain) => chain.agents),
        ],
        edges: chains.flatMap((chain) => connectChain(chain.agents)),
        groups: chains.map((chain) => chain.group),
    };
}

function splitEvenly(total: number, parts: number): number[] {
    const smallestPart = Math.floor(total / parts);
    const partsWithOneMore = total % parts;

    return Array.from({ length: parts }, (_, index) =>
        index < partsWithOneMore ? smallestPart + 1 : smallestPart,
    );
}

function buildGroupChain(groupIndex: number, agentCount: number): GroupChain {
    const groupId = `group_${groupIndex}`;
    const groupTopPx = groupIndex * (NODE_HEIGHT_PX + 2 * GROUP_PADDING_PX + GROUP_GAP_PX);
    const agents = Array.from({ length: agentCount }, (_, agentIndex) => {
        const agentId = `${groupId}_agent_${agentIndex}`;
        const position = { x: (agentIndex + 1) * GRID_STEP_PX, y: groupTopPx };
        const agent = createNodeOfType("agent", agentId, position);

        return {
            ...agent,
            label: agentId,
            parentGroupId: groupId,
            config: { ...agent.config, prompt: `Passo ${agentIndex} do item #{{item.number}}` },
        };
    });

    return { group: buildMapGroup(groupId, groupTopPx, agentCount), agents };
}

function buildMapGroup(groupId: string, groupTopPx: number, agentCount: number): FlowGroup {
    return {
        id: groupId,
        kind: "map",
        label: groupId,
        position: { x: GRID_STEP_PX - GROUP_PADDING_PX, y: groupTopPx - GROUP_PADDING_PX },
        size: {
            width: agentCount * GRID_STEP_PX + 2 * GROUP_PADDING_PX,
            height: NODE_HEIGHT_PX + 2 * GROUP_PADDING_PX,
        },
        config: { concurrency: MAP_CONCURRENCY, barrier: false, failFast: false },
    };
}

function connectChain(agents: FlowNode[]): FlowEdge[] {
    return agents.map((agent, index) => {
        const previousAgent = agents[index - 1];
        if (!previousAgent) {
            return connect([TRIGGER_ID, "items"], [agent.id, "item"]);
        }

        return connect([previousAgent.id, "summary"], [agent.id, "context"]);
    });
}
