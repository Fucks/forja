export const RUN_STATUS_NAMES = [
    "QUEUED",
    "RUNNING",
    "PAUSED",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
] as const;
export const NODE_RUN_STATUS_NAMES = [
    "PENDING",
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELED",
    "SKIPPED",
    "WAITING_APPROVAL",
    "WAITING_LIMIT",
    "INTERRUPTED",
] as const;
export type RunStatusName = (typeof RUN_STATUS_NAMES)[number];
export type NodeRunStatusName = (typeof NODE_RUN_STATUS_NAMES)[number];
