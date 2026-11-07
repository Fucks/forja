import type { RunState } from "@/engine/run_state.js";

const RUN_CREATED_AT = new Date("2026-01-01T12:00:00Z");

export function buildRunState(overrides: Partial<RunState> = {}): RunState {
    return {
        id: "run-1",
        projectId: "project-1",
        flowId: "flow-1",
        flowVersion: 1,
        status: "QUEUED",
        createdAt: RUN_CREATED_AT,
        ...overrides,
    };
}
