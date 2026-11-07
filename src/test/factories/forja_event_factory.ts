import type { ForjaEvent } from "@/shared/events.js";

type RunLifecycleEvent = Extract<
    ForjaEvent,
    { type: "run.created" | "run.started" | "run.finished" }
>;

export function buildRunStartedEvent(
    overrides: Partial<RunLifecycleEvent> = {},
): RunLifecycleEvent {
    return {
        type: "run.started",
        runId: "run-1",
        projectId: "project-1",
        flowId: "flow-1",
        status: "RUNNING",
        ...overrides,
    };
}
