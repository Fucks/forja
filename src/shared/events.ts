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

export type ForjaEvent =
    | {
          type: "run.created" | "run.started" | "run.finished";
          runId: string;
          projectId: string;
          flowId: string;
          status: RunStatusName;
      }
    | {
          type: "run.paused";
          runId: string;
          projectId: string;
          reason: "user" | "usage_limit" | "budget";
          resumeAt?: string;
      }
    | { type: "run.resumed"; runId: string; projectId: string }
    | {
          type: "node_run.updated";
          runId: string;
          projectId: string;
          nodeRunId: string;
          nodeId: string;
          workItemId?: string;
          status: NodeRunStatusName;
          attempt: number;
          iteration: number;
      }
    | {
          type: "group.progress";
          runId: string;
          projectId: string;
          groupId: string;
          queued: number;
          running: number;
          succeeded: number;
          failed: number;
      }
    | {
          type: "log.appended";
          runId: string;
          projectId: string;
          nodeRunId: string;
          fromSeq: number;
          toSeq: number;
      }
    | {
          type: "usage.recorded";
          runId: string;
          projectId: string;
          nodeRunId: string;
          inputTokens: number;
          outputTokens: number;
          costUsd: number;
      }
    | { type: "usage.limit_reached"; projectId: string; runId?: string; resetAt?: string }
    | { type: "usage.limit_reset"; projectId: string }
    | { type: "work_item.created" | "work_item.updated"; projectId: string; workItemId: string }
    | {
          type: "approval.requested" | "approval.resolved";
          projectId: string;
          approvalId: string;
          runId: string;
      }
    | {
          type: "trigger.fired";
          projectId: string;
          triggerId: string;
          runId?: string;
          skipped?: boolean;
      }
    | { type: "flow.published"; projectId: string; flowId: string; version: number };

export type ForjaEventType = ForjaEvent["type"];

export interface EventEnvelope {
    id: number;
    at: string;
    event: ForjaEvent;
}
