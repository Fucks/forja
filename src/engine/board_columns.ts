import {
    enclosingGroups,
    findNode,
    incomingEdges,
    isMapGroup,
    topologicalOrder,
} from "@/engine/graph_queries.js";
import type { FlowGraph, NodeType } from "@/shared/flow_graph.js";

export type BoardColumnKind = "backlog" | "blocked" | "stage" | "needs_human" | "done";

export interface BoardColumnDef {
    id: string;
    label: string;
    kind: BoardColumnKind;
    groupOrNodeId?: string;
}

const BACKLOG_COLUMN: BoardColumnDef = { id: "backlog", label: "Backlog", kind: "backlog" };
const BLOCKED_COLUMN: BoardColumnDef = { id: "blocked", label: "Bloqueado", kind: "blocked" };
const NEEDS_HUMAN_COLUMN: BoardColumnDef = {
    id: "needs_human",
    label: "Precisa de humano",
    kind: "needs_human",
};
const DONE_COLUMN: BoardColumnDef = { id: "done", label: "Concluído", kind: "done" };

const STAGE_COLUMN_ID_PREFIX = "stage:";

// Outside maps, only the steps a person would recognize as a phase of the work get a column.
const STAGE_NODE_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(["agent", "gate", "git"]);

interface Stage {
    groupOrNodeId: string;
    label: string;
}

export function deriveColumns(graph: FlowGraph): BoardColumnDef[] {
    return [
        BACKLOG_COLUMN,
        BLOCKED_COLUMN,
        ...stageColumns(graph),
        NEEDS_HUMAN_COLUMN,
        DONE_COLUMN,
    ];
}

function stageColumns(graph: FlowGraph): BoardColumnDef[] {
    const stagesInOrder = nodeIdsInFlowOrder(graph).flatMap((nodeId) => {
        const stage = stageOfNode(graph, nodeId);
        return stage ? [stage] : [];
    });
    const uniqueStages = new Map(stagesInOrder.map((stage) => [stage.groupOrNodeId, stage]));

    return [...uniqueStages.values()].map(toStageColumn);
}

// A node without incoming edges inside a map is fed by the item of the map, so its place in the
// topological order says nothing about when the item reaches it.
function nodeIdsInFlowOrder(graph: FlowGraph): string[] {
    const nodeIds = topologicalOrder(graph);
    const isFedByEdge = (nodeId: string): boolean => incomingEdges(graph, nodeId).length > 0;

    return [...nodeIds.filter(isFedByEdge), ...nodeIds.filter((nodeId) => !isFedByEdge(nodeId))];
}

function stageOfNode(graph: FlowGraph, nodeId: string): Stage | undefined {
    const outermostMap = enclosingGroups(graph, nodeId).findLast(isMapGroup);
    if (outermostMap) {
        return { groupOrNodeId: outermostMap.id, label: outermostMap.label };
    }

    const node = findNode(graph, nodeId);
    if (!node || !STAGE_NODE_TYPES.has(node.type)) {
        return undefined;
    }

    return { groupOrNodeId: node.id, label: node.label };
}

function toStageColumn(stage: Stage): BoardColumnDef {
    return {
        id: `${STAGE_COLUMN_ID_PREFIX}${stage.groupOrNodeId}`,
        label: stage.label,
        kind: "stage",
        groupOrNodeId: stage.groupOrNodeId,
    };
}
