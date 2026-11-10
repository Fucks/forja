import {
    enclosingGroups,
    findNode,
    incomingEdges,
    isMapGroup,
    topologicalOrder,
} from "@/engine/graph_queries.js";
import { NODE_RUN_TERMINAL } from "@/engine/node_run_state.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { FlowGraph, NodeType } from "@/shared/flow_graph.js";
import type { ITEM_DESTINATIONS } from "@/shared/node_configs/output_config.js";
import type { ManualColumn, WorkItem } from "@/shared/work_item_types.js";

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

const MANUAL_COLUMN_IDS: Record<ManualColumn, string> = {
    backlog: BACKLOG_COLUMN.id,
    needs_human: NEEDS_HUMAN_COLUMN.id,
    done: DONE_COLUMN.id,
};

export type ItemOutcome = (typeof ITEM_DESTINATIONS)[number];

const OUTCOME_COLUMN_IDS: Record<ItemOutcome, string> = {
    needs_human: NEEDS_HUMAN_COLUMN.id,
    done: DONE_COLUMN.id,
};

export interface ItemPlacementContext {
    columns: BoardColumnDef[];
    graph: FlowGraph;
    latestNodeRuns: NodeRunState[];
    isBlocked: boolean;
    outcome?: ItemOutcome;
}

export interface ItemPlacement {
    columnId: string;
    status?: NodeRunStatusName;
    currentNodeId?: string;
}

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

export function placeItem(item: WorkItem, context: ItemPlacementContext): ItemPlacement {
    if (item.manualColumn) {
        return { columnId: MANUAL_COLUMN_IDS[item.manualColumn] };
    }
    if (context.outcome) {
        return { columnId: OUTCOME_COLUMN_IDS[context.outcome] };
    }
    if (item.state === "closed") {
        return { columnId: DONE_COLUMN.id };
    }

    const stagePlacement = placeInStageOfCurrentNode(context);
    if (stagePlacement) {
        return stagePlacement;
    }

    return { columnId: context.isBlocked ? BLOCKED_COLUMN.id : BACKLOG_COLUMN.id };
}

function placeInStageOfCurrentNode(context: ItemPlacementContext): ItemPlacement | undefined {
    const columnIds = new Set(context.columns.map((column) => column.id));
    const unfinishedNodeRuns = context.latestNodeRuns.filter(
        (nodeRun) => !NODE_RUN_TERMINAL.has(nodeRun.status),
    );

    for (const nodeId of nodeIdsInFlowOrder(context.graph)) {
        const nodeRun = unfinishedNodeRuns.find((candidate) => candidate.nodeId === nodeId);
        const stage = stageOfNode(context.graph, nodeId);
        if (nodeRun && stage && columnIds.has(stageColumnId(stage))) {
            return {
                columnId: stageColumnId(stage),
                status: nodeRun.status,
                currentNodeId: nodeId,
            };
        }
    }

    return undefined;
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
        id: stageColumnId(stage),
        label: stage.label,
        kind: "stage",
        groupOrNodeId: stage.groupOrNodeId,
    };
}

function stageColumnId(stage: Stage): string {
    return `${STAGE_COLUMN_ID_PREFIX}${stage.groupOrNodeId}`;
}
