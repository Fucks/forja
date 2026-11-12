import type { BoardColumnDef } from "@/engine/board_columns.js";
import type { NodeRunStatusName } from "@/shared/events.js";
import type { WorkItem } from "@/shared/work_item_types.js";

export interface BoardCard {
    item: WorkItem;
    columnId: string;
    status?: NodeRunStatusName;
    currentNodeLabel?: string;
    costUsd?: number;
    prUrl?: string;
    runId?: string;
}

// Without a published default flow, flowId is absent and only the fixed columns exist.
export interface BoardView {
    flowId?: string;
    columns: BoardColumnDef[];
    cards: BoardCard[];
}

export interface ItemTimelineEntry {
    runId: string;
    flowName: string;
    nodeRunId: string;
    nodeLabel: string;
    status: NodeRunStatusName;
    iteration: number;
    attempt: number;
    startedAt?: string;
    finishedAt?: string;
    costUsd?: number;
    summary?: string;
}

export interface ItemTimeline {
    entries: ItemTimelineEntry[];
    totalCostUsd: number;
    prUrl?: string;
    spec?: string;
}
