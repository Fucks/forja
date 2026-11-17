import type { RunBudget, UsageTotals } from "@/engine/budgets.js";
import type { LoopInstanceState } from "@/engine/loop_group.js";
import type { MapGroupState } from "@/engine/map_group.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";
import type { ApprovalDecision } from "@/shared/approval_types.js";
import type { NodeOutputsBySlug } from "@/shared/data_context.js";

export interface SchedulerOptions {
    maxConcurrentAgents: number;
    minStartIntervalMs: number;
    newId(): string;
    budget?: RunBudget;
    usageLimitMarginMinutes: number;
}

// The full work item stays outside the engine; the scheduler only needs to tell items apart.
export interface WorkItemRef {
    id: string;
}

export type SchedulerEvent =
    | { type: "start"; items: WorkItemRef[]; at: Date }
    | {
          type: "node_run_succeeded";
          nodeRunId: string;
          outputs: Record<string, unknown>;
          at: Date;
      }
    | {
          type: "node_run_failed";
          nodeRunId: string;
          error: NodeRunState["error"];
          at: Date;
          // When the usage limit told when it resets.
          resetAt?: Date;
      }
    | { type: "cancel_requested"; at: Date }
    // The running NodeRuns finish; nothing new starts until resume_requested.
    | { type: "pause_requested"; at: Date }
    | { type: "resume_requested"; at: Date }
    | { type: "cancel_node_run_requested"; nodeRunId: string; at: Date }
    // For a FAILED/CANCELED NodeRun of a run still going on, or any finished NodeRun of a
    // FAILED/SUCCEEDED run, which reopens.
    | { type: "retry_node_run_requested"; nodeRunId: string; at: Date }
    // May arrive before the node_run_succeeded of the same NodeRun.
    | { type: "usage_recorded"; nodeRunId: string; costUsd: number; tokens: number; at: Date }
    // The user raised the limits and resumes a run paused by the budget.
    | { type: "budget_raised"; budget: RunBudget; at: Date }
    // The server restarted while the NodeRun was running; its process is gone.
    | { type: "node_run_interrupted"; nodeRunId: string; at: Date }
    // A gate asked for a human decision; without expiresAt it waits for as long as it takes.
    | { type: "node_run_waiting_approval"; nodeRunId: string; expiresAt?: Date; at: Date }
    | {
          type: "approval_resolved";
          nodeRunId: string;
          decision: ApprovalDecision;
          comment?: string;
          at: Date;
      };

export type SchedulerCommand =
    | {
          type: "start_node_run";
          nodeRun: NodeRunState;
          inputs: Record<string, unknown>;
          upstreamOutputs: NodeOutputsBySlug;
      }
    | { type: "cancel_node_run"; nodeRunId: string }
    | { type: "node_run_changed"; nodeRun: NodeRunState }
    | { type: "run_changed"; run: RunState }
    | {
          type: "group_progress";
          groupId: string;
          queued: number;
          running: number;
          succeeded: number;
          failed: number;
      }
    // The executor calls tick(at) at that time.
    | { type: "schedule_wakeup"; at: Date }
    | { type: "usage_limit_reached"; resetAt?: Date; resumeAt: Date }
    | { type: "usage_limit_reset" }
    // The gate stopped waiting without a human decision: it timed out or was canceled.
    | { type: "expire_approval"; nodeRunId: string };

export interface Scheduler {
    handle(event: SchedulerEvent): SchedulerCommand[];
    tick(now: Date): SchedulerCommand[];
    // JSON-serializable, persisted by #49.
    snapshot(): SchedulerSnapshot;
}

type JsonDate<Value> = Value extends Date ? string : Value;
export type JsonDates<Shape> = { [Key in keyof Shape]: JsonDate<Shape[Key]> };

export type StopOutcome = "FAILED" | "CANCELED";

export interface SchedulerSnapshot {
    run: JsonDates<RunState>;
    nodeRuns: JsonDates<NodeRunState>[];
    items?: WorkItemRef[];
    mapGroups?: MapGroupState[];
    loopInstances?: LoopInstanceState[];
    lastAgentStartAt?: string;
    stopOutcome?: StopOutcome;
    timedOutNodeRunIds?: string[];
    usageByNode?: Record<string, UsageTotals>;
    // ISO expiry of each gate NodeRun waiting for an approval that has a timeout.
    approvalDeadlines?: Record<string, string>;
}

export const TRIGGER_ITEMS_PORT = "items";

export interface SchedulerState {
    run: RunState;
    nodeRuns: NodeRunState[];
    items?: WorkItemRef[];
    mapGroups?: MapGroupState[];
    loopInstances?: LoopInstanceState[];
    lastAgentStartAt?: Date;
    stopOutcome?: StopOutcome;
    timedOutNodeRunIds?: string[];
    usageByNode?: Record<string, UsageTotals>;
    approvalDeadlines?: Record<string, string>;
}
