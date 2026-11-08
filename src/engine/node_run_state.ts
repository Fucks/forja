import { InvalidTransitionError } from "@/engine/invalid_transition_error.js";
import type { NodeRunStatusName } from "@/shared/events.js";

export const NODE_RUN_ERROR_KINDS = [
    "usage_limit",
    "timeout_total",
    "timeout_idle",
    "structured_output",
    "runtime",
    "workspace",
    "budget",
    "canceled",
    "interrupted",
] as const;

export type NodeRunErrorKind = (typeof NODE_RUN_ERROR_KINDS)[number];

export interface NodeRunError {
    kind: NodeRunErrorKind;
    message: string;
}

export interface GroupPathSegment {
    groupId: string;
    iteration?: number;
}

export interface NodeRunState {
    id: string;
    runId: string;
    nodeId: string;
    workItemId?: string;
    // Iteration of the innermost loop (0 outside loops); attempts start at 1.
    iteration: number;
    attempt: number;
    groupPath: GroupPathSegment[];
    status: NodeRunStatusName;
    queuedAt?: Date;
    startedAt?: Date;
    finishedAt?: Date;
    error?: NodeRunError;
    // Recorded when the node run starts; above 256 KB they are stored as { truncated: true }.
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
}

export const NODE_RUN_TERMINAL: ReadonlySet<NodeRunStatusName> = new Set<NodeRunStatusName>([
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
    "SKIPPED",
]);

const NODE_RUN_TRANSITIONS: Record<NodeRunStatusName, readonly NodeRunStatusName[]> = {
    PENDING: ["QUEUED", "SKIPPED", "CANCELED"],
    QUEUED: ["RUNNING", "CANCELED", "SKIPPED"],
    RUNNING: [
        "SUCCEEDED",
        "FAILED",
        "CANCELED",
        "WAITING_APPROVAL",
        "WAITING_LIMIT",
        "INTERRUPTED",
    ],
    WAITING_APPROVAL: ["SUCCEEDED", "FAILED", "CANCELED"],
    WAITING_LIMIT: ["QUEUED", "CANCELED"],
    INTERRUPTED: ["QUEUED", "CANCELED"],
    SUCCEEDED: [],
    FAILED: [],
    CANCELED: [],
    SKIPPED: [],
};

export function canTransitionNodeRun(from: NodeRunStatusName, to: NodeRunStatusName): boolean {
    return NODE_RUN_TRANSITIONS[from].includes(to);
}

export function transitionNodeRun(
    nodeRun: NodeRunState,
    to: NodeRunStatusName,
    at: Date,
    extra: Partial<NodeRunState> = {},
): NodeRunState {
    if (!canTransitionNodeRun(nodeRun.status, to)) {
        throw new InvalidTransitionError("NodeRun", nodeRun.status, to);
    }

    return { ...nodeRun, ...timestampsOnEntering(nodeRun, to, at), ...extra, status: to };
}

function timestampsOnEntering(
    nodeRun: NodeRunState,
    to: NodeRunStatusName,
    at: Date,
): Pick<NodeRunState, "queuedAt" | "startedAt" | "finishedAt"> {
    if (to === "QUEUED") {
        return { queuedAt: nodeRun.queuedAt ?? at };
    }
    if (to === "RUNNING") {
        return { startedAt: nodeRun.startedAt ?? at };
    }
    if (NODE_RUN_TERMINAL.has(to)) {
        return { finishedAt: at };
    }

    return {};
}
