import type { LoopInstanceState } from "@/engine/loop_group.js";
import type { MapGroupState } from "@/engine/map_group.js";
import type { NodeRunState } from "@/engine/node_run_state.js";
import type { RunState } from "@/engine/run_state.js";

export interface SchedulerOptions {
    maxConcurrentAgents: number;
    minStartIntervalMs: number;
    newId(): string;
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
    | { type: "node_run_failed"; nodeRunId: string; error: NodeRunState["error"]; at: Date }
    | { type: "cancel_requested"; at: Date };

export type SchedulerCommand =
    | { type: "start_node_run"; nodeRun: NodeRunState; inputs: Record<string, unknown> }
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
    | { type: "schedule_wakeup"; at: Date };

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
}
